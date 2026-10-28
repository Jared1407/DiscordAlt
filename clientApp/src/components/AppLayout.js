import { matrixService } from '../services/MatrixService.js';
import { liveKitService } from '../services/LiveKitService.js';
import { getAvatarColor, getInitials } from '../utils/avatars.js';
import { Icons } from '../utils/icons.js';
import { escapeHtml, formatName } from '../utils/format.js';
import { renderServerRail } from './ServerRail.js';
import { renderRoomSidebar } from './RoomSidebar.js';
import { renderChatView, appendMessage, updateMessage } from './ChatView.js';
import { renderMemberList } from './MemberList.js';
import { renderScreenShareView } from './ScreenShareView.js';
import { renderVoiceControls } from './VoiceControls.js';

/**
 * AppLayout — Main four-panel layout orchestrator (Server Rail + Room Sidebar + Chat + Members)
 */
export function renderApp(container) {
  let activeSpaceId = null;
  let activeRoomId = null;
  let membersVisible = true;

  container.innerHTML = `
    <div class="app-layout">
      <div id="serverRailSlot"></div>
      <div id="sidebarSlot"></div>
      <div id="chatColumn" style="flex:1; display:flex; flex-direction:column; min-width:0;">
        <div id="voiceAreaSlot"></div>
        <div id="screenShareSlot" style="display:none;"></div>
        <div id="chatSlot" style="flex:1; display:flex; min-width:0;"></div>
      </div>
      <div id="memberSlot"></div>
    </div>
  `;

  const serverRailSlot = container.querySelector('#serverRailSlot');
  const sidebarSlot = container.querySelector('#sidebarSlot');
  const chatSlot = container.querySelector('#chatSlot');
  const memberSlot = container.querySelector('#memberSlot');
  const screenShareSlot = container.querySelector('#screenShareSlot');
  const voiceAreaSlot = container.querySelector('#voiceAreaSlot');

  // ─── Render functions ───
  function renderRail() {
    renderServerRail(serverRailSlot, {
      activeSpaceId,
      onSelectSpace: selectSpace,
    });
  }

  function renderSidebar() {
    renderRoomSidebar(sidebarSlot, {
      onRoomSelect: selectRoom,
      onJoinVoice: joinVoice,
      activeRoomId,
      activeSpaceId,
    });
  }

  /**
   * Re-render only the voice widgets (sidebar voice bar + top voice area)
   * without rebuilding the entire room list or refetching public rooms.
   */
  function renderVoiceWidgets() {
    const voiceControlsSlot = sidebarSlot.querySelector('#voiceControlsSlot');
    if (voiceControlsSlot) {
      renderVoiceControls(voiceControlsSlot);
    }
    renderVoiceArea();
  }

  function renderChat() {
    renderChatView(chatSlot, activeRoomId);
    const toggleBtn = chatSlot.querySelector('#toggleMembersBtn');
    if (toggleBtn) {
      toggleBtn.classList.toggle('header-btn--active', membersVisible);
      toggleBtn.addEventListener('click', () => {
        membersVisible = !membersVisible;
        toggleBtn.classList.toggle('header-btn--active', membersVisible);
        renderMembers();
      });
    }
  }

  function renderMembers() {
    if (membersVisible && activeRoomId) {
      renderMemberList(memberSlot, activeRoomId);
    } else {
      memberSlot.innerHTML = '';
    }
  }

  function renderScreenShare() {
    renderScreenShareView(screenShareSlot);
  }

  function renderVoiceArea() {
    if (!liveKitService.connected) {
      voiceAreaSlot.innerHTML = '';
      return;
    }

    const participants = liveKitService.getParticipants();
    const rawName = liveKitService.currentRoomDisplayName || liveKitService.currentRoomName || '';
    const resolvedRoom = matrixService.getRooms().find(r => r.id === liveKitService.currentRoomName);
    const displayName = (!rawName || rawName.startsWith('!'))
      ? (resolvedRoom?.name || 'Voice Channel')
      : rawName;

    voiceAreaSlot.innerHTML = `
        <div class="voice-area">
          <div class="voice-area__header">
            <div class="voice-area__info">
              <span class="voice-area__dot"></span>
              <span class="voice-area__title">Voice Connected — #${escapeHtml(displayName)}</span>
              <span class="voice-area__count">${participants.length} participant${participants.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="voice-area__controls">
              <button class="voice-area__btn ${liveKitService.muted ? 'voice-area__btn--danger' : ''}"
                      id="va-mute" title="${liveKitService.muted ? 'Unmute' : 'Mute'}">
                ${liveKitService.muted ? Icons.micOff : Icons.mic}
              </button>
              <button class="voice-area__btn ${liveKitService.deafened ? 'voice-area__btn--danger' : ''}"
                      id="va-deafen" title="${liveKitService.deafened ? 'Undeafen' : 'Deafen'}">
                ${liveKitService.deafened ? Icons.headphoneOff : Icons.headphone}
              </button>
              <button class="voice-area__btn ${liveKitService.screenSharing ? 'voice-area__btn--active' : ''}"
                      id="va-screen" title="${liveKitService.screenSharing ? 'Stop Sharing' : 'Share Screen'}">
                ${Icons.monitor}
                <span class="voice-area__btn-label">${liveKitService.screenSharing ? 'Stop Share' : 'Share Screen'}</span>
              </button>
              <button class="voice-area__btn voice-area__btn--disconnect" id="va-disconnect" title="Disconnect">
                ${Icons.phoneOff}
              </button>
            </div>
          </div>
          <div class="voice-area__participants">
            ${participants.map(p => `
              <div class="voice-area__participant ${p.isSpeaking ? 'voice-area__participant--speaking' : ''}">
                <div class="voice-area__avatar" style="background: ${getAvatarColor(p.identity)}">
                  ${getInitials(p.name)}
                </div>
                <span class="voice-area__name">${escapeHtml(formatName(p.name))}${p.isLocal ? ' (you)' : ''}</span>
                ${p.isMuted ? `<span class="voice-area__muted">${Icons.micOff}</span>` : ''}
                ${p.isScreenSharing ? `<span class="voice-area__screen-icon">${Icons.monitor}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        `;

    // Bind voice area controls
    voiceAreaSlot.querySelector('#va-mute')?.addEventListener('click', () => liveKitService.toggleMute());
    voiceAreaSlot.querySelector('#va-deafen')?.addEventListener('click', () => liveKitService.toggleDeafen());
    voiceAreaSlot.querySelector('#va-screen')?.addEventListener('click', async () => {
      if (liveKitService.screenSharing) {
        await liveKitService.stopScreenShare();
      } else {
        await liveKitService.startScreenShare();
      }
    });
    voiceAreaSlot.querySelector('#va-disconnect')?.addEventListener('click', () => liveKitService.leaveVoice());
  }

  function selectSpace(spaceId) {
    if (activeSpaceId === spaceId) return;
    activeSpaceId = spaceId;
    renderRail();
    renderSidebar();
  }

  function selectRoom(roomId) {
    if (activeRoomId === roomId) return;
    activeRoomId = roomId;
    matrixService.markRoomRead(roomId);
    renderSidebar();
    renderChat();
    renderMembers();
    renderVoiceArea();
  }

  async function joinVoice(roomId, roomName) {
    const resolvedName = roomName || matrixService.getRooms().find(r => r.id === roomId)?.name || roomId;

    voiceAreaSlot.innerHTML = `
        <div class="voice-area" style="justify-content:center; padding: 12px;">
          <div class="spinner" style="margin-right: 8px;"></div>
          <span id="voice-connect-status" style="color: var(--text-secondary); font-size: var(--font-sm);">Joining #${escapeHtml(resolvedName)} Voice...</span>
        </div>`;

    let lastError = null;
    const connectingHandler = ({ attempt, maxRetries }) => {
      const status = voiceAreaSlot.querySelector('#voice-connect-status');
      if (status && attempt > 1) {
        status.textContent = `Joining #${resolvedName} Voice... (attempt ${attempt}/${maxRetries})`;
      }
    };
    const errorHandler = (msg) => { lastError = msg; };

    liveKitService.on('connecting', connectingHandler);
    liveKitService.on('error', errorHandler);

    const success = await liveKitService.joinVoice(roomId, resolvedName);
    liveKitService.off('connecting', connectingHandler);
    liveKitService.off('error', errorHandler);

    if (success) {
      renderSidebar();
      renderVoiceArea();
    } else {
      const reason = lastError ? escapeHtml(lastError) : 'Make sure the LiveKit server is running.';
      voiceAreaSlot.innerHTML = `
            <div class="voice-area" style="background: rgba(243,90,90,0.1); border-color: rgba(243,90,90,0.25);">
              <span style="color: var(--danger); font-size: var(--font-sm); padding: 10px 16px;">
                Failed to connect to voice: ${reason}
              </span>
            </div>`;
      setTimeout(() => { voiceAreaSlot.innerHTML = ''; }, 4000);
    }
  }

  // ─── Initial render & background voice polling ───
  renderRail();
  renderSidebar();
  renderChat();
  renderMembers();
  liveKitService.startVoiceStatusPolling(5000);

  // ─── Matrix events ───
  function handleMessage(msg) {
    if (msg.roomId === activeRoomId) {
      appendMessage(chatSlot, msg);
      matrixService.markRoomRead(activeRoomId);
    }
    renderSidebar();
  }
  function handleMessageUpdated(msg) {
    if (msg.roomId === activeRoomId) updateMessage(chatSlot, msg);
  }
  function handleRoomsChanged() {
    renderRail();
    renderSidebar();
    const rooms = matrixService.getRooms();
    if (activeRoomId && !rooms.find(r => r.id === activeRoomId)) {
      activeRoomId = null;
      renderChat();
      renderMembers();
    }
  }
  function handleLogout() {
    liveKitService.stopVoiceStatusPolling();
    liveKitService.leaveVoice();
    location.reload();
  }

  matrixService.on('message', handleMessage);
  matrixService.on('messageUpdated', handleMessageUpdated);
  matrixService.on('roomsChanged', handleRoomsChanged);
  matrixService.on('logout', handleLogout);

  // ─── LiveKit events ───
  function handleVoiceConnected() { renderSidebar(); renderVoiceArea(); }
  function handleVoiceDisconnected() { renderSidebar(); renderVoiceArea(); renderScreenShare(); }
  function handleParticipantsChanged() { renderSidebar(); renderVoiceWidgets(); }
  function handleVoiceStatusChanged() { renderSidebar(); }
  function handleMuteChanged() { renderVoiceWidgets(); }
  function handleDeafenChanged() { renderVoiceWidgets(); }
  function handleScreenShareChanged() { renderSidebar(); renderVoiceArea(); renderScreenShare(); }
  function handleScreenShareStarted() { renderScreenShare(); }
  function handleScreenShareStopped() { renderScreenShare(); }

  liveKitService.on('connected', handleVoiceConnected);
  liveKitService.on('disconnected', handleVoiceDisconnected);
  liveKitService.on('participantsChanged', handleParticipantsChanged);
  liveKitService.on('voiceStatusChanged', handleVoiceStatusChanged);
  liveKitService.on('muteChanged', handleMuteChanged);
  liveKitService.on('deafenChanged', handleDeafenChanged);
  liveKitService.on('screenShareChanged', handleScreenShareChanged);
  liveKitService.on('screenShareStarted', handleScreenShareStarted);
  liveKitService.on('screenShareStopped', handleScreenShareStopped);

  return function cleanup() {
    liveKitService.stopVoiceStatusPolling();
    matrixService.off('message', handleMessage);
    matrixService.off('messageUpdated', handleMessageUpdated);
    matrixService.off('roomsChanged', handleRoomsChanged);
    matrixService.off('logout', handleLogout);
    liveKitService.off('connected', handleVoiceConnected);
    liveKitService.off('disconnected', handleVoiceDisconnected);
    liveKitService.off('participantsChanged', handleParticipantsChanged);
    liveKitService.off('voiceStatusChanged', handleVoiceStatusChanged);
    liveKitService.off('muteChanged', handleMuteChanged);
    liveKitService.off('deafenChanged', handleDeafenChanged);
    liveKitService.off('screenShareChanged', handleScreenShareChanged);
    liveKitService.off('screenShareStarted', handleScreenShareStarted);
    liveKitService.off('screenShareStopped', handleScreenShareStopped);
  };
}
