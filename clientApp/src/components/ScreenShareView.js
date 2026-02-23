import { liveKitService } from '../services/LiveKitService.js';
import { Icons } from '../utils/icons.js';
import { escapeHtml, formatName } from '../utils/format.js';

/**
 * ScreenShareView — Renders the active screen share video
 * Shows above the message area when someone is sharing their screen.
 */
export function renderScreenShareView(container) {
  const shareInfo = liveKitService.getScreenShareTrack();

  if (!shareInfo) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  container.innerHTML = `
    <div class="screen-share-container">
      <div class="screen-share-overlay">
        <div class="screen-share-overlay__dot"></div>
        <span>${escapeHtml(formatName(shareInfo.participantName))} is sharing their screen</span>
      </div>
    </div>
  `;

  // Attach the video track to a video element
  const videoEl = shareInfo.track.attach();
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.style.maxWidth = '100%';
  videoEl.style.maxHeight = '45vh';
  videoEl.style.objectFit = 'contain';
  videoEl.style.background = '#000';

  container.querySelector('.screen-share-container').appendChild(videoEl);
}

