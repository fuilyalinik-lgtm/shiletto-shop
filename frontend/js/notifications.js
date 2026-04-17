function ensureNotificationRoot() {
    if (document.getElementById('siteNotificationRoot')) {
        return;
    }

    const root = document.createElement('div');
    root.id = 'siteNotificationRoot';
    root.className = 'site-notification-root';
    document.body.appendChild(root);

    const confirmModal = document.createElement('div');
    confirmModal.id = 'siteConfirmModal';
    confirmModal.className = 'modal';
    confirmModal.innerHTML = `
        <div class="modal-content notification-modal-content">
            <span class="close" id="siteNotificationClose">&times;</span>
            <h2 id="siteNotificationTitle">Повідомлення</h2>
            <p id="siteNotificationMessage"></p>
            <div class="notification-actions"></div>
        </div>
    `;
    document.body.appendChild(confirmModal);

    document.getElementById('siteNotificationClose').onclick = hideNotificationModal;
    confirmModal.onclick = (event) => {
        if (event.target === confirmModal) {
            hideNotificationModal();
        }
    };
}

function showNotification(message, title = 'Повідомлення', type = 'info', duration = 3500) {
    ensureNotificationRoot();

    const root = document.getElementById('siteNotificationRoot');
    const toast = document.createElement('div');
    toast.className = `site-toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${getToastIcon(type)}</div>
        <div class="toast-text">
            <strong>${title}</strong>
            <p>${escapeHtml(String(message))}</p>
        </div>
    `;

    root.appendChild(toast);
    window.requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    const timeout = setTimeout(() => {
        hideToast(toast);
    }, duration);

    toast.onclick = () => {
        clearTimeout(timeout);
        hideToast(toast);
    };
}

function hideToast(toast) {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    });
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return '✔';
        case 'error': return '✖';
        case 'warning': return '⚠';
        default: return 'ℹ';
    }
}

function showConfirmDialog(title, message, onConfirm, onCancel, confirmText = 'Так', cancelText = 'Ні') {
    ensureNotificationRoot();

    const modal = document.getElementById('siteConfirmModal');
    const titleEl = document.getElementById('siteNotificationTitle');
    const messageEl = document.getElementById('siteNotificationMessage');
    const actions = modal.querySelector('.notification-actions');

    titleEl.textContent = title;
    messageEl.textContent = message;
    actions.innerHTML = '';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'cart-action-btn';
    cancelButton.textContent = cancelText;
    cancelButton.onclick = () => {
        hideNotificationModal();
        if (typeof onCancel === 'function') onCancel();
    };

    const confirmButton = document.createElement('button');
    confirmButton.className = 'cart-action-btn checkout-btn';
    confirmButton.textContent = confirmText;
    confirmButton.onclick = () => {
        hideNotificationModal();
        if (typeof onConfirm === 'function') onConfirm();
    };

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    modal.style.display = 'block';
}

function hideNotificationModal() {
    const modal = document.getElementById('siteConfirmModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

window.alert = function(message) {
    showNotification(message, 'Повідомлення', 'info', 4000);
};

window.showNotification = showNotification;
window.showConfirmDialog = showConfirmDialog;

if (document.readyState !== 'loading') {
    ensureNotificationRoot();
} else {
    document.addEventListener('DOMContentLoaded', ensureNotificationRoot);
}
