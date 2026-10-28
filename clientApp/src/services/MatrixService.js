import * as sdk from "matrix-js-sdk";
import { MatrixEventEvent } from "matrix-js-sdk";
import { config } from '../utils/config.js';

const UNDECRYPTABLE_BODY = '🔒 Unable to decrypt this message';
const DECRYPTING_BODY = '🔒 Decrypting…';

/**
 * MatrixService — Wrapper around the Matrix JS SDK
 * Handles auth, sync, rooms, Spaces, rich media messaging, scrollback, and E2E encryption.
 */
class MatrixService {
    constructor() {
        this.client = null;
        this.homeserverUrl = config.matrixUrl;
        this._listeners = {};
        this._mediaBlobCache = new Map();
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
            console.log('✅ E2E encryption initialized (Rust crypto)');
        } catch (err) {
            console.error('❌ Failed to initialize E2E encryption:', err);
        }
    }

    _clearMediaCache() {
        for (const url of this._mediaBlobCache.values()) {
            try { URL.revokeObjectURL(url); } catch { }
        }
        this._mediaBlobCache.clear();
    }

    async logout() {
        this._clearMediaCache();
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

        // Fail fast if the saved access token is no longer valid (e.g. the
        // session was logged out server-side). Otherwise the sync loop just
        // retries 401s forever and the loading screen never goes away.
        try {
            await this.client.whoami();
        } catch (err) {
            if (this._isAuthError(err)) {
                this._discardSession();
                throw new Error('Session expired — please log in again.');
            }
            // Other errors (server unreachable, etc.) are handled by the sync below.
        }

        // Initialize E2E encryption before starting sync
        await this._initCrypto();

        await this.client.startClient({ initialSyncLimit: 30 });

        return new Promise((resolve, reject) => {
            const client = this.client;

            const finish = (err) => {
                clearTimeout(timeout);
                client.removeListener("sync", onSync);
                if (err) {
                    this._stopClient();
                    reject(err);
                } else {
                    resolve();
                }
            };

            // Transient errors (server briefly unreachable) are retried by the
            // SDK, so only give up on them once this timeout elapses.
            const timeout = setTimeout(() => finish(new Error('Sync timed out')), 30000);

            // Keep listening until a terminal state. The previous `once("sync")`
            // hung forever if the first reported state wasn't PREPARED.
            const onSync = (state, _prevState, data) => {
                if (state === "PREPARED") {
                    console.log("Matrix client synced and ready.");
                    this._setupListeners();
                    finish();
                } else if (state === "ERROR" && this._isAuthError(data?.error)) {
                    this._discardSession();
                    finish(new Error('Session expired — please log in again.'));
                } else if (state === "STOPPED") {
                    finish(new Error('Sync stopped'));
                }
            };
            client.on("sync", onSync);
        });
    }

    _isAuthError(err) {
        return err?.httpStatus === 401 || err?.errcode === 'M_UNKNOWN_TOKEN';
    }

    _stopClient() {
        try { this.client?.stopClient(); } catch { }
    }

    /**
     * Stop the client and forget the saved session locally (no server call).
     */
    _discardSession() {
        this._clearMediaCache();
        this._stopClient();
        this.client = null;
        localStorage.removeItem('mx_session');
    }

    // ─── Message helpers ───
    _isMessageLike(event) {
        const type = event.getType();
        return type === 'm.room.message' || type === 'm.room.encrypted';
    }

    /** True while the SDK still has (or is about to have) a decryption attempt in flight. */
    _isPendingDecryption(event) {
        return event.isBeingDecrypted() || event.shouldAttemptDecryption();
    }

    /**
     * Convert a MatrixEvent into the plain message object used by the UI.
     */
    _toMessage(event, roomId) {
        const content = event.getContent();
        const pending = this._isPendingDecryption(event);

        let body = content.body;
        if (pending) {
            body = DECRYPTING_BODY;
        } else if (event.isDecryptionFailure() || (event.getType() === 'm.room.encrypted' && !body)) {
            body = UNDECRYPTABLE_BODY;
        }

        return {
            id: event.getId(),
            roomId,
            sender: event.getSender(),
            body,
            msgtype: content.msgtype || 'm.text',
            mxcUrl: content.url || content.file?.url || null,
            info: content.info || null,
            filename: content.filename || content.body || 'attachment',
            timestamp: event.getDate(),
            encrypted: event.isEncrypted(),
            pending,
        };
    }

    _setupListeners() {
        // Live timeline events (emit immediately in timeline order; update in-place on decrypt)
        this.client.on("Room.timeline", (event, room, toStartOfTimeline) => {
            if (toStartOfTimeline) return;
            if (!this._isMessageLike(event)) return;

            this._emit('message', this._toMessage(event, room.roomId));

            if (this._isPendingDecryption(event)) {
                event.once(MatrixEventEvent.Decrypted, () => {
                    this._emit('messageUpdated', this._toMessage(event, room.roomId));
                });
            }
        });

        // Room list & space hierarchy changes
        this.client.on("Room", () => {
            this._emit('roomsChanged', this.getRooms());
        });

        this.client.on("RoomState.events", (event) => {
            const type = event.getType?.();
            if (type === 'm.space.child' || type === 'm.room.name' || type === 'm.room.topic') {
                this._emit('roomsChanged', this.getRooms());
            }
        });

        this.client.on("Room.receipt", () => {
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

    // ─── Spaces (Discord-style Servers) ───
    _isSpace(room) {
        if (room.isSpaceRoom?.()) return true;
        const createEvent = room.currentState?.getStateEvents('m.room.create', '');
        return createEvent?.getContent()?.type === 'm.space';
    }

    getSpaces() {
        if (!this.client) return [];
        return this.client.getRooms()
            .filter(room => room.getMyMembership() === 'join' && this._isSpace(room))
            .map(room => ({
                id: room.roomId,
                name: room.name || 'Unnamed Space',
                topic: room.currentState?.getStateEvents('m.room.topic', '')?.getContent()?.topic || '',
            }));
    }

    getSpaceChildRoomIds(spaceId) {
        if (!this.client || !spaceId) return new Set();
        const space = this.client.getRoom(spaceId);
        if (!space) return new Set();
        const events = space.currentState?.getStateEvents('m.space.child') || [];
        const list = Array.isArray(events) ? events : [events];
        const childIds = new Set();
        for (const ev of list) {
            const via = ev?.getContent?.()?.via;
            const stateKey = ev?.getStateKey?.();
            if (stateKey && Array.isArray(via) && via.length > 0) {
                childIds.add(stateKey);
            }
        }
        return childIds;
    }

    async createSpace(name, topic = '') {
        if (!this.client) throw new Error("Not logged in");
        const result = await this.client.createRoom({
            name,
            topic: topic || undefined,
            visibility: 'public',
            preset: 'public_chat',
            creation_content: { type: 'm.space' },
        });
        return result.room_id;
    }

    async addRoomToSpace(spaceId, roomId) {
        if (!this.client) throw new Error("Not logged in");
        const serverName = (this.userId || '').split(':')[1] || 'nexus.local';
        await this.client.sendStateEvent(spaceId, 'm.space.child', { via: [serverName] }, roomId);
        this._emit('roomsChanged', this.getRooms());
    }

    // ─── Rooms ───
    getRooms() {
        if (!this.client) return [];
        return this.client.getRooms()
            .filter(room => room.getMyMembership() === 'join' && !this._isSpace(room))
            .map(room => ({
                id: room.roomId,
                name: room.name || 'Unnamed Room',
                topic: room.currentState?.getStateEvents('m.room.topic', '')?.getContent()?.topic || '',
                memberCount: room.getJoinedMemberCount(),
                unreadCount: room.getUnreadNotificationCount?.('total') || 0,
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

    /**
     * Get recent messages for a room. Messages still being decrypted are
     * returned with a placeholder and a `messageUpdated` event is emitted
     * once each one finishes decrypting.
     */
    getRoomMessages(roomId, limit = 50) {
        if (!this.client) return [];
        const room = this.client.getRoom(roomId);
        if (!room) return [];

        return room.timeline
            .filter(event => this._isMessageLike(event))
            .slice(-limit)
            .map(event => {
                const message = this._toMessage(event, roomId);
                if (message.pending) {
                    event.once(MatrixEventEvent.Decrypted, () => {
                        this._emit('messageUpdated', this._toMessage(event, roomId));
                    });
                }
                return message;
            });
    }

    /**
     * Paginate older history for a room.
     */
    async loadMoreMessages(roomId, limit = 30) {
        const room = this.client?.getRoom(roomId);
        if (!room) return { messages: [], canLoadMore: false };

        try {
            await this.client.scrollback(room, limit);
        } catch (err) {
            console.warn('Scrollback error:', err);
        }

        return {
            messages: this.getRoomMessages(roomId, 200),
            canLoadMore: Boolean(room.oldState?.paginationToken),
        };
    }

    /**
     * Send a read receipt for the latest timeline event in a room.
     */
    async markRoomRead(roomId) {
        const room = this.client?.getRoom(roomId);
        if (!room || !room.timeline?.length) return;

        for (let i = room.timeline.length - 1; i >= 0; i--) {
            const ev = room.timeline[i];
            const id = ev?.getId?.();
            if (id && !id.startsWith('~')) {
                try {
                    await this.client.sendReadReceipt(ev);
                } catch {
                    // Ignore receipt errors
                }
                break;
            }
        }
    }

    // ─── Messaging & Media ───
    async sendMessage(roomId, body) {
        if (!this.client) throw new Error("Not logged in");
        await this.client.sendTextMessage(roomId, body);
    }

    async sendFileMessage(roomId, file) {
        if (!this.client) throw new Error("Not logged in");
        const uploadRes = await this.client.uploadContent(file);
        const contentUri = typeof uploadRes === 'string' ? uploadRes : uploadRes.content_uri;
        const mime = file.type || 'application/octet-stream';

        let msgtype = 'm.file';
        if (mime.startsWith('image/')) msgtype = 'm.image';
        else if (mime.startsWith('video/')) msgtype = 'm.video';
        else if (mime.startsWith('audio/')) msgtype = 'm.audio';

        await this.client.sendMessage(roomId, {
            msgtype,
            body: file.name,
            filename: file.name,
            url: contentUri,
            info: {
                mimetype: mime,
                size: file.size,
            },
        });
    }

    async fetchMediaObjectUrl(mxcUrl) {
        if (!mxcUrl || !mxcUrl.startsWith('mxc://') || !this.client) return null;
        if (this._mediaBlobCache.has(mxcUrl)) {
            return this._mediaBlobCache.get(mxcUrl);
        }

        const withoutScheme = mxcUrl.slice('mxc://'.length);
        const slashIdx = withoutScheme.indexOf('/');
        if (slashIdx === -1) return null;
        const server = withoutScheme.slice(0, slashIdx);
        const mediaId = withoutScheme.slice(slashIdx + 1);

        const token = this.client.getAccessToken?.();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const urls = [
            `${this.homeserverUrl}/_matrix/client/v1/media/download/${encodeURIComponent(server)}/${encodeURIComponent(mediaId)}`,
            `${this.homeserverUrl}/_matrix/media/v3/download/${encodeURIComponent(server)}/${encodeURIComponent(mediaId)}`,
        ];

        for (const url of urls) {
            try {
                const res = await fetch(url, { headers });
                if (res.ok) {
                    const blob = await res.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    this._mediaBlobCache.set(mxcUrl, objectUrl);
                    return objectUrl;
                }
            } catch {
                // try fallback endpoint
            }
        }
        return null;
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
            return (response.chunk || [])
                .filter(room => room.room_type !== 'm.space')
                .map(room => ({
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
