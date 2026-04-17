// checkout.js - Логика оформления заказа

console.log('🛒 checkout.js loaded');

// ===== КОНСТАНТЫ И ПЕРЕМЕННЫЕ =====
const errorMessageDiv = document.getElementById('errorMessage');
const successMessageDiv = document.getElementById('successMessage');
const guestAuthNoticeDiv = document.getElementById('guestAuthNotice');
const checkoutForm = document.getElementById('checkoutForm');
const cancelBtn = document.getElementById('cancelBtn');
const submitBtn = document.getElementById('submitBtn');
const backBtn = document.getElementById('backBtn');
const recipientPhoneInput = document.getElementById('recipientPhone');
const recipientNameInput = document.getElementById('recipientName');
const recipientCityInput = document.getElementById('recipientCity');
const deliveryMethodSelect = document.getElementById('deliveryMethod');
const postalBranchInput = document.getElementById('postalBranchNumber');
const postalFieldGroup = document.getElementById('postalFieldGroup');
const paymentMethodSelect = document.getElementById('paymentMethod');
const notesTextarea = document.getElementById('notes');
const orderReceiptItemsDiv = document.getElementById('orderReceiptItems');
const orderReceiptTotalSpan = document.getElementById('orderReceiptTotal');
const registerLink = document.getElementById('registerLink');
const registerModal = document.getElementById('registerModal');
const closeRegisterModalBtn = document.getElementById('closeRegisterModal');
const registerForm = document.getElementById('registerForm');
const regUsernameInput = document.getElementById('regUsername');
const regEmailInput = document.getElementById('regEmail');
const regPasswordInput = document.getElementById('regPassword');
const registerFeedback = document.getElementById('registerFeedback');

let checkoutAuthToken = localStorage.getItem('auth_token');
let isGuest = !checkoutAuthToken;
let guestIdentifier = localStorage.getItem('guestIdentifier') || generateGuestIdentifier();

// ===== HELPER ФУНКЦИИ =====
function generateGuestIdentifier() {
    const identifier = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('guestIdentifier', identifier);
    return identifier;
}

function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = 'block';
    setTimeout(() => {
        errorMessageDiv.style.display = 'none';
    }, 5000);
}

function showSuccess(message) {
    successMessageDiv.textContent = message;
    successMessageDiv.style.display = 'block';
}

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatPrice(value) {
    const number = Number(value) || 0;
    return number.toLocaleString('uk-UA') + ' грн';
}

function showRegisterError(message) {
    if (registerFeedback) {
        registerFeedback.textContent = message;
        registerFeedback.style.display = message ? 'block' : 'none';
    }
}

function resetRegisterForm() {
    if (registerForm) {
        registerForm.reset();
    }
    if (registerFeedback) {
        registerFeedback.textContent = '';
        registerFeedback.style.display = 'none';
    }
}

function openRegisterModal() {
    if (registerModal) {
        resetRegisterForm();
        registerModal.style.display = 'block';
    }
}

function closeRegisterModal() {
    if (registerModal) {
        registerModal.style.display = 'none';
    }
    resetRegisterForm();
}

async function handleRegisterFormSubmit(event) {
    event.preventDefault();
    const username = regUsernameInput?.value.trim() || '';
    const email = regEmailInput?.value.trim() || '';
    const password = regPasswordInput?.value.trim() || '';

    if (!username || !email || !password) {
        showRegisterError('Будь ласка, заповніть всі поля для реєстрації.');
        return;
    }

    if (password.length < 6) {
        showRegisterError('Пароль має містити щонайменше 6 символів.');
        return;
    }

    try {
        showRegisterError('');
        const result = await registerUser(username, email, password);
        if (result && result.token) {
            checkoutAuthToken = result.token;
            localStorage.setItem('auth_token', checkoutAuthToken);
        } else {
            const loginResult = await loginUser(email, password);
            checkoutAuthToken = loginResult.token;
        }

        isGuest = false;
        if (guestAuthNoticeDiv) {
            guestAuthNoticeDiv.style.display = 'none';
        }
        closeRegisterModal();
        showSuccess('Реєстрація пройшла успішно. Ви увійшли в систему і можете продовжити оформлення замовлення.');
    } catch (error) {
        showRegisterError('Помилка реєстрації: ' + (error.message || 'Невідома помилка'));
        console.error('Register error:', error);
    }
}

