const chatMessagesContainer = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const userChatList = document.getElementById('userChatList');
const guestChatList = document.getElementById('guestChatList');
const chatTitle = document.getElementById('chatTitle');
const showUsersBtn = document.getElementById('showUsersBtn');
const showGuestsBtn = document.getElementById('showGuestsBtn');
const chatOrderStatusPanel = document.getElementById('chatOrderStatusPanel');
const chatOrderSelect = document.getElementById('chatOrderSelect');
const chatOrderStatusSelect = document.getElementById('chatOrderStatusSelect');
const chatOrderTtnInput = document.getElementById('chatOrderTtnInput');
const applyChatOrderStatusBtn = document.getElementById('applyChatOrderStatusBtn');
const chatAttachmentController = typeof initChatAttachmentUI === 'function' ? initChatAttachmentUI() : null;

let currentUser = null;
let isAdminUser = false;
let currentChatMode = 'user';
let currentChatUserId = null;
let currentGuestIdentifier = null;
let currentChatName = '';
let currentUserOrders = [];

function initChatInputAutoGrow(textarea) {
    if (!textarea || textarea.dataset.autoGrowReady === 'true') {
        return null;
    }

    textarea.dataset.autoGrowReady = 'true';

    const parsePx = value => Number.parseFloat(value) || 0;
    const measureBaseHeight = () => {
        const styles = window.getComputedStyle(textarea);
        const rows = Math.max(Number(textarea.getAttribute('rows')) || 2, 1);
        const lineHeight = parsePx(styles.lineHeight) || 20;
        const padding = parsePx(styles.paddingTop) + parsePx(styles.paddingBottom);
        const border = parsePx(styles.borderTopWidth) + parsePx(styles.borderBottomWidth);
        const minHeight = parsePx(styles.minHeight);
        return Math.max(minHeight, rows * lineHeight + padding + border);
    };
    let baseHeight = measureBaseHeight();

    const syncHeight = () => {
        const expandedHeight = baseHeight * 2;
        const hasText = textarea.value.trim().length > 0;

        textarea.classList.add('chat-input-auto-grow');
        textarea.classList.toggle('is-expanded', hasText);
        textarea.style.height = 'auto';
        textarea.style.height = `${hasText ? Math.max(textarea.scrollHeight, expandedHeight) : baseHeight}px`;
    };

    const handleResize = () => {
        baseHeight = measureBaseHeight();
        syncHeight();
    };

    textarea.addEventListener('input', syncHeight);
    window.addEventListener('resize', handleResize);
    syncHeight();

    return {
        syncHeight,
        reset() {
            textarea.value = '';
            syncHeight();
        }
    };
}

const chatInputAutoGrow = initChatInputAutoGrow(chatInput);

function syncChatAttachmentAvailability() {
    const enabled = currentChatMode !== 'adminGuest';
    chatAttachmentController?.setEnabled?.(enabled);
}

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatChatDate(dateStr) {
    if (!dateStr) return '';
    let date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
        date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    }
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getOrderNumberFromReceiptHtml(message) {
    if (typeof message !== 'string') return '';
    const match = message.match(/Чек замовлення(?:\s*№)?\s*([^<\n]+)/i);
    return match ? String(match[1]).trim() : '';
}

function getDefaultOrderStatus() {
    return getAdminOrderStatuses()[0];
}

function buildAdminReceiptControls(message) {
    if (!isAdminUser || currentChatMode !== 'adminUser') return '';

    const orderNumber = getOrderNumberFromReceiptHtml(message);
    if (!orderNumber) return '';

    const order = currentUserOrders.find(item => String(item.order_number || '').trim() === orderNumber);
    if (!order) return '';

    const prepaymentReceived = Boolean(order.prepayment_received);
    const prepaymentAmount = prepaymentReceived ? (order.prepayment_amount ?? '') : '';

    return `
        <div class="chat-receipt-admin-tools" data-order-id="${order.id}">
            <label class="chat-receipt-prepayment-toggle">
                <input type="checkbox" class="chat-receipt-prepayment-checkbox" ${prepaymentReceived ? 'checked' : ''}>
                <span>Передплата отримана</span>
            </label>
            <div class="chat-receipt-prepayment-row" style="${prepaymentReceived ? '' : 'display:none;'}">
                <input type="number" min="0" step="0.01" class="chat-receipt-prepayment-input" value="${escapeHtml(String(prepaymentAmount))}" placeholder="Сума передплати">
                <button type="button" class="chat-receipt-save-btn">Зберегти передплату</button>
            </div>
        </div>
    `;
}

