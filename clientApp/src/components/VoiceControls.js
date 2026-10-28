import { liveKitService } from '../services/LiveKitService.js';
import { matrixService } from '../services/MatrixService.js';
import { getAvatarColor, getInitials } from '../utils/avatars.js';
import { Icons } from '../utils/icons.js';
import { escapeHtml, formatName } from '../utils/format.js';

/**
 * VoiceControls — Discord-style voice connected bar
 * Renders above the user panel in the sidebar.
 */
export function renderVoiceControls(container) {
  if (!liveKitService.connected) {
    container.innerHTML = '';
    return;
  }

  const participants = liveKitService.getParticipants();
  const rawName = liveKitService.currentRoomDisplayName || liveKitService.currentRoomName || '';
  const resolvedRoom = matrixService.getRooms().find(r => r.id === liveKitService.currentRoomName);
  const displayName = (!rawName || rawName.startsWith('!'))
    ? (resolvedRoom?.name || 'Voice Channel')
    : rawName;

  container.innerHTML = `
    <div class="voice-bar">
      <div class="voice-bar__header">
        <div class="voice-bar__status">
          <div class="voice-bar__dot"></div>
          <span class="voice-bar__label">Voice Connected</span>
        </div>
        <button class="voice-bar__disconnect" id="voiceDisconnect" title="Disconnect">
          ${Icons.phoneOff}
        </button>
      </div>
      <div class="voice-bar__room">${escapeHtml(displayName)}</div>

      <div class="voice-participants">
        ${participants.map(p => `
          <div class="voice-participant">
            <div class="voice-participant__avatar ${p.isSpeaking ? 'voice-participant__avatar--speaking' : ''}"
                 style="background: ${getAvatarColor(p.identity)}">
              ${getInitials(p.name)}
            </div>
            <span class="voice-participant__name">${escapeHtml(formatName(p.name))}${p.isLocal ? ' (you)' : ''}</span>
            ${p.isMuted ? `<span class="voice-participant__icon voice-participant__icon--muted">${Icons.micOff}</span>` : ''}
            ${p.isScreenSharing ? `<span class="voice-participant__icon">${Icons.monitor}</span>` : ''}
          </div>
        `).join('')}
      </div>

      <div class="voice-controls">
        <button class="voice-control-btn ${liveKitService.muted ? 'voice-control-btn--muted' : ''}"
                id="voiceMuteBtn" title="${liveKitService.muted ? 'Unmute' : 'Mute'}">
          ${liveKitService.muted ? Icons.micOff : Icons.mic}
        </button>
        <button class="voice-control-btn ${liveKitService.deafened ? 'voice-control-btn--muted' : ''}"
                id="voiceDeafenBtn" title="${liveKitService.deafened ? 'Undeafen' : 'Deafen'}">
          ${liveKitService.deafened ? Icons.headphoneOff : Icons.headphone}
        </button>
        <button class="voice-control-btn ${liveKitService.screenSharing ? 'voice-control-btn--active' : ''}"
                id="voiceScreenBtn" title="${liveKitService.screenSharing ? 'Stop Share' : 'Share Screen'}">
          ${Icons.monitor}
        </button>
        <button class="voice-control-btn voice-control-btn--disconnect"
                id="voiceHangupBtn" title="Disconnect">
          ${Icons.phoneOff}
        </button>
      </div>
    </div>
  `;

  // Event bindings
  container.querySelector('#voiceDisconnect')?.addEventListener('click', () => liveKitService.leaveVoice());
  container.querySelector('#voiceHangupBtn')?.addEventListener('click', () => liveKitService.leaveVoice());
  container.querySelector('#voiceMuteBtn')?.addEventListener('click', () => liveKitService.toggleMute());
  container.querySelector('#voiceDeafenBtn')?.addEventListener('click', () => liveKitService.toggleDeafen());
  container.querySelector('#voiceScreenBtn')?.addEventListener('click', async () => {
    if (liveKitService.screenSharing) {
      await liveKitService.stopScreenShare();
    } else {
      await liveKitService.startScreenShare();
    }
  });
}
