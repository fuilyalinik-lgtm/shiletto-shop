const profileForm = document.getElementById('profileForm');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const addressInput = document.getElementById('address');
const profileStatus = document.getElementById('profileStatus');

const contactMessageInput = document.getElementById('contactMessage');
const sendContactBtn = document.getElementById('sendContactBtn');
const contactStatus = document.getElementById('contactStatus');

const homeBtn = document.getElementById('homeBtn');
const chatBtn = document.getElementById('chatBtn');
const cartBtn = document.getElementById('cartBtn');
const profileBtn = document.getElementById('profileBtn');
const logoutBtnBottom = document.getElementById('logoutBtnBottom');
const chatModal = document.getElementById('chatModal');
const closeChatModalBtn = document.getElementById('closeChatModal');
const chatMessagesContainer = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

let isAdminUser = false;

const cartModal = document.getElementById('cartModal');
const closeCartModalBtn = document.getElementById('closeCartModal');
const cartItemsContainer = document.getElementById('cartItems');
const cartSummary = document.getElementById('cartSummary');
const checkoutBtn = document.getElementById('checkoutBtn');

let isAdmin = false;
let currentChatUserId = null;
let currentChatUserName = '';

function formatChatDate(dateStr) {
    if (!dateStr) return '';
    let date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
        // Для надійності пробуємо додати Z (UTC)
        date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    }
    if (Number.isNaN(date.getTime())) {
        return dateStr;
    }
    return date.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getCart() {
    try {
        const data = localStorage.getItem('cart');
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Помилка читання кошика:', error);
        return [];
    }
}

function saveCart(cart) {
    if (cart.length === 0) {
        localStorage.removeItem('cart');
        console.log('Cart key removed from localStorage');
    } else {
        localStorage.setItem('cart', JSON.stringify(cart));
    }
}

