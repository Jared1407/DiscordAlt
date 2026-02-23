import { matrixService } from '../services/MatrixService.js';
import { liveKitService } from '../services/LiveKitService.js';
import { Icons } from '../utils/icons.js';
import { getAvatarColor, getInitials } from '../utils/avatars.js';
import { escapeHtml, escapeAttr, formatName } from '../utils/format.js';
import { showModal } from './Modal.js';
import { renderVoiceControls } from './VoiceControls.js';

/**
 * RoomSidebar — Shows joined rooms + public room directory
 */
export function renderRoomSidebar(container, { onRoomSelect, onJoinVoice, activeRoomId }) {
  const joinedRooms = matrixService.getRooms();
  const voiceRoomName = liveKitService.currentRoomName;
  const joinedIds = new Set(joinedRooms.map(r => r.id));

  container.innerHTML = `
    <div class="sidebar">
      <div class="sidebar__header">
        <span class="sidebar__title">Nexus</span>
        <div class="sidebar__actions">
          <button class="sidebar__btn" id="browseRoomsBtn" title="Browse Public Rooms">
            ${Icons.search}
          </button>
          <button class="sidebar__btn" id="createRoomBtn" title="Create Room">
            ${Icons.plus}
          </button>
        </div>
      </div>

      <div class="room-list" id="roomList">
        <div class="room-list__section-title">Your Rooms — ${joinedRooms.length}</div>
        ${joinedRooms.length === 0 ? `
          <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: var(--font-sm);">
            No rooms yet. Browse or create one!
          </div>
        ` : joinedRooms.map(room => {
    const encrypted = matrixService.isRoomEncrypted(room.id);
    return `
          <div class="room-item ${room.id === activeRoomId ? 'room-item--active' : ''}"
               data-room-id="${room.id}">
            <div class="room-item__icon" style="background: ${getAvatarColor(room.name)}20; color: ${getAvatarColor(room.name)}">
              ${encrypted ? `<span class="room-item__lock">${Icons.lock}</span>` : getInitials(room.name)}
            </div>
            <div class="room-item__info">
              <div class="room-item__name">${escapeHtml(room.name)}</div>
              <div class="room-item__preview">${encrypted ? '🔒 ' : ''}${room.memberCount} member${room.memberCount !== 1 ? 's' : ''}</div>
            </div>
            ${voiceRoomName === room.id ? `
              <span class="room-item__voice-count">${Icons.phone}</span>
            ` : `
              <button class="room-item__voice-btn" data-voice-room="${room.id}" data-voice-name="${escapeAttr(room.name)}" title="Join Voice">
                ${Icons.phone}
              </button>
            `}
          </div>
        `}).join('')}

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
  container.querySelectorAll('.room-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.room-item__voice-btn')) return;
      onRoomSelect(item.dataset.roomId);
    });
  });

  // Voice join
  container.querySelectorAll('.room-item__voice-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onJoinVoice) onJoinVoice(btn.dataset.voiceRoom, btn.dataset.voiceName);
    });
  });

  // Create room
  container.querySelector('#createRoomBtn').addEventListener('click', () => {
    showModal(document.getElementById('app'), {
      title: 'Create a Room',
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
          await matrixService.createRoom(name, topic);
        } catch (err) {
          console.error('Failed to create room:', err);
          alert('Failed to create room: ' + (err.message || err));
        }
      },
    });
  });

  // Browse rooms (same as auto-load but forces a refresh)
  container.querySelector('#browseRoomsBtn').addEventListener('click', () => {
    loadPublicRooms(container.querySelector('#publicRoomsSection'), joinedIds, onRoomSelect, true);
  });

  // Logout
  container.querySelector('#logoutBtn').addEventListener('click', () => {
    matrixService.logout();
  });
}

/**
 * Fetch and display public rooms the user hasn't joined yet
 */
async function loadPublicRooms(slot, joinedIds, onRoomSelect, forceMessage = false) {
  if (!slot) return;

  const publicRooms = await matrixService.getPublicRooms();
  const unjoinedRooms = publicRooms.filter(r => !joinedIds.has(r.id));

  if (unjoinedRooms.length === 0 && !forceMessage) {
    slot.innerHTML = '';
    return;
  }

  slot.innerHTML = `
    <div class="room-list__section-title" style="margin-top: 8px;">
      Available Rooms — ${unjoinedRooms.length}
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
        await matrixService.joinRoom(roomId);
        onRoomSelect(roomId);
      } catch (err) {
        console.error('Failed to join room:', err);
        alert('Failed to join: ' + (err.message || err));
      }
    });
  });
}

