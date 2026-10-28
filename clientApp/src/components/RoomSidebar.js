import { matrixService } from '../services/MatrixService.js';
import { liveKitService } from '../services/LiveKitService.js';
import { Icons } from '../utils/icons.js';
import { getAvatarColor, getInitials } from '../utils/avatars.js';
import { escapeHtml, escapeAttr, formatName } from '../utils/format.js';
import { showModal } from './Modal.js';
import { renderVoiceControls } from './VoiceControls.js';

// ─── Public rooms directory cache (avoids refetching on every sidebar render) ───
const PUBLIC_ROOMS_TTL_MS = 60_000;
let publicRoomsCache = {
  rooms: null,
  fetchedAt: 0,
  inflight: null,
};

export function invalidatePublicRoomsCache() {
  publicRoomsCache.rooms = null;
  publicRoomsCache.fetchedAt = 0;
}

async function fetchPublicRoomsCached(force = false) {
  const now = Date.now();
  if (!force && publicRoomsCache.rooms && (now - publicRoomsCache.fetchedAt) < PUBLIC_ROOMS_TTL_MS) {
    return publicRoomsCache.rooms;
  }
  if (!force && publicRoomsCache.inflight) {
    return publicRoomsCache.inflight;
  }
  const promise = matrixService.getPublicRooms().then(rooms => {
    publicRoomsCache.rooms = rooms;
    publicRoomsCache.fetchedAt = Date.now();
    publicRoomsCache.inflight = null;
    return rooms;
  }).catch(err => {
    publicRoomsCache.inflight = null;
    throw err;
  });
  publicRoomsCache.inflight = promise;
  return promise;
}

/**
 * RoomSidebar - Shows joined rooms (filtered by active Space if selected),
 * live voice channel participants, unread badges, and public room directory.
 */
