import * as sdk from "matrix-js-sdk";
import { config } from '../utils/config.js';

/**
 * MatrixService — Wrapper around the Matrix JS SDK
 * Handles auth, sync, rooms, messaging, and E2E encryption.
 */
class MatrixService {
    constructor() {
        this.client = null;
        this.homeserverUrl = config.matrixUrl;
        this._listeners = {};
    }

    // ─── Event Emitter ───
    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }

    _emit(event, ...args) {
        if (!this._listeners[event]) return;
        this._listeners[event].forEach(cb => cb(...args));
    }

    // ─── Auth ───
    setHomeserverUrl(url) {
        this.homeserverUrl = url;
    }

    async login(username, password) {
        const tempClient = sdk.createClient({ baseUrl: this.homeserverUrl });

        try {
            const response = await tempClient.login("m.login.password", {
                user: username,
                password: password,
            });

            this._initClient(response);

            // Persist session
            localStorage.setItem('mx_session', JSON.stringify({
                homeserverUrl: this.homeserverUrl,
                accessToken: response.access_token,
                userId: response.user_id,
                deviceId: response.device_id,
            }));

            console.log("Authentication successful!", response.user_id);
            return { success: true, userId: response.user_id };
        } catch (error) {
            console.error("Login failed:", error);
            return { success: false, error: error.message || 'Login failed' };
        }
    }

    async register(username, password) {
        const tempClient = sdk.createClient({ baseUrl: this.homeserverUrl });

        try {
            const response = await tempClient.register(username, password, null, {
                type: "m.login.dummy",
            });

            this._initClient(response);

            localStorage.setItem('mx_session', JSON.stringify({
                homeserverUrl: this.homeserverUrl,
                accessToken: response.access_token,
                userId: response.user_id,
                deviceId: response.device_id,
            }));

            return { success: true, userId: response.user_id };
        } catch (error) {
            // Matrix registration returns 401 with flows — try the auth
            if (error.httpStatus === 401 && error.data?.flows) {
                try {
                    const response = await tempClient.register(username, password, error.data.session, {
                        type: "m.login.dummy",
                    });
                    this._initClient(response);

                    localStorage.setItem('mx_session', JSON.stringify({
                        homeserverUrl: this.homeserverUrl,
                        accessToken: response.access_token,
                        userId: response.user_id,
                        deviceId: response.device_id,
                    }));

                    return { success: true, userId: response.user_id };
                } catch (err2) {
                    return { success: false, error: err2.message || 'Registration failed' };
                }
            }
            return { success: false, error: error.message || 'Registration failed' };
        }
    }

    /**
     * Restore a previously saved session
     */
    restoreSession() {
        const raw = localStorage.getItem('mx_session');
        if (!raw) return false;

        try {
            const session = JSON.parse(raw);
            this.homeserverUrl = session.homeserverUrl;
            this._initClient(session);
            return true;
        } catch {
            localStorage.removeItem('mx_session');
            return false;
        }
    }

    _initClient(creds) {
        this.client = sdk.createClient({
            baseUrl: this.homeserverUrl,
            accessToken: creds.accessToken || creds.access_token,
            userId: creds.userId || creds.user_id,
            deviceId: creds.deviceId || creds.device_id,
        });
    }

    /**
     * Initialize the Rust crypto backend for end-to-end encryption.
     * Must be called before startClient().
     */
    async _initCrypto() {
        if (!this.client) return;
        try {
            await this.client.initRustCrypto();
            // Automatically verify our own device & trust cross-signed devices
            this.client.getCrypto()?.setDeviceVerificationForUsers?.([this.userId], true);
            console.log('✅ E2E encryption initialized (Rust crypto)');
        } catch (err) {
            console.error('❌ Failed to initialize E2E encryption:', err);
        }
    }

    async logout() {
        if (this.client) {
            try { this.client.stopClient(); } catch { }
            try { await this.client.logout(); } catch { }
        }
        this.client = null;
        localStorage.removeItem('mx_session');
        this._emit('logout');
    }

    get userId() {
        return this.client?.getUserId?.() || this.client?.credentials?.userId || null;
    }

    // ─── Sync ───
    async startSync() {
        if (!this.client) throw new Error("Must login before starting sync.");

        // Initialize E2E encryption before starting sync
        await this._initCrypto();

        await this.client.startClient({ initialSyncLimit: 30 });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Sync timed out')), 30000);

            this.client.once("sync", (state) => {
                clearTimeout(timeout);
                if (state === "PREPARED") {
                    console.log("Matrix client synced and ready.");
                    this._setupListeners();
                    resolve();
                }
            });
        });
    }

    _setupListeners() {
        // Live timeline events (handles both plaintext and decrypted messages)
        this.client.on("Room.timeline", (event, room, toStartOfTimeline) => {
            if (toStartOfTimeline) return;

            const type = event.getType();
            // Accept both plaintext messages and encrypted messages (once decrypted)
            if (type !== "m.room.message" && type !== "m.room.encrypted") return;

            // If still encrypted (decryption pending/failed), show placeholder
            const content = event.getContent();
            const body = type === "m.room.encrypted" && !content.body
                ? '🔒 Unable to decrypt this message'
                : content.body;

            this._emit('message', {
                id: event.getId(),
                roomId: room.roomId,
                sender: event.getSender(),
                body: body,
                msgtype: content.msgtype || 'm.text',
                timestamp: event.getDate(),
                encrypted: event.isEncrypted(),
            });
        });

        // Room list changes
        this.client.on("Room", () => {
            this._emit('roomsChanged', this.getRooms());
        });

        // Room membership changes — auto-accept invites (Discord-like behavior)
        this.client.on("RoomMember.membership", (event, member) => {
            if (member.userId === this.userId && member.membership === 'invite') {
                console.log('Auto-accepting invite to', member.roomId);
                this.client.joinRoom(member.roomId).then(() => {
                    this._emit('roomsChanged', this.getRooms());
                }).catch(err => {
                    console.error('Failed to auto-accept invite:', err);
                });
            }
            this._emit('roomsChanged', this.getRooms());
        });
    }

    // ─── Rooms ───
    getRooms() {
        if (!this.client) return [];
        return this.client.getRooms()
            .filter(room => {
                const membership = room.getMyMembership();
                return membership === 'join';
            })
            .map(room => ({
                id: room.roomId,
                name: room.name || 'Unnamed Room',
                topic: room.currentState?.getStateEvents('m.room.topic', '')?.getContent()?.topic || '',
                memberCount: room.getJoinedMemberCount(),
                lastEvent: room.timeline?.[room.timeline.length - 1],
            }))
            .sort((a, b) => {
                const timeA = a.lastEvent?.getDate?.()?.getTime() || 0;
                const timeB = b.lastEvent?.getDate?.()?.getTime() || 0;
                return timeB - timeA;
            });
    }

    getRoomMembers(roomId) {
        if (!this.client) return [];
        const room = this.client.getRoom(roomId);
        if (!room) return [];

        return room.getJoinedMembers().map(member => ({
            userId: member.userId,
            name: member.name || member.userId,
            membership: member.membership,
        }));
    }

    getRoomMessages(roomId, limit = 50) {
        if (!this.client) return [];
        const room = this.client.getRoom(roomId);
        if (!room) return [];

        return room.timeline
            .filter(event => {
                const type = event.getType();
                return type === 'm.room.message' || type === 'm.room.encrypted';
            })
            .slice(-limit)
            .map(event => {
                const content = event.getContent();
                const type = event.getType();
                const body = type === 'm.room.encrypted' && !content.body
                    ? '🔒 Unable to decrypt this message'
                    : content.body;
                return {
                    id: event.getId(),
                    roomId: roomId,
                    sender: event.getSender(),
                    body: body,
                    msgtype: content.msgtype || 'm.text',
                    timestamp: event.getDate(),
                    encrypted: event.isEncrypted(),
                };
            });
    }

    // ─── Messaging ───
    async sendMessage(roomId, body) {
        if (!this.client) throw new Error("Not logged in");
        await this.client.sendTextMessage(roomId, body);
    }

    // ─── Room Management ───
    async createRoom(name, topic = '') {
        if (!this.client) throw new Error("Not logged in");

        const opts = {
            name,
            visibility: 'public',
            preset: 'public_chat',
            room_alias_name: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            // Enable E2E encryption for all new rooms
            initial_state: [{
                type: 'm.room.encryption',
                state_key: '',
                content: {
                    algorithm: 'm.megolm.v1.aes-sha2',
                },
            }],
        };

        if (topic) {
            opts.topic = topic;
        }

        const result = await this.client.createRoom(opts);
        return result.room_id;
    }

    /**
     * Check if a room has E2E encryption enabled.
     */
    isRoomEncrypted(roomId) {
        if (!this.client) return false;
        const room = this.client.getRoom(roomId);
        return room?.hasEncryptionStateEvent?.() || false;
    }

    /**
     * Get all public rooms on the server (the room directory).
     * Returns rooms the user hasn't joined yet.
     */
    async getPublicRooms() {
        if (!this.client) return [];
        try {
            const response = await this.client.publicRooms({
                limit: 100,
            });
            const joinedIds = new Set(this.getRooms().map(r => r.id));
            return (response.chunk || []).map(room => ({
                id: room.room_id,
                name: room.name || 'Unnamed Room',
                topic: room.topic || '',
                memberCount: room.num_joined_members || 0,
                alias: room.canonical_alias || '',
                joined: joinedIds.has(room.room_id),
            }));
        } catch (err) {
            console.error('Failed to fetch public rooms:', err);
            return [];
        }
    }

    async joinRoom(roomIdOrAlias) {
        if (!this.client) throw new Error("Not logged in");
        await this.client.joinRoom(roomIdOrAlias);
    }

    async inviteUser(roomId, userId) {
        if (!this.client) throw new Error("Not logged in");
        if (!userId.startsWith('@')) {
            const serverName = this.userId.split(':')[1];
            userId = `@${userId}:${serverName}`;
        } else if (!userId.includes(':')) {
            const serverName = this.userId.split(':')[1];
            userId = `${userId}:${serverName}`;
        }
        await this.client.invite(roomId, userId);
    }
}

export const matrixService = new MatrixService();
