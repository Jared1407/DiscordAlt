import { matrixService } from '../services/MatrixService.js';
import { getAvatarColor, getInitials } from '../utils/avatars.js';
import { escapeHtml, formatName } from '../utils/format.js';

/**
 * MemberList — Shows members of the currently active room
 */
export function renderMemberList(container, roomId) {
  if (!roomId) {
    container.innerHTML = '';
    return;
  }

  const members = matrixService.getRoomMembers(roomId);

  container.innerHTML = `
    <div class="member-panel">
      <div class="member-section__title">Members — ${members.length}</div>
      ${members.map(member => `
        <div class="member-item">
          <div class="member-item__avatar">
            <div class="avatar-letter"
                 style="background: ${getAvatarColor(member.userId)}; width: 32px; height: 32px; font-size: 13px;">
              ${getInitials(member.name)}
            </div>
            <div class="member-item__status-dot" style="background: var(--status-online);"></div>
          </div>
          <div class="member-item__name">${escapeHtml(formatName(member.name))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

