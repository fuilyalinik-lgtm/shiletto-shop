const chatMessagesContainer = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const userChatList = document.getElementById('userChatList');
const guestChatList = document.getElementById('guestChatList');
const chatTitle = document.getElementById('chatTitle');
const showUsersBtn = document.getElementById('showUsersBtn');
const showGuestsBtn = document.getElementById('showGuestsBtn');

let currentUser = null;
let isAdminUser = false;
let currentChatMode = 'user';
let currentChatUserId = null;
let currentGuestIdentifier = null;
let currentChatName = '';

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

function setActiveChatItem(selector) {
    document.querySelectorAll('.chat-list-item').forEach(item => item.classList.remove('active'));
    if (selector) selector.classList.add('active');
}

function renderEmptyThread(message = 'Оберіть чат у лівому меню, щоб почати розмову.') {
    if (!chatMessagesContainer) return;
    chatMessagesContainer.innerHTML = `<div class="chat-empty">${message}</div>`;
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
    await loadUserChat();
}

async function loadUserChat() {
    try {
        const messages = await getUserChat();
        if (Array.isArray(messages) && messages.length) {
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
            if (a.last_unread_time && b.last_unread_time) {
                return new Date(b.last_unread_time) - new Date(a.last_unread_time);
            } else if (a.last_unread_time) {
                return -1;
            } else if (b.last_unread_time) {
                return 1;
            } else {
                return 0;
            }
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
        
        // Проверяем, содержит ли сообщение HTML (чеки заказов)
        const isHtmlMessage = msg.message.includes('<div') || msg.message.includes('<span') || msg.message.includes('<strong') || msg.message.includes('order-receipt');
        const messageContent = isHtmlMessage ? 
            `<div class="message-html">${msg.message}</div>` : 
            `<span class="message-text">${escapeHtml(msg.message).replace(/\n/g, '<br>')}</span>`;
        
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

    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    try {
        if (currentChatMode === 'user') {
            await postUserChat(text);
            await loadUserChat();
        } else if (currentChatMode === 'adminUser' && currentChatUserId) {
            await postAdminChat(currentChatUserId, text);
            await loadAdminUserChat(currentChatUserId);
        } else if (currentChatMode === 'adminGuest' && currentGuestIdentifier) {
            await postAdminGuestChat(currentGuestIdentifier, text);
            await loadAdminGuestChat(currentGuestIdentifier);
        } else {
            return;
        }
        chatInput.value = '';
    } catch (error) {
        console.error('Помилка при надсиланні повідомлення:', error);
        alert('Не вдалося надіслати повідомлення. Спробуйте пізніше.');
    }
}

window.addEventListener('DOMContentLoaded', initChatPage);
