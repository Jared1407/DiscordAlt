import { matrixService } from '../services/MatrixService.js';
import { getAvatarColor, getInitials } from '../utils/avatars.js';
import { formatTime, formatDateSeparator, formatClock } from '../utils/time.js';
import { Icons } from '../utils/icons.js';
import { escapeHtml, escapeAttr, formatName, formatFileSize, formatMessageBody } from '../utils/format.js';
import { showModal } from './Modal.js';

/**
 * ChatView — Displays messages, media attachments, scrollback, and input for the active room
 */
export function renderChatView(container, roomId) {
  if (!roomId) {
    renderEmptyState(container);
    return;
  }

  const rooms = matrixService.getRooms();
  const room = rooms.find(r => r.id === roomId);
  const roomName = room?.name || 'Unknown Room';
  const roomTopic = room?.topic || '';

  const messages = matrixService.getRoomMessages(roomId, 60);
  const isEncrypted = matrixService.isRoomEncrypted(roomId);

  container.innerHTML = `
    <div class="main-content" id="chatMainContent">
      <div class="drop-zone-overlay" id="dropZoneOverlay">
        <div class="drop-zone-overlay__box">
          ${Icons.paperclip}
          <span>Drop files to upload to #${escapeHtml(roomName)}</span>
        </div>
      </div>

      <div class="channel-header">
        <div class="channel-header__left">
          ${isEncrypted
      ? `<span class="channel-header__lock" title="End-to-end encrypted">${Icons.lock}</span>`
      : `<span class="channel-header__hash">#</span>`
    }
          <span class="channel-header__name">${escapeHtml(roomName)}</span>
          ${roomTopic ? `
            <div class="channel-header__divider"></div>
            <span class="channel-header__topic">${escapeHtml(roomTopic)}</span>
          ` : ''}
        </div>
        <div class="channel-header__right">
          <button class="header-btn" id="inviteBtn" title="Invite User">
            ${Icons.plus}
          </button>
          <button class="header-btn" id="toggleMembersBtn" title="Toggle Members">
            ${Icons.users}
          </button>
        </div>
      </div>

      <div class="messages-container" id="messagesContainer">
        <div class="messages-container__inner" id="messagesInner">
          ${renderWelcome(roomName)}
          ${renderMessages(messages)}
        </div>
      </div>

      <div class="message-input-wrapper">
        <div class="message-upload-status" id="uploadStatusBanner" style="display:none;"></div>
        <div class="message-input">
          <input type="file" id="fileAttachmentInput" style="display:none;" multiple />
          <button class="message-input__attach" id="attachFileBtn" title="Upload File or Image">
            ${Icons.paperclip}
          </button>
          <textarea class="message-input__field" id="messageInput"
                    placeholder="Message #${escapeHtml(roomName)}"
                    rows="1"></textarea>
          <button class="message-input__send" id="sendBtn" title="Send Message">
            ${Icons.send}
          </button>
        </div>
      </div>
    </div>
  `;

  const messagesContainer = container.querySelector('#messagesContainer');
  const messagesInner = container.querySelector('#messagesInner');
  const uploadStatusBanner = container.querySelector('#uploadStatusBanner');

  // Hydrate authenticated mxc:// media attachments
  hydrateMediaAttachments(messagesInner);

  // Auto-scroll to bottom on initial room render
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // ─── Top Scrollback Pagination ───
  let loadingOlder = false;
  let canLoadMore = true;

  messagesContainer.addEventListener('scroll', async () => {
    if (messagesContainer.scrollTop < 60 && !loadingOlder && canLoadMore) {
      loadingOlder = true;
      const prevScrollHeight = messagesContainer.scrollHeight;
      const result = await matrixService.loadMoreMessages(roomId, 30);
      if (!messagesInner.isConnected) return;

      canLoadMore = result.canLoadMore;
      messagesInner.innerHTML = `
        ${renderWelcome(roomName)}
        ${renderMessages(result.messages)}
      `;
      hydrateMediaAttachments(messagesInner);
      messagesContainer.scrollTop = messagesContainer.scrollHeight - prevScrollHeight;
      loadingOlder = false;
    }
  });

  // ─── File / Image Upload Handling ───
  const fileInput = container.querySelector('#fileAttachmentInput');
  const attachBtn = container.querySelector('#attachFileBtn');

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    for (const file of files) {
      if (uploadStatusBanner) {
        uploadStatusBanner.style.display = 'flex';
        uploadStatusBanner.textContent = `Uploading ${file.name}…`;
      }
      try {
        await matrixService.sendFileMessage(roomId, file);
      } catch (err) {
        console.error('Failed to upload file:', err);
        alert(`Failed to upload ${file.name}: ${err.message || err}`);
      }
    }

    if (uploadStatusBanner) {
      uploadStatusBanner.style.display = 'none';
      uploadStatusBanner.textContent = '';
    }
  }

  attachBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.length) {
      uploadFiles(fileInput.files);
      fileInput.value = '';
    }
  });

  // Drag-and-drop file upload
  const mainContent = container.querySelector('#chatMainContent');
  const dropZoneOverlay = container.querySelector('#dropZoneOverlay');
  let dragDepth = 0;

  mainContent?.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      dragDepth++;
      dropZoneOverlay?.classList.add('drop-zone-overlay--active');
    }
  });

  mainContent?.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
    }
  });

  mainContent?.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      dropZoneOverlay?.classList.remove('drop-zone-overlay--active');
    }
  });

  mainContent?.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropZoneOverlay?.classList.remove('drop-zone-overlay--active');
    if (e.dataTransfer?.files?.length) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  // ─── Send Text Message & Clipboard Paste ───
  const messageInput = container.querySelector('#messageInput');
  const sendBtn = container.querySelector('#sendBtn');

  function updateSendBtnState() {
    const hasText = messageInput.value.trim().length > 0;
    sendBtn.classList.toggle('message-input__send--active', hasText);
  }

  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    messageInput.value = '';
    updateSendBtnState();
    autoResizeTextarea();

    try {
      await matrixService.sendMessage(roomId, text);
    } catch (err) {
      console.error('Failed to send message:', err);
      messageInput.value = text;
      updateSendBtnState();
    }
  }

  messageInput.addEventListener('paste', (e) => {
    if (e.clipboardData?.files?.length > 0) {
      e.preventDefault();
      uploadFiles(e.clipboardData.files);
    }
  });

  messageInput.addEventListener('input', () => {
    updateSendBtnState();
    autoResizeTextarea();
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  }

  // Invite button
  const serverDomain = (matrixService.userId || '').split(':')[1] || 'server';
  container.querySelector('#inviteBtn')?.addEventListener('click', () => {
    showModal(document.getElementById('app'), {
      title: 'Invite to Room',
      subtitle: `Invite a user to #${roomName}`,
      bodyHtml: `
                <div class="form-group">
                    <label class="form-group__label">Username</label>
                    <input class="form-group__input" type="text" id="inviteUserId"
                           placeholder="e.g. test2" />
                    <div style="margin-top: 6px; font-size: var(--font-xs); color: var(--text-muted);">
                      Just type the username — the server domain (<strong>${serverDomain}</strong>) is added automatically.
                    </div>
                </div>
            `,
      submitLabel: 'Send Invite',
      onSubmit: async (backdrop) => {
        const userId = backdrop.querySelector('#inviteUserId').value.trim();
        if (!userId) return;
        try {
          await matrixService.inviteUser(roomId, userId);
          console.log('Invite sent to', userId);
        } catch (err) {
          console.error('Failed to invite:', err);
          alert('Failed to invite: ' + (err.message || err));
        }
      },
    });
  });

  // Focus input
  messageInput.focus();
}

