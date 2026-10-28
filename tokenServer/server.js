import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';

const app = express();
app.use(cors());
app.use(express.json());

// ─── Configuration (from environment or defaults) ───
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'nexus_dev_key';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'nexus_dev_secret_CHANGE_ME_IN_PROD';
const SYNAPSE_URL = process.env.SYNAPSE_URL || 'http://localhost:8008';
const PORT = process.env.PORT || 3001;

/**
 * Verify a Matrix access token against Synapse.
 * Returns the user_id if valid, null otherwise.
 */
async function verifyMatrixToken(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) return null;

    try {
        const res = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/account/whoami`, {
            headers: { Authorization: authHeader },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.user_id || null;
    } catch {
        return null;
    }
}

/**
 * Verify the user is joined to the given Matrix room and retrieve their display name.
 * Returns `{ displayName }` if joined, null otherwise.
 */
async function getJoinedMember(authHeader, roomId, userId) {
    try {
        const encodedRoomId = encodeURIComponent(roomId);
        const res = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/rooms/${encodedRoomId}/joined_members`, {
            headers: { Authorization: authHeader },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const member = data?.joined?.[userId];
        if (!member) return null;
        return { displayName: member.display_name || null };
    } catch {
        return null;
    }
}

/**
 * POST /token
 * Headers: Authorization: Bearer <matrix_access_token>
 * Body: { roomName: string }
 * Returns: { token: string }
 *
 * Verifies the caller is an authenticated Matrix user and a member of the room,
 * then issues a LiveKit access token bound to their verified Matrix user ID.
 */
app.post('/token', async (req, res) => {
    // Verify caller is an authenticated Matrix user
    const matrixUserId = await verifyMatrixToken(req.headers.authorization);
    if (!matrixUserId) {
        return res.status(401).json({ error: 'Valid Matrix authentication required' });
    }

    const { roomName } = req.body || {};
    if (typeof roomName !== 'string' || !roomName.startsWith('!')) {
        return res.status(400).json({ error: 'roomName must be a Matrix room ID' });
    }

    // Verify caller is joined to the Matrix room and get their display name
    const membership = await getJoinedMember(req.headers.authorization, roomName, matrixUserId);
    if (!membership) {
        return res.status(403).json({ error: 'Not a member of this room' });
    }

    try {
        const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: matrixUserId,
            name: membership.displayName || matrixUserId,
            ttl: '6h',
        });

        token.addGrant({
            room: roomName,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const jwt = await token.toJwt();
        res.json({ token: jwt });
    } catch (err) {
        console.error('Token generation error:', err);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'nexus-token-server' });
});

app.listen(PORT, () => {
    console.log(`Nexus Token Server running on port ${PORT}`);
    console.log(`Synapse URL: ${SYNAPSE_URL}`);
});