function renderOrderReceipt() {
    const cart = getCartFromStorage();
    const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

    if (!cart.length) {
        orderReceiptItemsDiv.innerHTML = '<div style="color:#666; padding: 0.5rem 0;">У вашій корзині наразі немає товарів.</div>';
        orderReceiptTotalSpan.textContent = formatPrice(0);
        return;
    }

    orderReceiptItemsDiv.innerHTML = cart.map(item => {
        const quantity = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const lineTotal = quantity * price;
        const escapedName = escapeHtml(item.name || 'Товар');
        const productUrl = item.id ? `/product.html?id=${encodeURIComponent(item.id)}` : '#';
        const imageHtml = item.image ? `<a class="order-receipt-link" href="${productUrl}" target="_blank" rel="noopener noreferrer"><img class="order-receipt-img" src="${escapeHtml(item.image)}" alt="${escapedName}"></a>` : '';

        return `
            <div class="order-receipt-item">
                ${imageHtml}
                <div class="order-receipt-item-content">
                    <div class="order-receipt-item-title"><a class="order-receipt-link" href="${productUrl}" target="_blank" rel="noopener noreferrer">${escapedName}</a></div>
                    <div class="order-receipt-item-meta">${quantity} × ${formatPrice(price)}</div>
                </div>
                <div class="order-receipt-item-price">${formatPrice(lineTotal)}</div>
            </div>
        `;
    }).join('');

    orderReceiptTotalSpan.textContent = formatPrice(total);
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
async function initCheckout() {
    console.log('🛒 Initializing checkout...');
    
    // Показать статус гостя
    if (isGuest) {
        guestAuthNoticeDiv.style.display = 'block';
    } else {
        // Для зареєстрованих користувачів заповнити email
        try {
            const user = await getCurrentUser();
            if (user) {
                document.getElementById('email').value = user.email || '';
            }
        } catch (error) {
            console.error('Error getting user:', error);
        }
    }

    renderOrderReceipt();

    // Установить слушатели событий
    setupEventListeners();
}

function getCartFromStorage() {
    try {
        const raw = localStorage.getItem('cart') || sessionStorage.getItem('cart');
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed;
        }

        if (parsed && Array.isArray(parsed.items)) {
            return parsed.items;
        }

        if (parsed && typeof parsed === 'object') {
            const values = Object.values(parsed).filter(item => item && typeof item === 'object' && ('id' in item || 'name' in item));
            return values.length ? values : [];
        }

        return [];
    } catch (error) {
        console.error('🛒 Failed to read cart from storage:', error, 'raw cart:', localStorage.getItem('cart'));
        return [];
    }
}