function bindAdminReceiptControls() {
    if (!chatMessagesContainer) return;

    chatMessagesContainer.querySelectorAll('.chat-receipt-prepayment-checkbox').forEach(checkbox => {
        checkbox.onchange = event => {
            const tools = event.target.closest('.chat-receipt-admin-tools');
            const row = tools?.querySelector('.chat-receipt-prepayment-row');
            const input = tools?.querySelector('.chat-receipt-prepayment-input');
            if (row) {
                row.style.display = event.target.checked ? 'grid' : 'none';
            }
            if (!event.target.checked && input) {
                input.value = '';
            }
        };
    });

    chatMessagesContainer.querySelectorAll('.chat-receipt-save-btn').forEach(button => {
        button.onclick = handleReceiptPrepaymentSave;
    });
}

function setActiveChatItem(selector) {
    document.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('active'));
    if (selector) selector.classList.add('active');
}

function renderEmptyThread(message = 'Оберіть чат у лівому меню, щоб почати розмову.') {
    if (!chatMessagesContainer) return;
    chatMessagesContainer.innerHTML = `<div class="chat-empty">${message}</div>`;
}

function getAdminOrderStatuses() {
    return [
        'Замовлення очікує підтвердження менеджером',
        'Замовлення очікує на передплату',
        'Замовлення прийнято, очікуйте номер ТТН',
        'Передплата підтверджена та замовлення прийнято. Очікуйте номер ТТН',
        'Оплата підтверджена та замовлення прийнято. Очікуйте номер ТТН',
        'Замовлення у процесі доставки',
        'Замовлення очікує Вас на пошті!',
        'Отримано',
        'Відмова'
    ];
}

function isDeliveryOrderStatus(status) {
    return status === 'Замовлення у процесі доставки';
}

function hideChatOrderStatusPanel() {
    currentUserOrders = [];
    if (chatOrderStatusPanel) chatOrderStatusPanel.style.display = 'none';
    if (chatOrderSelect) chatOrderSelect.innerHTML = '<option value="">Оберіть замовлення</option>';
    if (chatOrderStatusSelect) chatOrderStatusSelect.value = getAdminOrderStatuses()[0];
    if (chatOrderTtnInput) {
        chatOrderTtnInput.value = '';
        chatOrderTtnInput.style.display = 'none';
    }
}