function getCartItemCount() {
    return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartCount() {
    document.getElementById('cartCount').textContent = String(getCartItemCount());
}

function renderCart() {
    const cart = getCart();

    if (!cart.length) {
        cartItemsContainer.innerHTML = '<p>Корзина пуста.</p>';
        cartSummary.textContent = '';
        return;
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    cartItemsContainer.innerHTML = cart.map(item => `
        <div class="cart-item">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; margin-right: 10px; cursor: pointer; border-radius: 5px; object-fit: contain;" onclick="window.location.href='product.html?id=${item.id}'">` : ''}
            <div class="cart-item-info">
                <strong>${item.name}</strong><br>
                ${item.quantity} × ${item.price} грн
            </div>
            <div>
                <button onclick="changeCartQuantity(${item.id}, -1)">-</button>
                <button onclick="changeCartQuantity(${item.id}, 1)">+</button>
                <button class="cart-action-btn delete-btn" onclick="removeFromCart(${item.id})">Видалити</button>
            </div>
        </div>
    `).join('');

    cartSummary.textContent = `Общая сумма: ${total} грн`;
}

function changeCartQuantity(productId, delta) {
    const cart = getCart();
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    const nextQuantity = item.quantity + delta;
    if (nextQuantity <= 0) {
        removeFromCart(productId);
        return;
    }

    if (item.stock !== null && item.stock !== undefined && nextQuantity > item.stock) {
        alert('Перевищено кількість на складі');
        return;
    }

    item.quantity = nextQuantity;
    saveCart(cart);
    updateCartCount();
    renderCart();
}

function removeFromCart(productId) {
    const cart = getCart().filter(item => item.id !== productId);
    saveCart(cart);
    updateCartCount();
    renderCart();
}

function openCart() {
    renderCart();
    cartModal.style.display = 'block';
}

homeBtn.onclick = () => {
    window.location.href = '/';
};

chatBtn.onclick = async () => {
    try {
        const user = await getCurrentUser();
        if (user.is_admin) {
            window.location.href = '/chat';
        } else {
            chatModal.style.display = 'block';
            await loadChatMessages();
        }
    } catch (error) {
        console.error('Помилка при отриманні користувача:', error);
        alert('Не вдалося завантажити чат. Спробуйте пізніше.');
    }
};

closeChatModalBtn.onclick = () => {
    chatModal.style.display = 'none';
};

closeCartModalBtn.onclick = () => {
    cartModal.style.display = 'none';
};

checkoutBtn.onclick = () => {
    window.location.href = 'checkout.html';
};

cartBtn.onclick = openCart;
profileBtn.onclick = () => {
    window.location.href = 'profile.html';
};
logoutBtnBottom.onclick = () => {
    logoutUser();
    window.location.href = '/';
};

async function loadProfile() {
    try {
        const data = await getUserProfile();
        if (data && data.profile) {
            fullNameInput.value = data.profile.full_name || '';
            phoneInput.value = data.profile.phone || '';
            addressInput.value = data.profile.address || '';
        }
        profileStatus.textContent = '';
    } catch (error) {
        console.error('Не вдалося завантажити профіль:', error);
        alert('Пожалуйста, войдите для продолжения.');
        window.location.href = '/';
    }
}

profileForm.onsubmit = async (event) => {
    event.preventDefault();
    try {
        await updateUserProfile({
            full_name: fullNameInput.value,
            phone: phoneInput.value,
            address: addressInput.value
        });
        profileStatus.textContent = 'Дані збережено успішно.';
        profileStatus.style.color = 'green';
    } catch (error) {
        console.error('Помилка при збереженні даних профілю:', error);
        profileStatus.textContent = 'Помилка при збереженні. Спробуйте ще раз.';
        profileStatus.style.color = 'red';
    }
};

sendContactBtn.onclick = async () => {
    const message = contactMessageInput.value.trim();
    if (!message) {
        contactStatus.textContent = 'Введіть повідомлення.';
        contactStatus.style.color = 'red';
        return;
    }

    try {
        await sendContactMessage(message);
        contactStatus.textContent = 'Повідомлення надіслано менеджеру.';
        contactStatus.style.color = 'green';
        contactMessageInput.value = '';
    } catch (error) {
        console.error('Помилка при надсиланні повідомлення менеджеру:', error);
        contactStatus.textContent = 'Не вдалося надіслати повідомлення. Спробуйте пізніше.';
        contactStatus.style.color = 'red';
    }
};

function renderChatMessages(messages) {
    if (!chatMessagesContainer) return;
    chatMessagesContainer.innerHTML = messages.map(msg => {
        const cssClass = msg.sender === 'admin' ? 'chat-admin' : 'chat-user';
    const deleteBtn = '';
        return `<div class="chat-message ${cssClass}" style="margin-bottom:0.6rem;">
                    <strong>${msg.sender === 'admin' ? 'Менеджер' : 'Ви'}:</strong> ${msg.message}
                    <div style="font-size:0.75rem; color:#888; margin-top:0.2rem;">${formatChatDate(msg.created_at)}</div>
                    ${deleteBtn}
                </div>`;
    }).join('');

    // Додати обробники для кнопок видалення
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.preventDefault();
            const messageId = btn.getAttribute('data-message-id');
            showConfirmDialog('Підтвердження видалення', 'Ви впевнені, що хочете видалити це повідомлення?', async () => {
                try {
                    await deleteUserChatMessage(messageId);
                    await loadChatMessages(); // Перезагрузить сообщения
                } catch (error) {
                    console.error('Помилка при видаленні повідомлення:', error);
                    alert('Не вдалося видалити повідомлення. Спробуйте пізніше.');
                }
            });
        };
    });
}

async function loadChatMessages() {
    try {
        const messages = await getUserChat();
        if (Array.isArray(messages)) {
            renderChatMessages(messages);
        }
    } catch (error) {
        console.error('Помилка при завантаженні чату:', error);
        alert('Не удалось загрузить чат. Повторите попытку.');
    }
}

sendChatBtn.onclick = async () => {
    const text = chatInput.value.trim();
    if (!text) return;

    try {
        if (isAdmin && currentChatUserId) {
            await postAdminChat(currentChatUserId, text);
            await loadCurrentAdminChat();
        } else {
            await postUserChat(text);
            await loadChatMessages();
        }
        chatInput.value = '';
    } catch (error) {
        console.error('Помилка при надсиланні повідомлення чату:', error);
        alert('Не удалось отправить сообщение. Попробуйте позднее.');
    }
};

async function loadAdminUserChatsForProfile() {
    try {
        const users = await getAdminUsers();
        const backBtn = document.getElementById('backToUserListBtn');
        backBtn.style.display = 'none';

        if (!users.length) {
            chatMessagesContainer.innerHTML = '<p>Нет зарегистрированных пользователей</p>';
            return;
        }
        renderAdminUserList(users);
    } catch (error) {
        console.error('Помилка завантаження списку користувачів:', error);
        chatMessagesContainer.innerHTML = '<p style="color:red;">Помилка при завантаженні користувачів</p>';
    }
}

function renderAdminUserList(users) {
    chatMessagesContainer.innerHTML = '';

    users.forEach(u => {
        const row = document.createElement('div');
        row.style.marginBottom = '0.5rem';
        row.style.padding = '0.5rem';
        row.style.border = '1px solid #eee';
        row.style.borderRadius = '5px';
        row.style.cursor = 'pointer';

        const name = document.createElement('strong');
        name.textContent = u.display_name;

        const email = document.createElement('span');
        email.textContent = ` (${u.email})`;

        row.appendChild(name);
        row.appendChild(email);
        row.onclick = () => openChatWithUser(u.id, u.display_name);

        chatMessagesContainer.appendChild(row);
    });
}

async function openChatWithUser(userId, userName) {
    currentChatUserId = userId;
    currentChatUserName = userName;
    document.getElementById('chatModalTitle').textContent = 'Чат с ' + userName;
    const backBtn = document.getElementById('backToUserListBtn');
    backBtn.style.display = 'block';
    backBtn.style.visibility = 'visible';
    await loadCurrentAdminChat();
}

async function loadCurrentAdminChat() {
    if (!currentChatUserId) return;
    try {
        const messages = await getAdminUserChat(currentChatUserId);
        renderAdminChatMessages(messages);
    } catch (error) {
        console.error('Помилка завантаження чату:', error);
        chatMessagesContainer.innerHTML = '<p style="color:red;">Не удалось загрузить сообщения.</p>';
    }
}

function renderAdminChatMessages(messages) {
    chatMessagesContainer.innerHTML = messages.map(m => `
        <div style="margin-bottom:0.6rem;">
            <strong>${m.sender === 'admin' ? 'Менеджер' : 'Пользователь'}:</strong> ${m.message}
            <div style="font-size:0.75rem; color:#888; margin-top:0.2rem;">${new Date(m.created_at).toLocaleString()}</div>
        </div>
    `).join('');
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    document.getElementById('backToUserListBtn').style.display = 'block';
}

chatInput.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        sendChatBtn.click();
    }
});

document.getElementById('backToUserListBtn').onclick = () => {
    currentChatUserId = null;
    currentChatUserName = '';
    document.getElementById('chatModalTitle').textContent = 'Чат с пользователями';
    document.getElementById('backToUserListBtn').style.display = 'none';
    loadAdminUserChatsForProfile();
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatChatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderChatMessages(messages) {
    if (!chatMessagesContainer) return;
    
    chatMessagesContainer.innerHTML = messages.map(msg => {
        const cssClass = msg.sender === 'admin' ? 'chat-admin' : 'chat-user';
        
        const isHtmlMessage = msg.message.includes('<div') || msg.message.includes('<span') || msg.message.includes('<strong') || msg.message.includes('order-receipt');
        
        const safeText = escapeHtml(msg.message).replace(/\n/g, '<br>');
        const messageContent = isHtmlMessage ? 
            `<div class="message-html">${msg.message}</div>` : 
            `<span class="message-text">${safeText}</span>`;
            
        const actions = msg.sender === 'user' ? `
            <button class="edit-btn" data-message-id="${msg.id}" style="margin-left: 5px; background: none; border: none; cursor: pointer;" title="Редагувати повідомлення">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; opacity: 0.7;">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>` : '';
            
        return `<div class="chat-message ${cssClass}" style="margin-bottom:0.6rem;" data-message-id="${msg.id}">
                    <strong>${msg.sender === 'admin' ? 'Менеджер' : 'Вы'}:</strong> ${messageContent}
                    <div class="message-footer">
                        <div style="font-size:0.75rem; color:#888;">${formatChatDate(msg.created_at)}</div>
                        <div class="message-actions">${actions}</div>
                    </div>
                </div>`;
    }).join('');

    // Додати обробники для кнопок видалення
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const messageId = btn.getAttribute('data-message-id');
            confirmDeleteBtn.setAttribute('data-message-id', messageId);
            deleteConfirmModal.style.display = 'block';
        };
    });

    // Додати обробники для кнопок редагування
    chatMessagesContainer.querySelectorAll('.edit-btn').forEach(btn => {
}]}        btn.onclick = (e) => {
            e.preventDefault();
            const messageDiv = btn.closest('.chat-message');
            const messageTextSpan = messageDiv.querySelector('.message-text');
            const actionsDiv = messageDiv.querySelector('.message-actions');
            const originalText = messageTextSpan.textContent;

            // Заменить текст на input
            messageTextSpan.innerHTML = `<input type="text" value="${originalText}" style="width: 100%; padding: 0.25rem; border: 1px solid #ccc; border-radius: 4px;">`;

            // Добавить кнопки save/cancel
            actionsDiv.innerHTML = `
                <button class="save-btn" style="background: none; border: none; cursor: pointer; color: green;" title="Зберегти">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px;">
                        <path d="M5 13l4 4L19 7" stroke="green" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="cancel-btn" style="background: none; border: none; cursor: pointer; color: red; margin-left: 5px;" title="Скасувати">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px;">
                        <path d="M18 6L6 18M6 6l12 12" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            `;

            // Обработчики для save и cancel
            const saveBtn = actionsDiv.querySelector('.save-btn');
            const cancelBtn = actionsDiv.querySelector('.cancel-btn');
            saveBtn.onclick = async () => {
                const newText = messageTextSpan.querySelector('input').value.trim();
                if (newText) {
                    try {
                        await updateUserChat(messageId, newText);
                        await loadChatMessages();
                    } catch (error) {
                        console.error('Помилка при оновленні повідомлення:', error);
                        alert('Не вдалося оновити повідомлення.');
                    }
                }
            };
            cancelBtn.onclick = () => {
                renderChatMessages(messages); // Перерендерить
            };
        };
    });
}

async function loadChatMessages() {
    try {
        if (isAdminUser) {
            await loadAdminUserChatsForProfile();
            return;
        }

        console.log('Loading chat messages...');
        const messages = await getUserChat();
        console.log('Received messages:', messages?.length || 0);
        
        chatInput.style.display = 'block';
        sendChatBtn.style.display = 'inline-block';

        if (Array.isArray(messages)) {
            renderChatMessages(messages);
            console.log('Chat messages rendered');
        }
    } catch (error) {
        console.error('Помилка при завантаженні чату:', error);
        alert('Не вдалося завантажити чат. Повторіть спробу. ' + (error.message || ''));
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    // Перенаправление на домашнюю страницу, если не аутентифицированы
    if (!localStorage.getItem('auth_token')) {
        alert('Для доступу до профілю необхідно увійти.');
        window.location.href = '/';
        return;
    }

    try {
        const user = await getCurrentUser();
        isAdminUser = user.is_admin;
    } catch (error) {
        console.error('Не удалось получить данные пользователя:', error);
    }

    updateCartCount();
    loadProfile();
});