function setupEventListeners() {
    // Условное отображение поля почтовых отделений
    deliveryMethodSelect.addEventListener('change', () => {
        const isPostal = deliveryMethodSelect.value === 'postal';
        if (isPostal) {
            postalFieldGroup.classList.add('active');
            postalBranchInput.required = true;
        } else {
            postalFieldGroup.classList.remove('active');
            postalBranchInput.required = false;
        }
    });

    // Кнопки
    cancelBtn.addEventListener('click', () => {
        if (confirm('Ви впевнені, що хочете скасувати замовлення?')) {
            window.location.href = '/';
        }
    });

    backBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    if (registerLink) {
        registerLink.addEventListener('click', (event) => {
            event.preventDefault();
            openRegisterModal();
        });
    }

    if (closeRegisterModalBtn) {
        closeRegisterModalBtn.addEventListener('click', closeRegisterModal);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterFormSubmit);
    }

    window.addEventListener('click', (event) => {
        if (event.target === registerModal) {
            closeRegisterModal();
        }
    });

    // Отправка формы
    checkoutForm.addEventListener('submit', handleFormSubmit);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    console.log('🛒 Form submitted');

    const cart = getCartFromStorage();
    if (!cart.length) {
        showError('У вашій корзині немає товарів. Додайте товар до кошика, щоб оформити замовлення.');
        return;
    }

    // Валидация
    if (!validateForm()) {
        return;
    }

    // Дизейбл кнопку
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Обработка...';

    try {
        // Если пользователь может зарегистрироваться
        if (isGuest) {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            const username = document.getElementById('username').value.trim();

            // Если есть данные для регистрации, попытаться зарегистрировать
            if (email || password || username) {
                await registerAndCreateOrder();
            } else {
                // Иначе создать заказ как гость
                await createGuestOrderFlow();
            }
        } else {
            // Зареєстрований користувач
            await createRegisteredUserOrder();
        }

        showSuccess('✅ Замовлення успішно створено! Менеджер звʼяжеться з вами найближчим часом. Ви залишаєтеся на сторінці оформлення замовлення.');
        
        // Очистить корзину
        localStorage.removeItem('cart');
        
        // Обновить чек и интерфейс, но не перенаправлять пользователя
        renderOrderReceipt();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Завершити замовлення';

    } catch (error) {
        console.error('Error creating order:', error);
        showError('Помилка при створенні замовлення: ' + (error.message || 'Невідома помилка'));
        submitBtn.disabled = false;
        submitBtn.textContent = 'Завершити замовлення';
    }
}

function validateForm() {
    const phone = recipientPhoneInput.value.trim();
    const name = recipientNameInput.value.trim();
    const city = recipientCityInput.value.trim();
    const delivery = deliveryMethodSelect.value;
    const payment = paymentMethodSelect.value;
    const postalBranch = postalBranchInput.value.trim();

    if (!phone || !name || !city || !delivery || !payment) {
        showError('Будь ласка, заповніть все обов\'язкові поля.');
        return false;
    }

    if (delivery === 'postal' && !postalBranch) {
        showError('Будь ласка, введіть номер поштового відділення.');
        return false;
    }

    if (isGuest) {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();
        const username = document.getElementById('username').value.trim();
        const hasAuthData = email || password || username;

        if (hasAuthData) {
            // Все поля мають бути заповнені для реєстрації
            if (!email || !password || !username) {
                showError('Для реєстрації необхідно заповнити email, пароль та ім\'я користувача.');
                return false;
            }
            if (password.length < 6) {
                showError('Пароль мінімум 6 символів.');
                return false;
            }
        }
    }

    return true;
}

async function registerAndCreateOrder() {
    console.log('🛒 Registering user and creating order...');
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const username = document.getElementById('username').value.trim();

    try {
        // Зарегистрировать пользователя
        const registerResult = await registerUser(username, email, password);
        checkoutAuthToken = registerResult.token;
        localStorage.setItem('auth_token', checkoutAuthToken);
        isGuest = false;

        // Создать заказ
        await createRegisteredUserOrder();
    } catch (error) {
        throw new Error('Помилка реєстрації: ' + (error.message || 'Невідома помилка'));
    }
}

async function createRegisteredUserOrder() {
    console.log('🛒 Creating registered user order...');
    const cart = getCartFromStorage();
    const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    
    const orderData = {
        items_data: JSON.stringify(cart),
        total_price: total,
        recipient_phone: recipientPhoneInput.value.trim(),
        recipient_name: recipientNameInput.value.trim(),
        recipient_city: recipientCityInput.value.trim(),
        delivery_method: deliveryMethodSelect.value,
        postal_branch_number: postalBranchInput.value.trim() || null,
        payment_method: paymentMethodSelect.value
    };

    try {
        const result = await createOrder(orderData);
        console.log('🛒 Order created:', result);

        // Отправить резюме в чат
        const summary = buildOrderSummary();
        await postUserChat(summary);

    } catch (error) {
        throw new Error('Помилка при створенні замовлення: ' + (error.message || ''));
    }
}

