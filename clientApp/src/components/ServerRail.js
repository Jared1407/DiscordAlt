import { matrixService } from '../services/MatrixService.js';
import { getAvatarColor, getInitials } from '../utils/avatars.js';
import { Icons } from '../utils/icons.js';
import { escapeAttr } from '../utils/format.js';
import { showModal } from './Modal.js';

/**
 * ServerRail — Discord-style leftmost 72px Server (Matrix Space) switcher
 */
export function renderServerRail(container, { activeSpaceId, onSelectSpace }) {
  const spaces = matrixService.getSpaces();

  container.innerHTML = `
    <nav class="server-rail" aria-label="Servers">
      <button class="server-rail__item server-rail__item--home ${!activeSpaceId ? 'server-rail__item--active' : ''}"
              data-space-id=""
              title="All Rooms (Home)">
        <span class="server-rail__pill"></span>
        <span class="server-rail__icon">${Icons.nexus}</span>
      </button>

      <div class="server-rail__divider"></div>

      <div class="server-rail__list">
        ${spaces.map(space => {
          const isActive = space.id === activeSpaceId;
          const color = getAvatarColor(space.name);
          return `
            <button class="server-rail__item ${isActive ? 'server-rail__item--active' : ''}"
                    data-space-id="${escapeAttr(space.id)}"
                    title="${escapeAttr(space.name)}"
                    style="--space-color: ${color}">
              <span class="server-rail__pill"></span>
              <span class="server-rail__initials" style="background: ${isActive ? color : ''}">
                ${getInitials(space.name)}
              </span>
            </button>
          `;
        }).join('')}
      </div>

      <button class="server-rail__item server-rail__item--action" id="createSpaceBtn" title="Create a Server (Space)">
        <span class="server-rail__icon">${Icons.plus}</span>
      </button>
    </nav>
  `;

  container.querySelectorAll('[data-space-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.spaceId || null;
      if (onSelectSpace) onSelectSpace(id);
    });
  });

  container.querySelector('#createSpaceBtn')?.addEventListener('click', () => {
    showModal(document.getElementById('app'), {
      title: 'Create a Server',
      subtitle: 'Servers are powered by Matrix Spaces and group related rooms together.',
      bodyHtml: `
        <div class="form-group" style="margin-bottom: 16px;">
          <label class="form-group__label">Server Name</label>
          <input class="form-group__input" type="text" id="newSpaceName" placeholder="e.g. Nexus Community" />
        </div>
        <div class="form-group">
          <label class="form-group__label">Description (optional)</label>
          <input class="form-group__input" type="text" id="newSpaceTopic" placeholder="What is this server for?" />
        </div>
      `,
      submitLabel: 'Create Server',
      onSubmit: async (backdrop) => {
        const name = backdrop.querySelector('#newSpaceName')?.value.trim();
        const topic = backdrop.querySelector('#newSpaceTopic')?.value.trim();
        if (!name) return;
        try {
          const spaceId = await matrixService.createSpace(name, topic);
          if (onSelectSpace) onSelectSpace(spaceId);
        } catch (err) {
          console.error('Failed to create server:', err);
          alert('Failed to create server: ' + (err.message || err));
        }
      },
    });
  });
}