async function loadChatOrderControls(userId) {
    if (!chatOrderStatusPanel || !chatOrderSelect || !chatOrderStatusSelect || !isAdminUser) return;

    try {
        const orders = await getAllOrders();
        currentUserOrders = Array.isArray(orders) ? orders.filter(order => order.user_id === userId) : [];

        if (!currentUserOrders.length) {
            hideChatOrderStatusPanel();
            return;
        }

        chatOrderSelect.innerHTML = currentUserOrders.map(order => `
            <option value="${order.id}">${order.order_number || `Замовлення #${order.id}`}</option>
        `).join('');

        chatOrderStatusPanel.style.display = 'flex';
        syncChatOrderStatusSelect();
    } catch (error) {
        console.error('Помилка завантаження замовлень для чату:', error);
        hideChatOrderStatusPanel();
    }
}

function syncChatOrderStatusSelect() {
    if (!chatOrderSelect || !chatOrderStatusSelect) return;

    const orderId = Number(chatOrderSelect.value);
    const selectedOrder = currentUserOrders.find(order => order.id === orderId);
    chatOrderStatusSelect.value = selectedOrder?.status || getAdminOrderStatuses()[0];
    if (chatOrderTtnInput) {
        chatOrderTtnInput.value = selectedOrder?.tracking_number || '';
        chatOrderTtnInput.style.display = isDeliveryOrderStatus(chatOrderStatusSelect.value) ? '' : 'none';
    }
}

function handleChatStatusSelectChange() {
    if (!chatOrderStatusSelect || !chatOrderTtnInput) return;
    chatOrderTtnInput.style.display = isDeliveryOrderStatus(chatOrderStatusSelect.value) ? '' : 'none';
}

function notifyChatOrderStatusUpdated(status, trackingNumber = '') {
    const message = isDeliveryOrderStatus(status) && trackingNumber
        ? `Статус замовлення оновлено. ТТН ${trackingNumber} збережено.`
        : 'Статус замовлення оновлено.';

    if (typeof showNotification === 'function') {
        showNotification(message, 'Успіх', 'success', 3000);
        return;
    }

    alert(message);
}

async function initChatPage() {
    if (!localStorage.getItem('auth_token')) {
        window.location.href = '/';
        return;
    }

    try {
        currentUser = await getCurrentUser();
        isAdminUser = currentUser?.is_admin === true;
    } catch (error) {
        console.error('Помилка при завантаженні користувача:', error);
        window.location.href = '/';
        return;
    }

    if (isAdminUser) {
        await loadAdminChatLists();
        renderEmptyThread();
    } else {
        guestChatList.style.display = 'none';
        await renderUserThreadItem();
        await loadUserChat();
    }

    // Обработчики переключателя режимов
    showUsersBtn.onclick = () => {
        showUsersBtn.classList.add('active');
        showGuestsBtn.classList.remove('active');
        userChatList.style.display = 'block';
        guestChatList.style.display = 'none';
    };

    showGuestsBtn.onclick = () => {
        showGuestsBtn.classList.add('active');
        showUsersBtn.classList.remove('active');
        userChatList.style.display = 'none';
        guestChatList.style.display = 'block';
    };

    sendChatBtn.onclick = handleSendMessage;
    if (chatOrderSelect) chatOrderSelect.onchange = syncChatOrderStatusSelect;
    if (chatOrderStatusSelect) chatOrderStatusSelect.onchange = handleChatStatusSelectChange;
    if (applyChatOrderStatusBtn) applyChatOrderStatusBtn.onclick = handleChatOrderStatusSave;
    syncChatAttachmentAvailability();
    initBottomPanelButtons();
}

function initBottomPanelButtons() {
    const homeBtn = document.getElementById('homeBtn');
    const chatBtn = document.getElementById('chatBtn');
    const cartBtn = document.getElementById('cartBtn');
    const profileBtn = document.getElementById('profileBtn');
    const logoutBtnBottom = document.getElementById('logoutBtnBottom');

    if (homeBtn) homeBtn.onclick = () => window.location.href = '/';
    if (chatBtn) chatBtn.onclick = () => window.location.href = '/chat';
    if (cartBtn) cartBtn.onclick = () => window.location.href = '/checkout.html';
    if (profileBtn) profileBtn.onclick = () => window.location.href = '/profile.html';
    if (logoutBtnBottom) logoutBtnBottom.onclick = () => {
        logoutUser();
        window.location.href = '/';
    };
}

async function renderUserThreadItem() {
    if (!userChatList) return;
    userChatList.innerHTML = '';
    const userItem = document.createElement('button');
    userItem.type = 'button';
    userItem.className = 'chat-list-item active';
    userItem.dataset.chatType = 'user';
    userItem.innerHTML = `<div class="chat-list-item-title">Менеджер</div><div class="chat-list-item-subtitle">Ваш особистий чат</div>`;
    userItem.onclick = () => selectUserThread(userItem);
    userChatList.appendChild(userItem);
    setActiveChatItem(userItem);
}

async function selectUserThread(element) {
    currentChatMode = 'user';
    currentChatUserId = null;
    currentGuestIdentifier = null;
    currentChatName = 'Менеджер';
    chatTitle.textContent = 'Чат з менеджером';
    setActiveChatItem(element);
    syncChatAttachmentAvailability();
    await loadUserChat();
}

async function loadUserChat() {
    try {
        const messages = await getUserChat();
        if (Array.isArray(messages) && messages.length) {
            maybeClearPendingOrderChatAttention(messages);
            renderMessages(messages);
        } else {
            renderEmptyThread('Ваш чат порожній. Напишіть перше повідомлення.');
        }
    } catch (error) {
        console.error('Помилка при завантаженні чату користувача:', error);
        renderEmptyThread('Не вдалося завантажити чат. Повторіть спробу пізніше.');
    }
}

async function loadAdminChatLists() {
    if (!userChatList || !guestChatList) return;
    userChatList.innerHTML = '<div class="chat-list-section-title">Користувачі</div>';
    guestChatList.innerHTML = '<div class="chat-list-section-title">Гості</div>';

    try {
        let users = await getAdminUsers();
        // Сортировка: сначала с непрочитанными, по времени последнего сообщения
        users.sort((a, b) => {
            const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
            const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
            return bTime - aTime;
        });
        if (users.length) {
            users.forEach(user => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'chat-list-item';
                item.dataset.chatType = 'adminUser';
                item.dataset.userId = user.id;
                item.innerHTML = `<div class="chat-list-item-title">${user.display_name || user.username}</div><div class="chat-list-item-subtitle">${user.email}</div>${user.unread_count > 0 ? `<span class="chat-badge">${user.unread_count}</span>` : ''}`;
                item.onclick = () => openAdminUserChat(user.id, user.display_name || user.username, item);
                userChatList.appendChild(item);
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'chat-empty';
            empty.textContent = 'Список користувачів порожній.';
            userChatList.appendChild(empty);
        }
    } catch (error) {
        console.error('Помилка при завантаженні користувачів адміністратором:', error);
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.textContent = 'Не вдалося завантажити користувачів.';
        userChatList.appendChild(empty);
    }

    try {
        const guests = await getGuestChatUsers();
        guests.sort((a, b) => {
            const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
            const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
            return bTime - aTime;
        });
        if (guests.length) {
            guests.forEach(guest => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'chat-list-item';
                item.dataset.chatType = 'adminGuest';
                item.dataset.guestIdentifier = guest.guest_identifier;
                item.innerHTML = `<div class="chat-list-item-title">${guest.guest_phone || 'Гість'}</div><div class="chat-list-item-subtitle">${guest.guest_identifier}</div>${guest.unread_count > 0 ? `<span class="chat-badge">${guest.unread_count}</span>` : ''}`;
                item.onclick = () => openAdminGuestChat(guest.guest_identifier, guest.guest_phone, item);
                guestChatList.appendChild(item);
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'chat-empty';
            empty.textContent = 'Немає чатів з гостями.';
            guestChatList.appendChild(empty);
        }
    } catch (error) {
        console.error('Помилка при завантаженні гостів:', error);
        const empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.textContent = 'Не вдалося завантажити гостей.';
        guestChatList.appendChild(empty);
    }

    // По умолчанию показывать пользователей
    guestChatList.style.display = 'none';
}

function openAdminUserChat(userId, name, element) {
    currentChatMode = 'adminUser';
    currentChatUserId = userId;
    currentGuestIdentifier = null;
    currentChatName = name;
    chatTitle.textContent = `Чат з ${name}`;
    setActiveChatItem(element);
    syncChatAttachmentAvailability();
    loadChatOrderControls(userId);
    loadAdminUserChat(userId);
}

async function loadAdminUserChat(userId) {
    try {
        const messages = await getAdminUserChat(userId);
        if (Array.isArray(messages) && messages.length) {
            renderMessages(messages);
        } else {
            renderEmptyThread('Чат порожній. Напишіть перше повідомлення.');
        }
    } catch (error) {
        console.error('Помилка при завантаженні чату користувача:', error);
        renderEmptyThread('Не вдалося завантажити чат користувача.');
    }
}

function openAdminGuestChat(identifier, phone, element) {
    currentChatMode = 'adminGuest';
    currentChatUserId = null;
    currentGuestIdentifier = identifier;
    currentChatName = phone || 'Гість';
    chatTitle.textContent = `Чат гостя ${currentChatName}`;
    setActiveChatItem(element);
    hideChatOrderStatusPanel();
    syncChatAttachmentAvailability();
    loadAdminGuestChat(identifier);
}

async function loadAdminGuestChat(identifier) {
    try {
        const messages = await getAdminGuestChat();
        const filtered = Array.isArray(messages) ? messages.filter(item => item.guest_identifier === identifier) : [];
        if (filtered.length) {
            renderMessages(filtered);
        } else {
            renderEmptyThread('Чат гостя порожній. Напишіть перше повідомлення.');
        }
    } catch (error) {
        console.error('Помилка при завантаженні чату гостя:', error);
        renderEmptyThread('Не вдалося завантажити чат гостя.');
    }
}

function renderMessages(messages) {
    if (!chatMessagesContainer) return;

    chatMessagesContainer.innerHTML = messages.map(msg => {
        const senderClass = msg.sender === 'admin' ? 'chat-admin' : 'chat-user';
        const senderName = msg.sender === 'admin' ? (isAdminUser ? 'Ви' : 'Менеджер') : (isAdminUser ? currentChatName || 'Користувач' : 'Ви');
        const extraHtml = buildAdminReceiptControls(typeof msg.message === 'string' ? msg.message : '');
        const messageContent = buildChatMessageContent(msg, { extraHtml }).html;
        
        return `
            <div class="chat-message ${senderClass}">
                <div class="chat-message-body">
                    <div class="chat-message-sender">${senderName}</div>
                    <div class="chat-message-text">${messageContent}</div>
                    <div class="chat-message-date">${formatChatDate(msg.created_at)}</div>
                </div>
            </div>
        `;
    }).join('');

    bindAdminReceiptControls();
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

async function handleSendMessage() {
    const text = chatInput.value.trim();
    const imageFile = chatAttachmentController?.getSelectedFile?.() || null;
    if (!text && !imageFile) return;

    try {
        if (currentChatMode === 'user') {
            await postUserChat(text || '', imageFile);
            await loadUserChat();
        } else if (currentChatMode === 'adminUser' && currentChatUserId) {
            await postAdminChat(currentChatUserId, text || '', imageFile);
            await loadAdminUserChat(currentChatUserId);
        } else if (currentChatMode === 'adminGuest' && currentGuestIdentifier) {
            if (!text) return;
            await postAdminGuestChat(currentGuestIdentifier, text);
            await loadAdminGuestChat(currentGuestIdentifier);
        } else {
            return;
        }
        chatInputAutoGrow?.reset();
        chatAttachmentController?.clear?.();
    } catch (error) {
        console.error('Помилка при надсиланні повідомлення:', error);
        alert('Не вдалося надіслати повідомлення. Спробуйте пізніше.');
    }
}

async function handleChatOrderStatusSave() {
    if (!currentChatUserId || !chatOrderSelect || !chatOrderStatusSelect || !applyChatOrderStatusBtn) return;

    const orderId = Number(chatOrderSelect.value);
    const status = chatOrderStatusSelect.value;
    const trackingNumber = chatOrderTtnInput ? chatOrderTtnInput.value.trim() : '';

    if (!orderId) {
        alert('Оберіть замовлення.');
        return;
    }

    if (isDeliveryOrderStatus(status) && !trackingNumber) {
        alert('Вкажіть номер ТТН для статусу доставки.');
        if (chatOrderTtnInput) chatOrderTtnInput.focus();
        return;
    }

    applyChatOrderStatusBtn.disabled = true;

    try {
        const result = await updateAdminOrderStatus(orderId, status, trackingNumber);
        currentUserOrders = currentUserOrders.map(order => order.id === orderId ? {
            ...order,
            status: result.status,
            tracking_number: result.tracking_number || '',
            prepayment_received: Boolean(result.prepayment_received),
            prepayment_amount: result.prepayment_amount
        } : order);
        syncChatOrderStatusSelect();
        await loadAdminUserChat(currentChatUserId);
        notifyChatOrderStatusUpdated(result.status, result.tracking_number || '');
    } catch (error) {
        console.error('Помилка оновлення статусу з чату:', error);
        alert(error.message || 'Не вдалося оновити статус замовлення.');
    } finally {
        applyChatOrderStatusBtn.disabled = false;
    }
}

async function handleReceiptPrepaymentSave(event) {
    if (!currentChatUserId) return;

    const button = event.target;
    const tools = button.closest('.chat-receipt-admin-tools');
    const orderId = Number(tools?.dataset.orderId);
    const checkbox = tools?.querySelector('.chat-receipt-prepayment-checkbox');
    const input = tools?.querySelector('.chat-receipt-prepayment-input');
    const order = currentUserOrders.find(item => item.id === orderId);

    if (!orderId || !order) {
        alert('Не вдалося знайти замовлення для оновлення передплати.');
        return;
    }

    const prepaymentReceived = Boolean(checkbox?.checked);
    const prepaymentAmount = input ? input.value.trim() : '';

    if (prepaymentReceived && !prepaymentAmount) {
        alert('Вкажіть суму передплати.');
        if (input) input.focus();
        return;
    }

    button.disabled = true;

    try {
        const result = await updateAdminOrderStatus(
            orderId,
            order.status || getDefaultOrderStatus(),
            order.tracking_number || '',
            {
                prepayment_received: prepaymentReceived,
                prepayment_amount: prepaymentReceived ? prepaymentAmount : null
            }
        );

        currentUserOrders = currentUserOrders.map(item => item.id === orderId ? {
            ...item,
            status: result.status,
            tracking_number: result.tracking_number || '',
            prepayment_received: Boolean(result.prepayment_received),
            prepayment_amount: result.prepayment_amount
        } : item);

        syncChatOrderStatusSelect();
        await loadAdminUserChat(currentChatUserId);

        if (typeof showNotification === 'function') {
            showNotification('Передплату збережено.', 'Успіх', 'success', 3000);
        }
    } catch (error) {
        console.error('Помилка оновлення передплати з чату:', error);
        alert(error.message || 'Не вдалося зберегти передплату.');
    } finally {
        button.disabled = false;
    }
}

window.addEventListener('DOMContentLoaded', initChatPage);