async function createGuestOrderFlow() {
    console.log('🛒 Creating guest order...');
    const cart = getCartFromStorage();
    const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    
    const orderData = {
        items_data: JSON.stringify(cart),
        total_price: total,
        guest_phone: recipientPhoneInput.value.trim(),
        guest_name: recipientNameInput.value.trim(),
        guest_city: recipientCityInput.value.trim(),
        delivery_method: deliveryMethodSelect.value,
        postal_branch_number: postalBranchInput.value.trim() || null,
        payment_method: paymentMethodSelect.value,
        guest_identifier: guestIdentifier
    };

    try {
        const result = await createGuestOrder(orderData);
        console.log('🛒 Guest order created:', result);

        // Отправить резюме в гостевой чат
        const summary = buildOrderSummary();
        await postGuestChat(guestIdentifier, summary);

    } catch (error) {
        throw new Error('Помилка при створенні замовлення: ' + (error.message || ''));
    }
}

function buildOrderSummary() {
    const cart = getCartFromStorage();
    const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const deliveryText = deliveryMethodSelect.value === 'postal'
        ? `Пошта (${escapeHtml(postalBranchInput.value.trim()) || 'не вказано'})`
        : 'Кур’єр';
    const paymentText = paymentMethodSelect.value === 'cod' ? 'Накладений платіж' : 'Оплата карткою';

    let summary = `
        <div class="order-receipt">
            <div class="order-receipt-header">Чек замовлення</div>
            <div class="order-receipt-meta">
                <div>Телефон: ${escapeHtml(recipientPhoneInput.value)}</div>
                <div>Ім'я: ${escapeHtml(recipientNameInput.value)}</div>
                <div>Місто: ${escapeHtml(recipientCityInput.value)}</div>
                <div>Доставка: ${deliveryText}</div>
                <div>Оплата: ${paymentText}</div>
            </div>
            <div class="order-receipt-items">
                ${cart.map(item => {
                    const quantity = Number(item.quantity || 0);
                    const price = Number(item.price || 0);
                    const lineTotal = quantity * price;
                    const escapedName = escapeHtml(item.name || 'Товар');
                    const productUrl = item.id ? `/product.html?id=${encodeURIComponent(item.id)}` : '#';
                    const imageHtml = item.image ? `<a class="order-receipt-link" href="${productUrl}" target="_blank" rel="noopener noreferrer"><img class="order-receipt-img" src="${escapeHtml(item.image)}" alt="${escapedName}"></a>` : '';

                    return `
                        <div class="order-receipt-item">
                            ${imageHtml}
                            <div class="order-receipt-item-content">
                                <div class="order-receipt-item-title"><a class="order-receipt-link" href="${productUrl}" target="_blank" rel="noopener noreferrer">${escapedName}</a></div>
                                <div class="order-receipt-item-meta">${quantity} × ${formatPrice(price)}</div>
                            </div>
                            <div class="order-receipt-item-price">${formatPrice(lineTotal)}</div>
                        </div>`;
                }).join('')}
            </div>
            ${notesTextarea.value.trim() ? `<div class="order-receipt-note"><strong>Примітки:</strong> ${escapeHtml(notesTextarea.value.trim())}</div>` : ''}
            <div class="order-receipt-total">
                <span>Загальна сума:</span>
                <strong>${formatPrice(total)}</strong>
            </div>
        </div>
    `;

    return summary;
}

// ===== MAIN =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckout);
} else {
    initCheckout();
}