export function renderRoomSidebar(container, { onRoomSelect, onJoinVoice, activeRoomId, activeSpaceId = null }) {
  const allJoinedRooms = matrixService.getRooms();
  const activeSpace = activeSpaceId
    ? matrixService.getSpaces().find(s => s.id === activeSpaceId)
    : null;
  const spaceChildIds = activeSpaceId ? matrixService.getSpaceChildRoomIds(activeSpaceId) : null;
  const joinedRooms = activeSpaceId
    ? allJoinedRooms.filter(r => spaceChildIds.has(r.id))
    : allJoinedRooms;

  const voiceRoomName = liveKitService.currentRoomName;
  const joinedIds = new Set(allJoinedRooms.map(r => r.id));

  container.innerHTML = `
    <div class="sidebar">
      <div class="sidebar__header">
        <span class="sidebar__title truncate">${escapeHtml(activeSpace ? activeSpace.name : 'Nexus')}</span>
        <div class="sidebar__actions">
          ${activeSpaceId ? `
            <button class="sidebar__btn" id="linkRoomToSpaceBtn" title="Add Existing Room to Server">
              ${Icons.inbox}
            </button>
          ` : ''}
          <button class="sidebar__btn" id="browseRoomsBtn" title="Browse Public Rooms">
            ${Icons.search}
          </button>
          <button class="sidebar__btn" id="createRoomBtn" title="Create Room">
            ${Icons.plus}
          </button>
        </div>
      </div>

      <div class="room-list" id="roomList">
        <div class="room-list__section-title">
          ${activeSpace ? 'Server Channels' : 'Your Rooms'} - ${joinedRooms.length}
        </div>
        ${joinedRooms.length === 0 ? `
          <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: var(--font-sm);">
            ${activeSpace
              ? 'No channels in this server yet. Create or link one!'
              : 'No rooms yet. Browse or create one!'}
          </div>
        ` : joinedRooms.map(room => {
    const encrypted = matrixService.isRoomEncrypted(room.id);
    const hasUnread = room.unreadCount > 0 && room.id !== activeRoomId;
    const voiceUsers = liveKitService.getRoomVoiceParticipants(room.id);
    const isConnectedHere = voiceRoomName === room.id;

    return `
          <div class="room-entry">
            <div class="room-item ${room.id === activeRoomId ? 'room-item--active' : ''} ${hasUnread ? 'room-item--unread' : ''}"
                 data-room-id="${room.id}">
              <div class="room-item__icon" style="background: ${getAvatarColor(room.name)}20; color: ${getAvatarColor(room.name)}">
                ${encrypted ? `<span class="room-item__lock">${Icons.lock}</span>` : getInitials(room.name)}
              </div>
              <div class="room-item__info">
                <div class="room-item__name">${escapeHtml(room.name)}</div>
                <div class="room-item__preview">${encrypted ? '🔒 ' : ''}${room.memberCount} member${room.memberCount !== 1 ? 's' : ''}</div>
              </div>
              ${hasUnread ? `<span class="badge room-item__badge">${room.unreadCount}</span>` : ''}
              ${isConnectedHere ? `
                <span class="room-item__voice-count" title="Connected to Voice">
                  ${Icons.volume}
                  <span>${voiceUsers.length || 1}</span>
                </span>
              ` : `
                <button class="room-item__voice-btn ${voiceUsers.length > 0 ? 'room-item__voice-btn--occupied' : ''}"
                        data-voice-room="${room.id}"
                        data-voice-name="${escapeAttr(room.name)}"
                        title="${voiceUsers.length > 0 ? `Join Voice (${voiceUsers.length} in call)` : 'Join Voice'}">
                  ${voiceUsers.length > 0 ? `${Icons.volume}<span>${voiceUsers.length}</span>` : Icons.phone}
                </button>
              `}
            </div>
            ${voiceUsers.length > 0 ? `
              <div class="room-voice-tree">
                ${voiceUsers.map(u => `
                  <div class="room-voice-user"
                       data-voice-room="${room.id}"
                       data-voice-name="${escapeAttr(room.name)}"
                       title="Click to join voice channel">
                    <div class="room-voice-user__avatar" style="background: ${getAvatarColor(u.identity)}">
                      ${getInitials(u.name)}
                    </div>
                    <span class="room-voice-user__name">${escapeHtml(formatName(u.name))}</span>
                    ${u.isScreenSharing ? `<span class="room-voice-user__live">${Icons.monitor} LIVE</span>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `;
  }).join('')}

        <div id="publicRoomsSection"></div>
      </div>

      <div id="voiceControlsSlot"></div>

      <div class="sidebar__user-panel">
        <div class="user-panel__avatar">
          <div class="avatar-letter" style="background: ${getAvatarColor(matrixService.userId || '')}; width: 34px; height: 34px; font-size: 14px;">
            ${getInitials(matrixService.userId || '?')}
          </div>
          <div class="user-panel__status-dot"></div>
        </div>
        <div class="user-panel__info">
          <div class="user-panel__name">${escapeHtml(formatName(matrixService.userId))}</div>
          <div class="user-panel__status">Online</div>
        </div>
        <button class="user-panel__logout" id="logoutBtn" title="Sign Out">
          ${Icons.logout}
        </button>
      </div>
    </div>
  `;

  // Render voice controls if connected
  renderVoiceControls(container.querySelector('#voiceControlsSlot'));

  // Load public rooms and show ones the user hasn't joined
  loadPublicRooms(container.querySelector('#publicRoomsSection'), joinedIds, onRoomSelect);

  // Room click
  container.querySelectorAll('.room-item[data-room-id]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.room-item__voice-btn')) return;
      onRoomSelect(item.dataset.roomId);
    });
  });

  // Voice join (button or clicking a voice participant row)
  container.querySelectorAll('[data-voice-room]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetRoomId = btn.dataset.voiceRoom;
      const targetRoomName = btn.dataset.voiceName;
      if (liveKitService.connected && liveKitService.currentRoomName === targetRoomId) {
        onRoomSelect(targetRoomId);
        return;
      }
      if (onJoinVoice) onJoinVoice(targetRoomId, targetRoomName);
    });
  });

  // Link existing room to active Space
  container.querySelector('#linkRoomToSpaceBtn')?.addEventListener('click', () => {
    const unlinked = allJoinedRooms.filter(r => !spaceChildIds.has(r.id));
    if (unlinked.length === 0) {
      alert('All of your joined rooms are already in this server!');
      return;
    }

    showModal(document.getElementById('app'), {
      title: `Add Room to ${activeSpace?.name || 'Server'}`,
      subtitle: 'Choose an existing room to include in this server.',
      bodyHtml: `
        <div class="form-group">
          <label class="form-group__label">Select Room</label>
          <select class="form-group__input" id="linkRoomSelect" style="background: var(--bg-tertiary); color: var(--text-primary);">
            ${unlinked.map(r => `<option value="${escapeAttr(r.id)}"># ${escapeHtml(r.name)}</option>`).join('')}
          </select>
        </div>
      `,
      submitLabel: 'Add to Server',
      onSubmit: async (backdrop) => {
        const selectedId = backdrop.querySelector('#linkRoomSelect')?.value;
        if (!selectedId) return;
        try {
          await matrixService.addRoomToSpace(activeSpaceId, selectedId);
          onRoomSelect(selectedId);
        } catch (err) {
          console.error('Failed to add room to server:', err);
          alert('Failed to add room to server: ' + (err.message || err));
        }
      },
    });
  });

  // Create room
  container.querySelector('#createRoomBtn').addEventListener('click', () => {
    showModal(document.getElementById('app'), {
      title: activeSpace ? `Create Channel in ${activeSpace.name}` : 'Create a Room',
      subtitle: 'New rooms are end-to-end encrypted. All members can see and join.',
      bodyHtml: `
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-group__label">Room Name</label>
          <input class="form-group__input" type="text" id="newRoomName" placeholder="e.g. general" />
        </div>
        <div class="form-group">
          <label class="form-group__label">Topic (optional)</label>
          <input class="form-group__input" type="text" id="newRoomTopic" placeholder="What's this room about?" />
        </div>
      `,
      submitLabel: 'Create Room',
      onSubmit: async (backdrop) => {
        const name = backdrop.querySelector('#newRoomName').value.trim();
        const topic = backdrop.querySelector('#newRoomTopic').value.trim();
        if (!name) return;
        try {
          invalidatePublicRoomsCache();
          const newRoomId = await matrixService.createRoom(name, topic);
          if (activeSpaceId && newRoomId) {
            await matrixService.addRoomToSpace(activeSpaceId, newRoomId);
          }
          if (newRoomId) {
            onRoomSelect(newRoomId);
          }
        } catch (err) {
          console.error('Failed to create room:', err);
          alert('Failed to create room: ' + (err.message || err));
        }
      },
    });
  });

  // Browse rooms (forces a fresh fetch)
  container.querySelector('#browseRoomsBtn').addEventListener('click', () => {
    loadPublicRooms(container.querySelector('#publicRoomsSection'), joinedIds, onRoomSelect, true);
  });

  // Logout
  container.querySelector('#logoutBtn').addEventListener('click', () => {
    invalidatePublicRoomsCache();
    matrixService.logout();
  });
}

/**
 * Fetch and display public rooms the user hasn't joined yet
 */
async function loadPublicRooms(slot, joinedIds, onRoomSelect, forceRefresh = false) {
  if (!slot) return;

  const publicRooms = await fetchPublicRoomsCached(forceRefresh);
  if (!slot.isConnected) return;
  const unjoinedRooms = publicRooms.filter(r => !joinedIds.has(r.id));

  if (unjoinedRooms.length === 0 && !forceRefresh) {
    slot.innerHTML = '';
    return;
  }

  slot.innerHTML = `
    <div class="room-list__section-title" style="margin-top: 8px;">
      Available Rooms - ${unjoinedRooms.length}
    </div>
    ${unjoinedRooms.length === 0 ? `
      <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: var(--font-xs);">
        You've joined all available rooms!
      </div>
    ` : unjoinedRooms.map(room => `
      <div class="room-item" data-join-room="${room.id}" style="cursor: pointer;">
        <div class="room-item__icon" style="background: ${getAvatarColor(room.name)}20; color: ${getAvatarColor(room.name)}">
          ${getInitials(room.name)}
        </div>
        <div class="room-item__info">
          <div class="room-item__name">${escapeHtml(room.name)}</div>
          <div class="room-item__preview">${room.memberCount} member${room.memberCount !== 1 ? 's' : ''}</div>
        </div>
        <button class="room-item__voice-btn" style="opacity:1; color: var(--status-online);" title="Join Room">
          ${Icons.login}
        </button>
      </div>
    `).join('')}
  `;

  // Bind join buttons
  slot.querySelectorAll('[data-join-room]').forEach(item => {
    item.addEventListener('click', async () => {
      const roomId = item.dataset.joinRoom;
      try {
        invalidatePublicRoomsCache();
        await matrixService.joinRoom(roomId);
        onRoomSelect(roomId);
      } catch (err) {
        console.error('Failed to join room:', err);
        alert('Failed to join: ' + (err.message || err));
      }
    });
  });
}
