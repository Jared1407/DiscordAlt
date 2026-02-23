/**
 * Modal — Reusable modal dialog
 */
export function showModal(container, { title, subtitle, bodyHtml, onSubmit, submitLabel = 'Create', submitDisabledCheck }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h2 class="modal__title">${title}</h2>
        ${subtitle ? `<p class="modal__subtitle">${subtitle}</p>` : ''}
      </div>
      <div class="modal__body">
        ${bodyHtml}
      </div>
      <div class="modal__footer">
        <button class="modal__btn modal__btn--cancel" id="modalCancel">Cancel</button>
        <button class="modal__btn modal__btn--primary" id="modalSubmit">${submitLabel}</button>
      </div>
    </div>
  `;

    container.appendChild(backdrop);

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });

    // Cancel button
    backdrop.querySelector('#modalCancel').addEventListener('click', close);

    // Submit button
    const submitBtn = backdrop.querySelector('#modalSubmit');
    submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Working...';
        try {
            await onSubmit(backdrop);
        } catch (err) {
            console.error('Modal submit error:', err);
        }
        close();
    });

    // Escape key
    function onKeyDown(e) {
        if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);

    function close() {
        document.removeEventListener('keydown', onKeyDown);
        backdrop.remove();
    }

    // Focus first input
    const firstInput = backdrop.querySelector('input');
    if (firstInput) firstInput.focus();

    return { close };
}
