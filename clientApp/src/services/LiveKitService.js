import {
    Room,
    RoomEvent,
    Track,
    ConnectionState,
    createLocalScreenTracks,
} from 'livekit-client';
import { config } from '../utils/config.js';

/**
 * LiveKitService — Manages voice chat and screen sharing via LiveKit SFU
 */
class LiveKitService {
    constructor() {
        /** @type {Room|null} */
        this.room = null;
        this.currentRoomName = null;
        this.currentRoomDisplayName = null;
        this.connected = false;
        this.muted = false;
        this.deafened = false;
        this.screenSharing = false;
        this._screenTrack = null;
        this._listeners = {};

        /** @type {Record<string, Array<{identity: string, name: string, isScreenSharing: boolean}>>} */
        this.roomParticipantsMap = {};
        this._statusPollInterval = null;

        this.livekitUrl = config.livekitUrl;
        this.tokenServerUrl = config.tokenServerUrl;
    }

    // ─── Event Emitter ───
    on(event, cb) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
    }

    off(event, cb) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(fn => fn !== cb);
    }

    _emit(event, ...args) {
        (this._listeners[event] || []).forEach(cb => cb(...args));
    }

    _getAuthHeader() {
        const session = localStorage.getItem('mx_session');
        if (session) {
            try {
                const { accessToken } = JSON.parse(session);
                if (accessToken) return `Bearer ${accessToken}`;
            } catch { /* ignore parse errors */ }
        }
        return null;
    }

    // ─── Pre-Join Voice Presence Polling ───
    async fetchVoiceStatus() {
        const auth = this._getAuthHeader();
        if (!auth) return;

        try {
            const res = await fetch(`${this.tokenServerUrl}/voice-status`, {
                headers: { Authorization: auth },
            });
            if (!res.ok) return;
            const data = await res.json();
            const nextMap = data.rooms || {};
            const prevJson = JSON.stringify(this.roomParticipantsMap);
            const nextJson = JSON.stringify(nextMap);
            this.roomParticipantsMap = nextMap;
            if (prevJson !== nextJson) {
                this._emit('voiceStatusChanged', this.roomParticipantsMap);
            }
        } catch {
            // Silently ignore network errors during background polling
        }
    }

    startVoiceStatusPolling(intervalMs = 5000) {
        this.stopVoiceStatusPolling();
        this.fetchVoiceStatus();
        this._statusPollInterval = setInterval(() => {
            this.fetchVoiceStatus();
        }, intervalMs);
    }

    stopVoiceStatusPolling() {
        if (this._statusPollInterval) {
            clearInterval(this._statusPollInterval);
            this._statusPollInterval = null;
        }
    }

    getRoomVoiceParticipants(roomId) {
        if (this.connected && this.currentRoomName === roomId) {
            return this.getParticipants();
        }
        return this.roomParticipantsMap[roomId] || [];
    }

    /**
     * Request a LiveKit access token from the token server.
     * Sends the Matrix access token for authentication.
     */
    async _getToken(roomName) {
        const headers = { 'Content-Type': 'application/json' };
        const auth = this._getAuthHeader();
        if (auth) headers['Authorization'] = auth;

        const res = await fetch(`${this.tokenServerUrl}/token`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ roomName }),
        });
        if (!res.ok) {
            let errMsg = `Failed to get token (HTTP ${res.status})`;
            try {
                const errData = await res.json();
                if (errData?.error) errMsg = errData.error;
            } catch { /* ignore */ }
            const err = new Error(errMsg);
            err.status = res.status;
            throw err;
        }
        const data = await res.json();
        return data.token;
    }

    // ─── Connect / Disconnect ───
    async joinVoice(roomName, displayName = null) {
        if (this.connected) {
            await this.leaveVoice();
        }

        const MAX_RETRIES = 3;
        const RETRY_DELAY = 2000;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                this._emit('connecting', { attempt, maxRetries: MAX_RETRIES });

                const token = await this._getToken(roomName);

                this.room = new Room({
                    adaptiveStream: true,
                    dynacast: true,
                    rtcConfig: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                        ],
                    },
                });

                this._setupRoomEvents();

                await this.room.connect(this.livekitUrl, token, {
                    autoSubscribe: true,
                    peerConnectionTimeout: 15000,
                });

                this.currentRoomName = roomName;
                this.currentRoomDisplayName = displayName || roomName;
                this.connected = true;
                this.muted = false;
                this.deafened = false;

                // Enable microphone
                await this.room.localParticipant.setMicrophoneEnabled(true);

                this._emit('connected', {
                    roomName,
                    displayName: this.currentRoomDisplayName,
                    participants: this.getParticipants(),
                });

                this.fetchVoiceStatus();

                return true;
            } catch (err) {
                console.warn(`Voice connection attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);

                // Clean up the failed room before retrying
                if (this.room) {
                    try { this.room.disconnect(); } catch { /* ignore */ }
                    this.room = null;
                }

                // Do not retry client/authorization errors (4xx)
                const isClientError = err?.status >= 400 && err?.status < 500;
                if (!isClientError && attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, RETRY_DELAY));
                } else {
                    console.error('Failed to join voice:', err);
                    this._emit('error', err.message);
                    return false;
                }
            }
        }
    }

    async leaveVoice() {
        if (this._screenTrack) {
            await this.stopScreenShare();
        }

        if (this.room) {
            this.room.disconnect();
            this.room = null;
        }

        this.currentRoomName = null;
        this.currentRoomDisplayName = null;
        this.connected = false;
        this.muted = false;
        this.deafened = false;
        this.screenSharing = false;

        this._emit('disconnected');
        this.fetchVoiceStatus();
    }

    // ─── Mic Controls ───
    async toggleMute() {
        if (!this.room) return;
        this.muted = !this.muted;
        await this.room.localParticipant.setMicrophoneEnabled(!this.muted);
        this._emit('muteChanged', this.muted);
    }

    // ─── Deafen ───
    toggleDeafen() {
        if (!this.room) return;
        this.deafened = !this.deafened;

        // Mute/unmute all remote audio tracks
        this.room.remoteParticipants.forEach(participant => {
            participant.audioTrackPublications.forEach(pub => {
                if (pub.track) {
                    pub.track.mediaStreamTrack.enabled = !this.deafened;
                }
            });
        });

        // Also mute mic when deafening (Discord behavior)
        if (this.deafened && !this.muted) {
            this.muted = true;
            this.room.localParticipant.setMicrophoneEnabled(false);
            this._emit('muteChanged', this.muted);
        }

        this._emit('deafenChanged', this.deafened);
    }

    // ─── Screen Share ───
    async startScreenShare() {
        if (!this.room || this.screenSharing) return false;

        try {
            const tracks = await createLocalScreenTracks({ audio: true });
            for (const track of tracks) {
                await this.room.localParticipant.publishTrack(track);
                if (track.kind === Track.Kind.Video) {
                    this._screenTrack = track;
                }
            }

            this.screenSharing = true;
            this._emit('screenShareChanged', true);
            this.fetchVoiceStatus();
            return true;
        } catch (err) {
            // User cancelled the screen share picker
            console.log('Screen share cancelled or failed:', err.message);
            return false;
        }
    }

    async stopScreenShare() {
        if (!this.room || !this.screenSharing) return;

        // Unpublish screen tracks
        const localPub = this.room.localParticipant;
        const screenPubs = Array.from(localPub.trackPublications.values())
            .filter(pub => pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio);

        for (const pub of screenPubs) {
            await localPub.unpublishTrack(pub.track);
            pub.track.stop();
        }

        this._screenTrack = null;
        this.screenSharing = false;
        this._emit('screenShareChanged', false);
        this.fetchVoiceStatus();
    }

    // ─── Participants ───
    getParticipants() {
        if (!this.room) return [];

        const participants = [];

        // Local participant
        const local = this.room.localParticipant;
        participants.push({
            identity: local.identity,
            name: local.name || local.identity,
            isLocal: true,
            isSpeaking: local.isSpeaking,
            isMuted: !local.isMicrophoneEnabled,
            isScreenSharing: local.isScreenShareEnabled,
        });

        // Remote participants
        this.room.remoteParticipants.forEach(p => {
            participants.push({
                identity: p.identity,
                name: p.name || p.identity,
                isLocal: false,
                isSpeaking: p.isSpeaking,
                isMuted: !p.isMicrophoneEnabled,
                isScreenSharing: p.isScreenShareEnabled,
            });
        });

        return participants;
    }

    /**
     * Get the active screen share video track (from any participant)
     */
    getScreenShareTrack() {
        if (!this.room) return null;

        // Check local first
        for (const [, pub] of this.room.localParticipant.trackPublications) {
            if (pub.source === Track.Source.ScreenShare && pub.track) {
                return { track: pub.track, participantName: this.room.localParticipant.name || this.room.localParticipant.identity };
            }
        }

        // Check remotes
        for (const [, participant] of this.room.remoteParticipants) {
            for (const [, pub] of participant.trackPublications) {
                if (pub.source === Track.Source.ScreenShare && pub.track) {
                    return { track: pub.track, participantName: participant.name || participant.identity };
                }
            }
        }

        return null;
    }

    // ─── Room Event Wiring ───
    _setupRoomEvents() {
        if (!this.room) return;

        this.room.on(RoomEvent.ParticipantConnected, (participant) => {
            this._emit('participantJoined', participant.identity);
            this._emit('participantsChanged', this.getParticipants());
            this.fetchVoiceStatus();
        });

        this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
            this._emit('participantLeft', participant.identity);
            this._emit('participantsChanged', this.getParticipants());
            this.fetchVoiceStatus();
        });

        this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === Track.Kind.Audio) {
                // Attach remote audio to a hidden audio element to play it
                const audioEl = track.attach();
                audioEl.id = `audio-${participant.identity}`;
                audioEl.style.display = 'none';
                document.body.appendChild(audioEl);

                // If deafened, mute the track
                if (this.deafened) {
                    track.mediaStreamTrack.enabled = false;
                }
            }

            if (publication.source === Track.Source.ScreenShare) {
                this._emit('screenShareStarted', {
                    participantName: participant.name || participant.identity,
                    track,
                });
            }

            this._emit('participantsChanged', this.getParticipants());
            this.fetchVoiceStatus();
        });

        this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
            // Remove attached audio element
            if (track.kind === Track.Kind.Audio) {
                const audioEl = document.getElementById(`audio-${participant.identity}`);
                if (audioEl) audioEl.remove();
                track.detach();
            }

            if (publication.source === Track.Source.ScreenShare) {
                this._emit('screenShareStopped', participant.identity);
            }

            this._emit('participantsChanged', this.getParticipants());
            this.fetchVoiceStatus();
        });

        this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            this._emit('activeSpeakers', speakers.map(s => s.identity));
            this._emit('participantsChanged', this.getParticipants());
        });

        this.room.on(RoomEvent.Disconnected, () => {
            this.connected = false;
            this.currentRoomName = null;
            this.currentRoomDisplayName = null;
            this._emit('disconnected');
            this.fetchVoiceStatus();
        });

        this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
            if (state === ConnectionState.Disconnected) {
                this.connected = false;
                this.currentRoomDisplayName = null;
                this._emit('disconnected');
                this.fetchVoiceStatus();
            }
        });
    }
}

export const liveKitService = new LiveKitService();