/**
 * Append a single new message to the chat (called from live events)
 */
export function appendMessage(container, message) {
  const inner = container.querySelector('#messagesInner');
  if (!inner) return;

  // Check if we should group with previous message
  const lastGroup = inner.querySelector('.message-group:last-child');
  const lastSender = lastGroup?.dataset?.sender;
  const shouldGroup = lastSender === message.sender;

  const messageHtml = shouldGroup
    ? createGroupedMessageHtml(message)
    : createNewGroupHtml(message);

  inner.insertAdjacentHTML('beforeend', messageHtml);
  hydrateMediaAttachments(inner);

  // Auto-scroll if near bottom
  const messagesContainer = container.querySelector('#messagesContainer');
  const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 150;
  if (isNearBottom) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

/**
 * Replace the body of an already-rendered message (e.g. once it finishes decrypting)
 */
export function updateMessage(container, message) {
  const bodies = container.querySelectorAll('.message-body[data-event-id]');
  for (const el of bodies) {
    if (el.dataset.eventId === message.id) {
      el.innerHTML = renderMessageContent(message);
      hydrateMediaAttachments(el);
      return;
    }
  }
}

/**
 * Render message body or media attachment HTML
 */
function renderMessageContent(msg) {
  if (msg.mxcUrl && !msg.pending) {
    const filename = msg.filename || msg.body || 'attachment';
    const sizeLabel = formatFileSize(msg.info?.size);

    if (msg.msgtype === 'm.image') {
      return `
        <div class="message-attachment message-attachment--image">
          <img class="message-image"
               data-mxc-url="${escapeAttr(msg.mxcUrl)}"
               alt="${escapeAttr(filename)}"
               loading="lazy" />
        </div>
      `;
    }

    if (msg.msgtype === 'm.video') {
      return `
        <div class="message-attachment">
          <video class="message-video"
                 data-mxc-url="${escapeAttr(msg.mxcUrl)}"
                 controls
                 preload="metadata"></video>
        </div>
      `;
    }

    if (msg.msgtype === 'm.audio') {
      return `
        <div class="message-attachment">
          <audio class="message-audio"
                 data-mxc-url="${escapeAttr(msg.mxcUrl)}"
                 controls
                 preload="metadata"></audio>
        </div>
      `;
    }

    return `
      <a class="message-file-card"
         data-mxc-url="${escapeAttr(msg.mxcUrl)}"
         download="${escapeAttr(filename)}"
         target="_blank"
         rel="noopener noreferrer">
        <span class="message-file-card__icon">${Icons.file}</span>
        <span class="message-file-card__info">
          <span class="message-file-card__name">${escapeHtml(filename)}</span>
          ${sizeLabel ? `<span class="message-file-card__size">${escapeHtml(sizeLabel)}</span>` : ''}
        </span>
        <span class="message-file-card__download">${Icons.download}</span>
      </a>
    `;
  }

  return formatMessageBody(msg.body || '');
}

/**
 * Fetch authenticated Matrix media blobs for any unhydrated [data-mxc-url] elements
 */
function hydrateMediaAttachments(root) {
  if (!root) return;
  const elements = root.querySelectorAll('[data-mxc-url]:not([data-mxc-loaded])');
  elements.forEach(async (el) => {
    el.dataset.mxcLoaded = '1';
    const mxcUrl = el.dataset.mxcUrl;
    const objectUrl = await matrixService.fetchMediaObjectUrl(mxcUrl);
    if (!objectUrl || !el.isConnected) return;

    if (el.tagName === 'A') {
      el.href = objectUrl;
    } else {
      el.src = objectUrl;
    }
  });
}

function renderWelcome(roomName) {
  return `
    <div class="welcome-message">
      <div class="welcome-message__icon">#</div>
      <h2 class="welcome-message__title">Welcome to #${escapeHtml(roomName)}</h2>
      <p class="welcome-message__desc">This is the beginning of the room. Start the conversation!</p>
    </div>
  `;
}

function renderMessages(messages) {
  if (!messages.length) return '';

  let html = '';
  let lastSender = null;
  let lastDate = null;

  for (const msg of messages) {
    const msgDate = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const dateKey = msgDate.toDateString();

    // Date separator
    if (dateKey !== lastDate) {
      html += `
        <div class="date-separator">
          <div class="date-separator__line"></div>
          <span class="date-separator__text">${formatDateSeparator(msgDate)}</span>
          <div class="date-separator__line"></div>
        </div>
      `;
      lastDate = dateKey;
      lastSender = null; // Reset grouping after date separator
    }

    // Group consecutive messages from same sender
    if (msg.sender === lastSender) {
      html += createGroupedMessageHtml(msg);
    } else {
      html += createNewGroupHtml(msg);
    }

    lastSender = msg.sender;
  }

  return html;
}

function createNewGroupHtml(msg) {
  const senderName = formatName(msg.sender);
  const time = msg.timestamp ? formatTime(msg.timestamp) : '';
  const color = getAvatarColor(msg.sender);

  return `
    <div class="message-group message-group--start" data-sender="${escapeAttr(msg.sender)}">
      <div class="message-group__avatar">
        <div class="avatar-letter" style="background: ${color}; width: 40px; height: 40px; font-size: 16px;">
          ${getInitials(msg.sender)}
        </div>
      </div>
      <div class="message-group__content">
        <div class="message-header">
          <span class="message-header__sender" style="color: ${color}">${escapeHtml(senderName)}</span>
          <span class="message-header__time">${time}</span>
        </div>
        <div class="message-body" data-event-id="${escapeAttr(msg.id)}">${renderMessageContent(msg)}</div>
      </div>
    </div>
  `;
}

function createGroupedMessageHtml(msg) {
  const time = msg.timestamp ? formatClock(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)) : '';

  return `
    <div class="message-group" data-sender="${escapeAttr(msg.sender)}">
      <div class="message-inline-time">${time}</div>
      <div class="message-group__content">
        <div class="message-body" data-event-id="${escapeAttr(msg.id)}">${renderMessageContent(msg)}</div>
      </div>
    </div>
  `;
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="main-content">
      <div class="empty-state">
        <div class="empty-state__icon">
          ${Icons.chat}
        </div>
        <h3 class="empty-state__title">Select a Room</h3>
        <p class="empty-state__desc">Choose a room from the sidebar to start chatting, or create a new one.</p>
      </div>
    </div>
  `;
}
