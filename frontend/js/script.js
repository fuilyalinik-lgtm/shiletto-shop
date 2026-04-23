// Модальные окна
// Cart clearing fix v3.0 - 2026-04-08 - Clear on order confirmation
console.log('🛒 script.js loaded - cart clearing on order confirmation active');

// Глобальные переменные
let currentCategory = null;
let categories = [];

const loginModal = document.getElementById('loginModal');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const closeBtns = document.querySelectorAll('.close');

let isAdminUser = false;
let isRegisterMode = false; // false for login, true for register
let isVerificationStep = false;
let pendingRegistrationEmail = '';
let isPasswordResetMode = false;
let passwordResetStep = '';
let pendingPasswordResetEmail = '';
let pendingPasswordResetToken = '';

function setRegisterStatus(message = '') {
    const statusNode = document.getElementById('registerStatusText');
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.style.display = message ? 'block' : 'none';
}

function resetAuthModalState() {
    isRegisterMode = false;
    isVerificationStep = false;
    pendingRegistrationEmail = '';
    isPasswordResetMode = false;
    passwordResetStep = '';
    pendingPasswordResetEmail = '';
    pendingPasswordResetToken = '';
}

// Initialize modal mode
updateModalMode();

if (loginBtn && loginModal) {
    loginBtn.onclick = () => {
        resetAuthModalState();
        updateModalMode();
        loginModal.style.display = 'block';
    };
}

if (logoutBtn) {
    logoutBtn.onclick = () => {
        logoutUser();
        window.location.href = '/';
    };
}

closeBtns.forEach(btn => {
    btn.onclick = () => {
        if (loginModal) {
            loginModal.style.display = 'none';
            resetAuthModalState();
            updateModalMode();
        }
    };
});

function updateModalMode() {
    const modalTitle = document.getElementById('modalTitle');
    const regUsername = document.getElementById('regUsername');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const verificationCode = document.getElementById('regVerificationCode');
    const modalSubmitBtn = document.getElementById('modalSubmitBtn');
    const switchLink = document.getElementById('switchLink');
    const googleBtn = document.getElementById('googleLoginBtn');
    const oauthButtons = document.getElementById('oauthButtons');
    const authDivider = document.getElementById('authDivider');
    const forgotPasswordRow = document.getElementById('forgotPasswordRow');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const resendCodeRow = document.getElementById('resendCodeRow');
    const resendCodeLink = document.getElementById('resendCodeLink');

    if (isPasswordResetMode) {
        modalTitle.textContent = passwordResetStep === 'new_password' ? 'Новий пароль' : 'Відновлення пароля';
        regUsername.style.display = 'none';
        regUsername.required = false;
        loginEmail.style.display = passwordResetStep === 'code' ? 'none' : 'block';
        loginEmail.required = passwordResetStep === 'email';
        loginEmail.readOnly = passwordResetStep !== 'email';
        loginPassword.style.display = passwordResetStep === 'new_password' ? 'block' : 'none';
        loginPassword.required = passwordResetStep === 'new_password';
        loginPassword.placeholder = passwordResetStep === 'new_password' ? 'Новий пароль' : 'Пароль';
        verificationCode.style.display = passwordResetStep === 'code' ? 'block' : 'none';
        verificationCode.required = passwordResetStep === 'code';
        modalSubmitBtn.textContent = passwordResetStep === 'code'
            ? 'Підтвердити код'
            : passwordResetStep === 'new_password'
                ? 'Зберегти пароль'
                : 'Надіслати код';
        switchLink.innerHTML = '<a href="#" id="switchToLogin" class="auth-inline-link">Повернутися до входу</a>';
        switchLink.classList.add('auth-compact-links');
        resendCodeRow.classList.add('auth-compact-links');
        setRegisterStatus(
            passwordResetStep === 'code'
                ? `Ми надіслали код на ${pendingPasswordResetEmail || loginEmail.value.trim()}. Введіть його, щоб продовжити.`
                : passwordResetStep === 'new_password'
                    ? 'Введіть новий пароль для свого акаунта.'
                    : ''
        );
        oauthButtons.style.display = 'none';
        authDivider.style.display = 'none';
        forgotPasswordRow.style.display = 'none';
        resendCodeRow.style.display = passwordResetStep === 'code' ? 'inline-flex' : 'none';
        switchLink.style.display = 'inline-flex';
        document.getElementById('switchToLogin').onclick = (e) => {
            e.preventDefault();
            resetAuthModalState();
            updateModalMode();
        };
        if (passwordResetStep === 'code' && resendCodeLink) {
            resendCodeLink.onclick = async (e) => {
                e.preventDefault();
                try {
                    await requestPasswordReset(pendingPasswordResetEmail || loginEmail.value.trim());
                    queueNotification('Код для відновлення пароля надіслано повторно.', 'Успіх', 'success', 3000);
                } catch (error) {
                    showNotification('Помилка повторної відправки коду: ' + error.message, 'Помилка', 'error', 4000);
                }
            };
        }
        return;
    }

    switchLink.classList.remove('auth-compact-links');
    resendCodeRow.classList.remove('auth-compact-links');
    switchLink.style.display = '';

    if (isRegisterMode) {
        modalTitle.textContent = 'Реєстрація';
        regUsername.style.display = isVerificationStep ? 'none' : 'block';
        regUsername.required = !isVerificationStep;
        loginEmail.style.display = isVerificationStep ? 'none' : 'block';
        loginEmail.required = !isVerificationStep;
        loginPassword.style.display = isVerificationStep ? 'none' : 'block';
        loginPassword.required = !isVerificationStep;
        verificationCode.style.display = isVerificationStep ? 'block' : 'none';
        verificationCode.required = isVerificationStep;
        loginEmail.readOnly = isVerificationStep;
        modalSubmitBtn.textContent = isVerificationStep ? 'Підтвердити email' : 'Надіслати код';
        switchLink.innerHTML = 'Вже маєте акаунт? <a href="#" id="switchToLogin" class="auth-inline-link">Увійти</a>';
        setRegisterStatus(
            isVerificationStep
                ? `Ми надіслали код на ${pendingRegistrationEmail || loginEmail.value.trim()}. Введіть його, щоб завершити реєстрацію.`
                : ''
        );
        oauthButtons.style.display = '';
        authDivider.style.display = '';
        googleBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Зареєструватися через Google
        `;
        // Add event listener for switch to login
        document.getElementById('switchToLogin').onclick = (e) => {
            e.preventDefault();
            resetAuthModalState();
            updateModalMode();
        };
        forgotPasswordRow.style.display = 'none';
        resendCodeRow.style.display = 'none';
    } else {
        modalTitle.textContent = 'Вхід';
        regUsername.style.display = 'none';
        regUsername.required = false;
        loginEmail.style.display = 'block';
        loginEmail.required = true;
        loginEmail.readOnly = false;
        loginPassword.style.display = 'block';
        loginPassword.required = true;
        verificationCode.style.display = 'none';
        verificationCode.required = false;
        modalSubmitBtn.textContent = 'Вхід';
        switchLink.innerHTML = 'Ще не маєте акаунта? <a href="#" id="switchToRegister" class="auth-inline-link">Зареєструватися</a>';
        setRegisterStatus('');
        loginPassword.placeholder = 'Пароль';
        oauthButtons.style.display = '';
        authDivider.style.display = '';
        googleBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Увійти через Google
        `;
        // Add event listener for switch to register
        document.getElementById('switchToRegister').onclick = (e) => {
            e.preventDefault();
            isRegisterMode = true;
            isVerificationStep = false;
            pendingRegistrationEmail = '';
            updateModalMode();
        };
        forgotPasswordRow.style.display = 'block';
        resendCodeRow.style.display = 'none';
        if (forgotPasswordLink) {
            forgotPasswordLink.onclick = (e) => {
                e.preventDefault();
                isPasswordResetMode = true;
                passwordResetStep = 'email';
                pendingPasswordResetEmail = '';
                pendingPasswordResetToken = '';
                updateModalMode();
            };
        }
    }

    googleBtn.style.display = 'block';
}

async function getCurrentUser() {
    const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
    });
    if (!response.ok) throw new Error('Failed to get user');
    return await response.json();
}

const homeBtn = document.getElementById('homeBtn');
const chatBtn = document.getElementById('chatBtn');
const profileBtn = document.getElementById('profileBtn');
const cartBtn = document.getElementById('cartBtn');
const cartModal = document.getElementById('cartModal');
const chatModal = document.getElementById('chatModal');
const closeCartModalBtn = document.getElementById('closeCartModal');
const closeChatModalBtn = document.getElementById('closeChatModal');
const chatMessagesContainer = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const cartItemsContainer = document.getElementById('cartItems');
const chatAttachBtn = document.getElementById('chatAttachBtn');
const chatAttachmentController = typeof initChatAttachmentUI === 'function' ? initChatAttachmentUI() : null;

let currentSearch = '';
let currentSort = 'name';
let pendingOrderCart = null;
let orderDetailsPending = false;
let orderDetailsState = { step: 0, answers: {} };

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

// Проверить URL параметры для категории
const urlParams = new URLSearchParams(window.location.search);
const categoryParam = urlParams.get('category');
if (categoryParam) {
    currentCategory = Number(categoryParam);
    localStorage.setItem('currentCategory', currentCategory);
}
const orderConfirmModal = document.getElementById('orderConfirmModal');
const confirmOrderBtn = document.getElementById('confirmOrderBtn');
const cancelOrderBtn = document.getElementById('cancelOrderBtn');
const closeOrderConfirmModalBtn = document.getElementById('closeOrderConfirmModal');

const headerNavLinks = document.querySelectorAll('header nav button.nav-link');
headerNavLinks.forEach(link => {
    link.addEventListener('click', () => {
        headerNavLinks.forEach(btn => btn.classList.remove('active'));
        link.classList.add('active');
        
        // Переход на соответствующую страницу
        if (link.id === 'aboutBtn') {
            window.location.href = '/about';
        } else if (link.id === 'contactBtn') {
            window.location.href = '/contact';
        }
    });
});

const orderDetailSteps = [
    {
        id: 'recipientPhone',
        label: 'Введіть номер телефону отримувача',
        type: 'tel',
        placeholder: '+380XXXXXXXXX',
        required: true
    },
    {
        id: 'recipientName',
        label: 'ПІБ отримувача',
        type: 'text',
        placeholder: "Ім'я Прізвище По батькові",
        required: true
    },
    {
        id: 'recipientCity',
        label: 'Оберіть населений пункт отримувача',
        type: 'text',
        placeholder: 'Виберіть або введіть місто',
        list: [
            'Київ', 'Харків', 'Одеса', 'Дніпро', 'Львів', 'Запоріжжя', 'Кривий Ріг', 'Миколаїв', 'Вінниця', 'Херсон', 'Полтава', 'Чернігів', 'Черкаси', 'Суми', 'Житомир'
        ],
        required: true
    },
    {
        id: 'deliveryMethod',
        label: 'Спосіб отримання замовлення',
        type: 'select',
        options: [
            { value: 'postal', text: 'Самовивіз з поштових відділень' }
        ],
        required: true
    },
    {
        id: 'postalBranchNumber',
        label: 'Введіть номер поштового відділення',
        type: 'text',
        placeholder: 'Наприклад, 23 або 5',
        required: true,
        conditional: (answers) => answers.deliveryMethod === 'postal'
    },
    {
        id: 'paymentMethod',
        label: 'Спосіб оплати',
        type: 'select',
        options: [
            { value: 'cod', text: 'Накладений платіж (оплата при отриманні у відділенні пошти)' },
            { value: 'card', text: 'Оплата карткою Visa або MasterCard' }
        ],
        required: true
    }
];

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function loadOrderDetailsState() {
    const raw = localStorage.getItem('orderDetailsState');
    if (!raw) return { step: 0, answers: {} };
    try {
        const parsed = JSON.parse(raw);
        return {
            step: Number(parsed.step) || 0,
            answers: parsed.answers || {}
        };
    } catch {
        return { step: 0, answers: {} };
    }
}

function saveOrderDetailsState() {
    localStorage.setItem('orderDetailsState', JSON.stringify(orderDetailsState));
}

function resetOrderDetailsState() {
    orderDetailsState = { step: 0, answers: {} };
    localStorage.removeItem('orderDetailsState');
}

function setOrderDetailsPending(value) {
    orderDetailsPending = value;
    localStorage.setItem('orderDetailsPending', value ? 'true' : 'false');
    if (!value) {
        resetOrderDetailsState();
    } else {
        saveOrderDetailsState();
    }
}

function initOrderDetailsPending() {
    orderDetailsPending = localStorage.getItem('orderDetailsPending') === 'true';
    orderDetailsState = loadOrderDetailsState();
}

function getNextOrderDetailStep() {
    for (const step of orderDetailSteps) {
        if (step.conditional && !step.conditional(orderDetailsState.answers)) {
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(orderDetailsState.answers, step.id)) {
            return step;
        }
    }
    return null;
}

function getCurrentOrderDetailsForm() {
    return document.querySelector('.order-details-form-container');
}

function removeOrderDetailsForm() {
    const existing = getCurrentOrderDetailsForm();
    if (existing) {
        existing.remove();
    }
}

function renderOrderDetailsFormIfNeeded() {
    removeOrderDetailsForm();
    if (!orderDetailsPending) return;
    const nextStep = getNextOrderDetailStep();
    if (!nextStep) {
        finalizeOrderDetails();
        return;
    }
    renderOrderDetailsStep(nextStep);
}

function renderOrderDetailsStep(step) {
    removeOrderDetailsForm();
    if (!chatMessagesContainer) return;

    const container = document.createElement('div');
    container.className = 'chat-message chat-user order-details-form-container';
    container.style.maxWidth = '100%';
    container.style.background = '#fff8e1';
    container.style.border = '1px solid #f1c40f';
    container.style.padding = '1rem';
    container.style.marginTop = '0.75rem';
    container.style.borderRadius = '16px';

    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.marginBottom = '0.75rem';
    title.textContent = step.label;
    container.appendChild(title);

    let input;
    if (step.type === 'select') {
        input = document.createElement('select');
        input.style.width = '100%';
        input.style.padding = '0.75rem';
        input.style.border = '1px solid #e0e0e0';
        input.style.borderRadius = '10px';
        input.style.fontSize = '1rem';
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = 'Оберіть варіант';
        placeholderOption.disabled = true;
        placeholderOption.selected = true;
        input.appendChild(placeholderOption);
        for (const option of step.options) {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.text;
            input.appendChild(opt);
        }
    } else {
        input = document.createElement('input');
        input.type = step.type;
        input.placeholder = step.placeholder || '';
        input.style.width = '100%';
        input.style.padding = '0.75rem';
        input.style.border = '1px solid #e0e0e0';
        input.style.borderRadius = '10px';
        input.style.fontSize = '1rem';
        if (step.list) {
            const datalist = document.createElement('datalist');
            datalist.id = 'recipientCityList';
            for (const item of step.list) {
                const opt = document.createElement('option');
                opt.value = item;
                datalist.appendChild(opt);
            }
            container.appendChild(datalist);
            input.setAttribute('list', 'recipientCityList');
        }
    }
    container.appendChild(input);

    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.justifyContent = 'space-between';
    actionsRow.style.gap = '0.75rem';
    actionsRow.style.marginTop = '0.75rem';

    const submitButton = document.createElement('button');
    submitButton.type = 'button';
    submitButton.textContent = getNextOrderDetailStep() && orderDetailSteps.indexOf(step) < orderDetailSteps.length - 1 ? 'Далі' : 'Надіслати деталі';
    submitButton.className = 'cart-action-btn checkout-btn';
    submitButton.style.flex = '1';
    submitButton.onclick = () => handleOrderDetailsStepSubmit(step, input);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Відміна';
    cancelButton.className = 'cart-action-btn';
    cancelButton.style.flex = '1';
    cancelButton.style.background = '#f0f0f0';
    cancelButton.style.color = '#333';
    cancelButton.style.border = '1px solid #d1d1d1';
    cancelButton.onclick = cancelOrderDetails;

    actionsRow.appendChild(cancelButton);
    actionsRow.appendChild(submitButton);
    container.appendChild(actionsRow);

    chatMessagesContainer.appendChild(container);
    container.scrollIntoView({ behavior: 'smooth', block: 'end' });
    input.focus();
}

function cancelOrderDetails() {
    setOrderDetailsPending(false);
    removeOrderDetailsForm();
}

function handleOrderDetailsStepSubmit(step, input) {
    const value = input.value.trim();
    if (step.required && !value) {
        alert('Будь ласка, заповніть поле: ' + step.label.toLowerCase());
        input.focus();
        return;
    }
    orderDetailsState.answers[step.id] = value;
    saveOrderDetailsState();
    renderOrderDetailsFormIfNeeded();
}

function buildOrderDetailsSummary() {
    const answers = orderDetailsState.answers;
    const deliveryText = answers.deliveryMethod === 'postal' ? 'Самовивіз з поштових відділень' : 'Самовивіз';
    const paymentText = answers.paymentMethod === 'cod'
        ? 'Накладений платіж (оплата при отриманні у відділенні пошти)'
        : 'Оплата карткою Visa або MasterCard';
    const lines = [
        'Деталі замовлення:',
        `- Номер телефону: ${escapeHtml(answers.recipientPhone || '')}`,
        `- ПІБ отримувача: ${escapeHtml(answers.recipientName || '')}`,
        `- Населений пункт: ${escapeHtml(answers.recipientCity || '')}`,
        `- Спосіб отримання: ${deliveryText}`
    ];
    if (answers.deliveryMethod === 'postal') {
        lines.push(`- Номер поштового відділення: ${escapeHtml(answers.postalBranchNumber || '')}`);
    }
    lines.push(`- Спосіб оплати: ${paymentText}`);
    return lines.join('\n');
}

async function finalizeOrderDetails() {
    const summary = buildOrderDetailsSummary();
    try {
        await postUserChat(summary);
        setOrderDetailsPending(false);
        removeOrderDetailsForm();
        await loadChatMessages();
    } catch (error) {
        console.error('Помилка при надсиланні підсумку деталей замовлення:', error);
        alert('Не вдалося надіслати деталі замовлення. Спробуйте пізніше.');
    }
}

function formatChatDate(dateStr) {
    if (!dateStr) return '';
    let date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
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
const cartSummary = document.getElementById('cartSummary');
const checkoutBtn = document.getElementById('checkoutBtn');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const closeDeleteConfirmModalBtn = document.getElementById('closeDeleteConfirmModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

if (homeBtn) {
    homeBtn.onclick = () => {
        window.location.href = '/';
    };
}

if (chatBtn) {
    chatBtn.onclick = async () => {
        if (!authToken) {
            alert('Тільки для зареєстрованих користувачів. Увійдіть, щоб користуватися чатом.');
            if (loginModal) loginModal.style.display = 'block';
            return;
        }
        try {
            const user = await getCurrentUser();
            isAdminUser = user.is_admin;
            if (user.is_admin) {
                window.location.href = '/chat';
            } else {
                if (chatModal) {
                    chatModal.style.display = 'block';
                }
                await loadChatMessages();
            }
        } catch (error) {
            console.error('Помилка при отриманні користувача:', error);
            alert('Не вдалося завантажити чат. Спробуйте пізніше.');
        }
    };
}

if (closeChatModalBtn && chatModal) {
    closeChatModalBtn.onclick = () => {
        chatModal.style.display = 'none';
    };
}

if (cartBtn) {
    cartBtn.onclick = () => {
        renderCart();
        if (cartModal) cartModal.style.display = 'block';
    };
}

if (profileBtn) {
    profileBtn.onclick = () => {
        window.location.href = '/profile.html';
    };
}

if (closeCartModalBtn && cartModal) {
    closeCartModalBtn.onclick = () => {
        cartModal.style.display = 'none';
    };
}

if (closeDeleteConfirmModalBtn && deleteConfirmModal) {
    closeDeleteConfirmModalBtn.onclick = () => {
        deleteConfirmModal.style.display = 'none';
    };
}

if (confirmDeleteBtn) {
    confirmDeleteBtn.onclick = async () => {
        const messageId = confirmDeleteBtn.getAttribute('data-message-id');
        if (messageId) {
            try {
                await deleteUserChatMessage(messageId);
                await loadChatMessages(); // Перезагрузить сообщения
            } catch (error) {
                console.error('Помилка при видаленні повідомлення:', error);
                alert('Не вдалося видалити повідомлення. Спробуйте пізніше.');
            }
            if (deleteConfirmModal) deleteConfirmModal.style.display = 'none';
        }
    };
}

if (cancelDeleteBtn && deleteConfirmModal) {
    cancelDeleteBtn.onclick = () => {
        deleteConfirmModal.style.display = 'none';
    };
}

window.onclick = (event) => {
    if (event.target === cartModal && cartModal) cartModal.style.display = 'none';
    if (event.target === chatModal && chatModal) chatModal.style.display = 'none';
    if (event.target === deleteConfirmModal && deleteConfirmModal) deleteConfirmModal.style.display = 'none';
    if (event.target === orderConfirmModal && orderConfirmModal) orderConfirmModal.style.display = 'none';
};

function renderChatMessages(messages) {
    if (!chatMessagesContainer) return;
    console.log('🛒 Rendering chat messages, count:', messages?.length || 0);
    
    chatMessagesContainer.innerHTML = messages.map(msg => {
        const cssClass = msg.sender === 'admin' ? 'chat-admin' : 'chat-user';
        const content = buildChatMessageContent(msg);
        const canEditMessage = msg.sender === 'user' && !content.isHtmlMessage && !content.hasImage;
        const actions = msg.sender === 'user' ? `
            ${canEditMessage ? `
                <button class="edit-btn" data-message-id="${msg.id}" style="margin-left: 5px; background: none; border: none; cursor: pointer;" title="Редагувати повідомлення">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; opacity: 0.7;">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            ` : ''}
            <button class="delete-btn" data-message-id="${msg.id}" style="margin-left: 5px; background: none; border: none; cursor: pointer;" title="Видалити повідомлення">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; opacity: 0.7;">
                    <path d="M3 6h18" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M10 11v6" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M14 11v6" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        ` : '';
            
        return `<div class="chat-message ${cssClass}" style="margin-bottom:0.6rem;" data-message-id="${msg.id}">
                    <strong>${msg.sender === 'admin' ? 'Менеджер' : 'Вы'}:</strong> ${content.html}
                    <div class="message-footer">
                        <div style="font-size:0.75rem; color:#888;">${formatChatDate(msg.created_at)}</div>
                        <div class="message-actions">${actions}</div>
                    </div>
                </div>`;
    }).join('');

    // Додати обробники для кнопок видалення
    chatMessagesContainer.querySelectorAll('.delete-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const messageId = btn.getAttribute('data-message-id');
            confirmDeleteBtn.setAttribute('data-message-id', messageId);
            deleteConfirmModal.style.display = 'block';
        };
    });

    // Додати обробники для кнопок редагування
    chatMessagesContainer.querySelectorAll('.edit-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const messageDiv = btn.closest('.chat-message');
            const messageTextSpan = messageDiv.querySelector('.message-text');
            const actionsDiv = messageDiv.querySelector('.message-actions');
            const originalText = messageTextSpan.textContent;

            // Заменить текст на input
            messageTextSpan.innerHTML = `<input type="text" value="${originalText}" style="width: 100%; padding: 0.25rem; border: 1px solid #ccc; border-radius: 4px;">`;

            // Замінити дії на кнопки Зберегти/Скасувати
            actionsDiv.innerHTML = `
                <button class="save-edit-btn" style="margin-left: 5px; background: #4CAF50; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;">Зберегти</button>
                <button class="cancel-edit-btn" style="margin-left: 5px; background: #f44336; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;">Скасувати</button>
            `;

            // Обробник для Зберегти
            actionsDiv.querySelector('.save-edit-btn').onclick = async () => {
                const newText = messageTextSpan.querySelector('input').value.trim();
                if (!newText) {
                    alert('Повідомлення не може бути порожнім.');
                    return;
                }
                const messageId = messageDiv.getAttribute('data-message-id');
                try {
                    await updateUserChatMessage(messageId, newText);
                    await loadChatMessages(); // Перезагрузить сообщения
                } catch (error) {
                    console.error('Помилка при редагуванні повідомлення:', error);
                    alert('Не вдалося редагувати повідомлення. Спробуйте пізніше.');
                }
            };

            // Обробник для Скасувати
            actionsDiv.querySelector('.cancel-edit-btn').onclick = () => {
                loadChatMessages(); // Просто перезагрузить, чтобы вернуть исходное состояние
            };
        };
    });
    // Прокрутить список сообщений вниз к последнему (плавно)
    const lastMessage = chatMessagesContainer.querySelector('.chat-message:last-child');
    if (lastMessage) {
        lastMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else {
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
}

async function loadAdminUsersContainer() {
    try {
        const users = await getAdminUsers();
        const listContainer = document.getElementById('adminChatUserList');
        listContainer.innerHTML = '';

        if (!users.length) {
            listContainer.innerHTML = '<p>Нет зарегистрированных пользователей</p>';
            return;
        }

        users.forEach(u => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            row.style.padding = '0.4rem 0';
            row.style.borderBottom = '1px solid #eee';

            const label = document.createElement('div');
            let textLabel = `${u.display_name || `User #${u.id}`} (${u.email})`;
            if (u.unread_count && u.unread_count > 0) {
                textLabel += ` — ${u.unread_count} непрочитано`;
                label.style.fontWeight = 'bold';
                label.style.color = '#d60000';
            }
            label.textContent = textLabel;

            const openBtn = document.createElement('button');
            openBtn.className = 'btn-primary';
            openBtn.textContent = 'Открыть чат';
            openBtn.style.padding = '0.3rem 0.6rem';
            openBtn.style.fontSize = '0.8rem';
            openBtn.onclick = () => openAdminUserChat(u.id, u.display_name || `User #${u.id}`);

            row.appendChild(label);
            row.appendChild(openBtn);
            listContainer.appendChild(row);
        });
    } catch (error) {
        console.error('Помилка завантаження списку чатів:', error);
        document.getElementById('adminChatUserList').innerHTML = `<p style="color:red;">Помилка при завантаженні користувачів: ${error.message || error}</p>`;
    }
}

let selectedAdminUserId = null;
let selectedAdminUserName = '';

async function openAdminUserChat(userId, userName) {
    selectedAdminUserId = userId;
    selectedAdminUserName = userName;
    chatAttachmentController?.clear?.();
    chatAttachmentController?.setEnabled?.(true);

    document.getElementById('adminChatStatus').textContent = `Чат с ${userName}`;
    document.getElementById('adminChatStatus').style.display = 'block';
    document.getElementById('adminChatUserList').style.display = 'none';
    chatInput.style.display = 'block';
    sendChatBtn.style.display = 'inline-block';
    if (chatAttachBtn) chatAttachBtn.style.display = 'inline-flex';

    await refreshAdminUserChat();
    await loadAdminUsersContainer();  // обновить счётчик непрочитанных
}

async function refreshAdminUserChat() {
    if (!selectedAdminUserId) return;
    try {
        const messages = await getAdminUserChat(selectedAdminUserId);
        if (Array.isArray(messages)) {
            renderChatMessages(messages);
        }
    } catch (error) {
        console.error('Помилка завантаження чату користувача:', error);
        chatMessagesContainer.innerHTML = `<p style="color:red;">Не удалось загрузить чат: ${error.message || error}</p>`;
    }
}

async function loadChatMessages() {
    try {
        if (isAdminUser) {
            // В админ-режиме сначала показываем список пользователей, а не общий чат
            await loadAdminUsersContainer();
            document.getElementById('adminChatUserList').style.display = 'block';
            document.getElementById('adminChatStatus').style.display = 'none';
            chatMessagesContainer.innerHTML = '';
            chatInput.style.display = 'none';
            sendChatBtn.style.display = 'none';
            if (chatAttachBtn) chatAttachBtn.style.display = 'none';
            chatAttachmentController?.clear?.();
            chatAttachmentController?.setEnabled?.(false);
            return;
        }

        console.log('🛒 Loading chat messages...');
        const messages = await getUserChat();
        console.log('🛒 Received messages:', messages?.length || 0);
        if (messages && messages.length > 0) {
            console.log('🛒 First message preview:', messages[0].message?.substring(0, 50));
        }
        
        chatInput.style.display = 'block';
        sendChatBtn.style.display = 'inline-block';
        if (chatAttachBtn) chatAttachBtn.style.display = 'inline-flex';
        chatAttachmentController?.setEnabled?.(true);

        if (Array.isArray(messages)) {
            renderChatMessages(messages);
            console.log('🛒 Chat messages rendered');
            maybeClearPendingOrderChatAttention(messages);
        }

        renderOrderDetailsFormIfNeeded();
    } catch (error) {
        console.error('Помилка при завантаженні чату:', error);
        alert('Не вдалося завантажити чат. Повторіть спробу. ' + (error.message || ''));
    }
}

if (sendChatBtn) {
    sendChatBtn.onclick = async () => {
        console.log('🛒 sendChatBtn clicked - starting execution');
        const text = chatInput?.value.trim();
        const imageFile = chatAttachmentController?.getSelectedFile?.() || null;
        if (!text && !imageFile) return;

        if (isAdminUser) {
            if (!selectedAdminUserId) {
                alert('Оберіть користувача зі списку, щоб розпочати діалог.');
                return;
            }

            try {
                await postAdminChat(selectedAdminUserId, text || '', imageFile);
                chatInputAutoGrow?.reset();
                chatAttachmentController?.clear?.();
                await refreshAdminUserChat();
                return;
            } catch (error) {
                console.error('Помилка надсилання повідомлення адміна:', error);
                alert('Не вдалося надіслати повідомлення. Спробуйте пізніше.');
                return;
            }
        }

        try {
            await postUserChat(text || '', imageFile);
            console.log('🛒 Message sent successfully');
            chatInputAutoGrow?.reset();
            chatAttachmentController?.clear?.();
            
            console.log('🛒 Reloading chat messages...');
            await loadChatMessages();
        } catch (error) {
            console.error('Помилка при надсиланні повідомлення чату:', error);
            alert('Не вдалося надіслати повідомлення. Спробуйте пізніше.');
        }
    };
}

if (chatInput) {
    chatInput.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            sendChatBtn?.click();
        }
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
        // Явно удаляем ключ из localStorage при очистке корзины
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

function addToCart(product) {
    const cart = getCart();
    const existing = cart.find(item => item.id === product.id);

    if (product.availability_status === 'Немає в наявності') {
        alert('Товар наразі відсутній у наявності. Додавання у кошик тимчасово невожливе.');
        return;
    }

    const desired = existing ? existing.quantity + 1 : 1;
    if (product.stock !== null && product.stock !== undefined && desired > product.stock) {
        alert('Недостатньо товару на складі');
        return;
    }

    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            stock: product.stock,
            image: product.images && product.images.length > 0 ? product.images[0].url : ''
        });
    }

    saveCart(cart);
    updateCartCount();
    alert(`Товар «${product.name}» додано до кошика`);
}

function removeFromCart(productId) {
    const cart = getCart().filter(item => item.id !== productId);
    saveCart(cart);
    updateCartCount();
    renderCart();
}

function renderCart() {
    const cart = getCart();

    if (!cart.length) {
        cartItemsContainer.innerHTML = '<p>Корзина пуста.</p>';
        cartSummary.textContent = '';
        const checkoutTotal = document.getElementById('checkoutTotal');
        const checkoutText = document.getElementById('checkoutText');
        if (checkoutTotal) checkoutTotal.textContent = 'Загальна сума: 0 грн';
        if (checkoutText) checkoutText.textContent = 'Оформити замовлення';
        return;
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const formattedTotal = `ГРН. ${total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

    cartItemsContainer.innerHTML = cart.map(item => `
        <div class="cart-item">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" onclick="window.location.href='product.html?id=${item.id}'">` : ''}
            <div class="cart-item-info">
                <strong onclick="window.open('product.html?id=${item.id}', '_blank')" style="cursor: pointer;">${item.name}</strong>
                <div class="cart-item-meta">
                    <span class="cart-item-quantity">Кількість ${item.quantity}</span>
                    <span class="cart-item-price">${item.price} грн</span>
                </div>
            </div>
            <div class="cart-item-actions">
                <div class="count-controls">
                    <button onclick="changeCartQuantity(${item.id}, -1)">−</button>
                    <span class="cart-quantity">${item.quantity}</span>
                    <button onclick="changeCartQuantity(${item.id}, 1)">+</button>
                </div>
                <button class="remove-button" onclick="removeFromCart(${item.id})">×</button>
            </div>
        </div>
    `).join('');

    cartSummary.textContent = '';
    const checkoutTotal = document.getElementById('checkoutTotal');
    const checkoutText = document.getElementById('checkoutText');
    if (checkoutTotal) checkoutTotal.textContent = formattedTotal;
    if (checkoutText) checkoutText.textContent = 'ОФОРМИТИ';
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

function buildOrderMessage(cart) {
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const itemsHtml = cart.map(item => {
        const productUrl = `/product.html?id=${item.id}`;
        return `
            <div class="order-receipt-item">
                ${item.image ? `<a class="order-receipt-link" href="${productUrl}"><img class="order-receipt-img" src="${item.image}" alt="${escapeHtml(item.name)}"></a>` : ''}
                <div class="order-receipt-item-content">
                    <div class="order-receipt-item-title"><a class="order-receipt-link" href="${productUrl}">${escapeHtml(item.name)}</a></div>
                    <div class="order-receipt-item-meta">${item.quantity} × ${item.price} грн</div>
                </div>
                <div class="order-receipt-item-price">${item.quantity * item.price} грн</div>
            </div>`;
    }).join('');

    return `
        <div class="order-receipt">
            <div class="order-receipt-header">Чек замовлення</div>
            ${itemsHtml}
            <div class="order-receipt-total">
                <span class="order-receipt-summary-row">
                    <span>Загальна сума:</span>
                    <strong>${total} грн</strong>
                </span>
                <span class="order-receipt-summary-row">
                    <span>До сплати:</span>
                    <strong>${total} грн</strong>
                </span>
            </div>
        </div>`;
}

if (checkoutBtn) {
    checkoutBtn.onclick = () => {
        const cart = getCart();
        if (!cart || cart.length === 0) {
            alert('Кошик порожній. Додайте товари до оформлення.');
            return;
        }
        // Перенаправить на страницу оформления заказа
        window.location.href = '/checkout.html';
    };
}

function showOrderConfirmModal(cart) {
    if (!cart.length) {
        alert('Кошик порожній. Додайте товари.');
        return;
    }
    pendingOrderCart = cart;
    if (orderConfirmModal) {
        orderConfirmModal.style.display = 'block';
    }
}

function hideOrderConfirmModal() {
    if (orderConfirmModal) {
        orderConfirmModal.style.display = 'none';
    }
    pendingOrderCart = null;
}

if (confirmOrderBtn) {
    confirmOrderBtn.onclick = async () => {
        console.log('Confirm button clicked - clearing cart');
        // Сохраняем тележку перед закрытием модального окна
        const cartToSend = pendingOrderCart;
        hideOrderConfirmModal();
        
        if (cartToSend && cartToSend.length > 0) {
            // Очищаємо кошик ПРИ ПОДТВЕРЖДЕНИИ ЗАКАЗА
            console.log('🛒 Clearing cart on order confirmation...');
            saveCart([]);
            
            // Перевіряємо, що корзина дійсно очищена
            const cartAfterClear = getCart();
            console.log('🛒 Cart after clear (should be []):', cartAfterClear);
            console.log('🛒 localStorage.getItem("cart"):', localStorage.getItem('cart'));
            
            // Обновляем UI корзины
            updateCartCount();
            if (cartItemsContainer) {
                cartItemsContainer.innerHTML = '';
            }
            if (cartSummary) {
                cartSummary.textContent = '';
            }
            console.log('🛒 Cart cleared on order confirmation');
            
            // Строим чек и отправляем в чат
            const orderHtml = buildOrderMessage(cartToSend);
            console.log('🛒 Sending order to chat...');
            try {
                await postUserChat(orderHtml);
                console.log('🛒 Order sent successfully');
                setPendingOrderChatAttention();
                setOrderDetailsPending(true);
                
                // Закрываем окно корзины и переходим в чат
                if (cartModal) {
                    cartModal.style.display = 'none';
                }
                window.location.href = '/chat';
            } catch (error) {
                console.error('Помилка при відправці замовлення:', error);
                alert('Не вдалося надіслати замовлення. Спробуйте пізніше.');
            }
        } else {
            console.warn('No pending order cart');
            alert('Помилка: кошик порожній');
        }
    };
}

if (cancelOrderBtn) {
    cancelOrderBtn.onclick = hideOrderConfirmModal;
}

if (closeOrderConfirmModalBtn) {
    closeOrderConfirmModalBtn.onclick = hideOrderConfirmModal;
}

// Формы
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        if (isPasswordResetMode) {
            const email = pendingPasswordResetEmail || document.getElementById('loginEmail').value.trim();
            const verificationCode = document.getElementById('regVerificationCode').value.trim();
            const newPassword = document.getElementById('loginPassword').value;

            try {
                if (passwordResetStep === 'email') {
                    pendingPasswordResetEmail = document.getElementById('loginEmail').value.trim();
                    passwordResetStep = 'code';
                    updateModalMode();
                    await new Promise((resolve) => window.requestAnimationFrame(resolve));
                    try {
                        await requestPasswordReset(pendingPasswordResetEmail);
                    } catch (error) {
                        passwordResetStep = 'email';
                        updateModalMode();
                        throw error;
                    }
                    queueNotification('Код для відновлення пароля надіслано на вашу електронну пошту.', 'Успіх', 'success', 3000);
                    return;
                }

                if (passwordResetStep === 'code') {
                    const result = await verifyPasswordResetCode(email, verificationCode);
                    pendingPasswordResetToken = result.reset_token;
                    passwordResetStep = 'new_password';
                    document.getElementById('regVerificationCode').value = '';
                    updateModalMode();
                    return;
                }

                await confirmPasswordReset(email, pendingPasswordResetToken, newPassword);
                const loginResult = await loginUser(email, newPassword);
                isAdminUser = loginResult.is_admin;
                if (loginModal) loginModal.style.display = 'none';
                resetAuthModalState();
                if (loginForm) loginForm.reset();
                updateModalMode();
                updateAuthUI(loginResult.is_admin);
                showNotification('Пароль успішно оновлено, ви автоматично увійшли в акаунт.', 'Успіх', 'success', 3500);
                return;
            } catch (error) {
                showNotification('Помилка відновлення пароля: ' + error.message, 'Помилка', 'error', 4000);
                return;
            }
        }

        if (isRegisterMode) {
            const username = document.getElementById('regUsername').value.trim();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const verificationCode = document.getElementById('regVerificationCode').value.trim();

            try {
                if (!isVerificationStep) {
                    const validationError = validateRegistrationInput(username, email, password);
                    if (validationError) {
                        showNotification(validationError, 'Помилка', 'error', 4000);
                        return;
                    }
                    await requestRegistrationCode(username, email, password);
                    pendingRegistrationEmail = email;
                    isVerificationStep = true;
                    updateModalMode();
                    queueNotification('Код підтвердження надіслано на вашу електронну пошту.', 'Успіх', 'success', 3000);
                    return;
                }

                const result = await verifyRegistrationCode(email, verificationCode);
                if (result && result.token) {
                    try {
                        const profile = await getCurrentUser();
                        isAdminUser = profile.is_admin;
                        updateAuthUI(profile.is_admin);
                    } catch (profileError) {
                        console.warn('Не вдалося отримати профіль після реєстрації:', profileError);
                        updateAuthUI(false);
                    }
                }

                loginModal.style.display = 'none';
                isRegisterMode = false;
                isVerificationStep = false;
                pendingRegistrationEmail = '';
                loginForm.reset();
                updateModalMode();
                queueNotification('Email підтверджено, реєстрація завершена успішно.', 'Успіх', 'success', 3000);
                window.location.href = '/';
            } catch (error) {
                showNotification('Помилка реєстрації: ' + error.message, 'Помилка', 'error', 4000);
            }
        } else {
            // Login
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            try {
                const result = await loginUser(email, password);
                isAdminUser = result.is_admin;
                alert('Ви успішно авторизувалися та зможете відстежувати статус свого замовлення!');
                if (loginModal) loginModal.style.display = 'none';
                updateAuthUI(result.is_admin);
                loadContent();
            } catch (error) {
                alert('Помилка: ' + error.message);
            }
        }
    };
}



// Обработчик кнопки Google OAuth
const googleLoginBtn = document.getElementById('googleLoginBtn');
if (googleLoginBtn) {
    googleLoginBtn.onclick = async () => {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        await startGoogleAuth(nextPath);
    };
}

// Обновление UI на основе авторизации
function updateAuthUI(isAdmin = false) {
    const existingAdminLink = document.getElementById('adminPanelBtn');
    if (existingAdminLink) {
        existingAdminLink.remove();
    }

    if (authToken) {
        loginBtn.style.display = 'none';
        if (registerBtn) {
            registerBtn.style.display = 'none';
        }
        logoutBtn.style.display = 'inline-flex';
        profileBtn.style.display = 'inline-flex';
        chatBtn.style.display = 'inline-flex';

        if (isAdmin) {
            // Проверяем, нет ли уже кнопки админ-панели (чтобы избежать дублирования)
            if (!document.getElementById('adminPanelBtn')) {
                const adminBtn = document.createElement('button');
                adminBtn.id = 'adminPanelBtn';
                adminBtn.innerHTML = `<svg class="bottom-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V9" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 3V9H19" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H15" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 16H12" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Адмін`;
                adminBtn.onclick = () => {
                    window.location.href = '/admin/dashboard';
                };

                const bottomPanel = document.getElementById('bottomPanel');
                if (bottomPanel) {
                    bottomPanel.appendChild(adminBtn);
                }
            }
        }
    } else {
        loginBtn.style.display = 'inline-flex';
        if (registerBtn) {
            registerBtn.style.display = 'inline-flex';
        }
        logoutBtn.style.display = 'none';
        profileBtn.style.display = 'none';
        chatBtn.style.display = 'none';
    }
}

let currentProducts = [];
let subcategoriesHideTimer = null;

const mainLayout = document.querySelector('.main-layout');

function addToCartById(productId) {
    const product = currentProducts.find(p => p.id === productId);
    if (!product) {
        alert('Товар не знайдено');
        return;
    }
    addToCart(product);
}

function queueNotification(message, title = 'Повідомлення', type = 'info', duration = 3500) {
    try {
        sessionStorage.setItem('pendingNotification', JSON.stringify({ message, title, type, duration }));
    } catch (error) {
        console.warn('Не удалось сохранить уведомление:', error);
    }
}

function showPendingNotification() {
    try {
        const raw = sessionStorage.getItem('pendingNotification');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && data.message) {
            showNotification(data.message, data.title || 'Повідомлення', data.type || 'info', data.duration || 3500);
        }
    } catch (error) {
        console.warn('Не удалось показать отложенное уведомление:', error);
    } finally {
        sessionStorage.removeItem('pendingNotification');
    }
}

// Загрузка контента
async function loadContent() {
    try {
        await loadBanners();
        await loadCategories();
        await loadProducts();
    } catch (error) {
        console.error('Помилка завантаження:', error);
    }
}

let currentBannerIndex = 0;
let bannersList = [];
let bannerAutoplayInterval = null;

// Начать автоматическое переключение баннеров
function startBannerAutoplay() {
    stopBannerAutoplay(); // Остановить предыдущий интервал, если был
    if (bannersList.length > 1) {
        bannerAutoplayInterval = setInterval(() => {
            // Автоматическое переключение без паузы
            if (bannersList.length === 0) return;
            currentBannerIndex = (currentBannerIndex + 1) % bannersList.length;
            updateBannerDisplay();
        }, 5000); // 5 секунд
    }
}

// Остановить автоматическое переключение
function stopBannerAutoplay() {
    if (bannerAutoplayInterval) {
        clearInterval(bannerAutoplayInterval);
        bannerAutoplayInterval = null;
    }
}

// Перезапустить автопроигрывание с паузой после пользовательского взаимодействия
function resetBannerAutoplay() {
    stopBannerAutoplay();
    // Остановить на 10 секунд, потом возобновить автопроигрывание
    setTimeout(() => {
        startBannerAutoplay();
    }, 10000); // 10 секунд паузы
}

// Загрузить баннеры
async function loadBanners() {
    try {
        bannersList = await getBanners();
        currentBannerIndex = 0;
        displayBanners(bannersList);
        startBannerAutoplay();
    } catch (error) {
        console.error('Помилка завантаження банерів:', error);
    }
}

function displayBanners(banners) {
    const container = document.getElementById('bannersList');
    if (!container) {
        return;
    }

    if (banners.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <div class="banner-slides">
            ${banners.map((banner, index) => `
                <div class="banner-slide ${index === currentBannerIndex ? 'active' : ''}">
                    ${banner.image ? `<img src="${encodeURI(banner.image)}" alt="Баннер" onerror="this.style.display='none';" />` : ''}
                    ${banner.link_url ? `<a href="${banner.link_url}" target="_blank" rel="noopener" class="banner-click-area" style="position:absolute; top:${banner.area_y}%; left:${banner.area_x}%; width:${banner.area_width}%; height:${banner.area_height}%;"></a>` : ''}
                </div>
            `).join('')}
        </div>
        <button class="banner-nav prev" onclick="prevBanner()">&lt;</button>
        <button class="banner-nav next" onclick="nextBanner()">&gt;</button>
    `;
    
    // Добавляем pause-on-hover функцию
    const bannerSlidesContainer = container.querySelector('.banner-slides');
    if (bannerSlidesContainer) {
        bannerSlidesContainer.addEventListener('mouseenter', stopBannerAutoplay);
        bannerSlidesContainer.addEventListener('mouseleave', startBannerAutoplay);
    }
}

function nextBanner() {
    if (bannersList.length === 0) return;
    currentBannerIndex = (currentBannerIndex + 1) % bannersList.length;
    updateBannerDisplay();
    resetBannerAutoplay();
}

function prevBanner() {
    if (bannersList.length === 0) return;
    currentBannerIndex = (currentBannerIndex - 1 + bannersList.length) % bannersList.length;
    updateBannerDisplay();
    resetBannerAutoplay();
}

function updateBannerDisplay() {
    const slides = document.querySelectorAll('.banner-slide');
    slides.forEach((slide, index) => {
        slide.classList.remove('prev', 'active');
        
        if (index === currentBannerIndex) {
            slide.classList.add('active');
        }
    });
}

// Загрузить категории
async function loadCategories() {
    try {
        categories = await getCategories();
        displayCategories(categories);
        // Заполнить меню категориями после загрузки
        fillCatalogMenu();
    } catch (error) {
        console.error('Помилка завантаження категорій:', error);
    }
    // initCatalogMenu() теперь вызывается в DOMContentLoaded
}

function displayCategories(categories) {
    const container = document.querySelector('.categories-list');
    if (!container) return;

    const mainCategories = categories.filter(c => !c.parent_id);

    const html = mainCategories.map((main) => {
        const activeClass = currentCategory === main.id ? 'active' : '';
        return `
            <div class="category-item main-category ${activeClass}" data-id="${main.id}">${main.name}</div>
        `;
    }).join('');

    container.innerHTML = html;

    // Додати "Всі товари"
    const allBtn = document.createElement('div');
    allBtn.className = `category-item ${currentCategory === null ? 'active' : ''}`;
    allBtn.textContent = 'Всі товари';
    allBtn.addEventListener('click', () => selectCategory(null, allBtn));
    container.insertBefore(allBtn, container.firstChild);

    container.querySelectorAll('.main-category').forEach(item => {
        const id = Number(item.dataset.id);
        item.addEventListener('click', () => selectCategory(id, item));
        item.addEventListener('mouseenter', () => showSubcategories(id));
        item.addEventListener('mouseleave', () => scheduleHideSubcategories(100));
    });

    const section = document.querySelector('.categories-section');
    if (section) {
        section.addEventListener('mouseenter', cancelHideSubcategories);
        section.addEventListener('mouseleave', () => scheduleHideSubcategories(100));
    }
}

function scheduleHideSubcategories(delay = 150) {
    if (subcategoriesHideTimer) {
        clearTimeout(subcategoriesHideTimer);
    }
    subcategoriesHideTimer = setTimeout(() => {
        hideSubcategories();
        subcategoriesHideTimer = null;
    }, delay);
}

function cancelHideSubcategories() {
    if (subcategoriesHideTimer) {
        clearTimeout(subcategoriesHideTimer);
        subcategoriesHideTimer = null;
    }
}

function showSubcategories(parentId) {
    cancelHideSubcategories();
    const subContainer = document.getElementById('subcategoriesList');
    if (!subContainer) return;

    const childCategories = categories.filter(c => c.parent_id === parentId);
    if (!childCategories.length) {
        subContainer.style.display = 'none';
        subContainer.innerHTML = '';
        return;
    }

    subContainer.innerHTML = childCategories.map(sub => `
        <div class="category-item subcategory-item ${currentCategory === sub.id ? 'active' : ''}" data-id="${sub.id}">${sub.name}</div>
    `).join('');

    subContainer.style.display = 'flex';

    subContainer.querySelectorAll('.subcategory-item').forEach(item => {
        const id = Number(item.dataset.id);
        item.addEventListener('click', () => selectCategory(id, item));
    });

    subContainer.addEventListener('mouseenter', cancelHideSubcategories);
    subContainer.addEventListener('mouseleave', () => scheduleHideSubcategories(100));
}

function hideSubcategories() {
    const subContainer = document.getElementById('subcategoriesList');
    if (!subContainer) return;
    subContainer.style.display = 'none';
    subContainer.innerHTML = '';
}

// Таймер для закрытия меню каталога
let catalogMenuCloseTimer = null;
let catalogAllProductsMode = false; // Флаг для отслеживания режима "Всі товари"
let isMouseOverCatalogMenu = false; // Флаг для отслеживания курсора на меню

// Инициализация выпадающего меню Каталога
function initCatalogMenu() {
    const catalogBtn = document.getElementById('catalogBtn');
    const catalogMenu = document.getElementById('catalogMenu');
    const menuContent = document.getElementById('catalogMenuContent');
    const catalogDropdown = document.querySelector('.catalog-dropdown');
    
    if (!catalogBtn || !catalogMenu || !menuContent) return;
    
    // Заполнить меню категориями (если уже загружены)
    fillCatalogMenu();
    
    // Обработчик клика на саму кнопку Каталог
    catalogBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (catalogAllProductsMode) {
            // Отмена режима "всі товари"
            catalogAllProductsMode = false;
            currentCategory = null;
            localStorage.setItem('currentCategory', '');
            catalogBtn.classList.remove('active');
            // Скрыть меню
            if (catalogMenuCloseTimer) clearTimeout(catalogMenuCloseTimer);
            catalogMenu.classList.remove('show');
            // Перемещение блоков обратно и перезагрузка товаров
            setSectionOrderByCategory();
            loadProducts();
        } else {
            // Включить режим "всі товари"
            catalogAllProductsMode = true;
            currentCategory = null;
            localStorage.setItem('currentCategory', '');
            catalogBtn.classList.add('active');
            // Показать подчёркивание на кнопке
            setSectionOrderByCategory();
            loadProducts();
        }
    });
    
    // Обработчики для управления открытием/закрытием меню
    if (catalogDropdown) {
        catalogDropdown.addEventListener('mouseleave', () => {
            // Задерживаем закрытие на 500ms, но только если курсор не на самом меню
            if (!isMouseOverCatalogMenu) {
                catalogMenuCloseTimer = setTimeout(() => {
                    catalogMenu.classList.remove('show');
                }, 500);
            }
        });
        
        catalogDropdown.addEventListener('mouseenter', () => {
            // Отменяем закрытие, если пользователь вернулся
            if (catalogMenuCloseTimer) {
                clearTimeout(catalogMenuCloseTimer);
                catalogMenuCloseTimer = null;
            }
            catalogMenu.classList.add('show');
        });
    }
    
    // Обработчики для самого меню
    catalogMenu.addEventListener('mouseenter', () => {
        isMouseOverCatalogMenu = true;
        // Отменяем закрытие, если пользователь перешел на меню
        if (catalogMenuCloseTimer) {
            clearTimeout(catalogMenuCloseTimer);
            catalogMenuCloseTimer = null;
        }
        catalogMenu.classList.add('show');
    });
    
    catalogMenu.addEventListener('mouseleave', () => {
        isMouseOverCatalogMenu = false;
        // Задерживаем закрытие, когда пользователь уходит с меню
        catalogMenuCloseTimer = setTimeout(() => {
            catalogMenu.classList.remove('show');
        }, 500);
    });
}

function fillCatalogMenu() {
    const menuContent = document.getElementById('catalogMenuContent');
    if (!menuContent) return;
    
    const mainCategories = categories.filter(c => !c.parent_id);
    
    let menuHTML = '';
    mainCategories.forEach(main => {
        const subCategories = categories.filter(c => c.parent_id === main.id);
        
        menuHTML += `
            <div class="catalog-menu-category">
                <div class="catalog-menu-main-item" data-id="${main.id}">
                    ${main.name}
                </div>
                ${subCategories.length > 0 ? `
                    <div class="catalog-menu-sub-items">
                        ${subCategories.map(sub => `
                            <div class="catalog-menu-sub-item" data-id="${sub.id}">${sub.name}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    menuContent.innerHTML = menuHTML;
    
    // Добавить обработчики после создания элементов
    menuContent.querySelectorAll('.catalog-menu-main-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = Number(item.dataset.id);
            if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
                selectCategory(id, item);
                catalogAllProductsMode = false;
                document.getElementById('catalogBtn').classList.remove('active');
            } else {
                // На других страницах перейти на главную с категорией
                window.location.href = `/?category=${id}`;
            }
        });
    });
    
    menuContent.querySelectorAll('.catalog-menu-sub-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = Number(item.dataset.id);
            if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
                selectCategory(id, item);
                catalogAllProductsMode = false;
                document.getElementById('catalogBtn').classList.remove('active');
            } else {
                // На других страницах перейти на главную с категорией
                window.location.href = `/?category=${id}`;
            }
        });
    });
}

function closeCatalogMenu() {
    // Эта функция может быть использована для других нужд позже
}

function setSectionOrderByCategory() {
    const bannersSection = document.querySelector('.banners-section');
    const productsSection = document.querySelector('.products-section');
    const mainContent = document.querySelector('.main-content');

    if (!bannersSection || !productsSection || !mainContent) return;

    // Добавить класс анимации
    mainContent.classList.add('sections-animating');
    
    // Подождать немного и переместить блоки
    setTimeout(() => {
        // Товары выше баннеров если: выбрана категория ИЛИ активен режим "всі товари"
        if (currentCategory !== null || catalogAllProductsMode) {
            productsSection.parentNode.insertBefore(productsSection, bannersSection);
        } else {
            // Баннеры выше товаров, если ничего не выбрано
            bannersSection.parentNode.insertBefore(bannersSection, productsSection);
        }
        
        // Убрать класс анимации (запустит обратную анимацию)
        mainContent.classList.remove('sections-animating');
    }, 150);
}

function selectCategory(categoryId, element) {
    currentCategory = categoryId;
    localStorage.setItem('currentCategory', categoryId || '');
    document.querySelectorAll('.category-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');

    setSectionOrderByCategory();
    loadProducts();
}

// Загрузить товары
async function loadProducts() {
    try {
        let products;
        
        if (currentCategory) {
            // Проверяем, является ли выбранная категория основной (у которой нет parent_id)
            const selectedCategory = categories.find(c => c.id === currentCategory);
            const isMainCategory = selectedCategory && !selectedCategory.parent_id;
            
            if (isMainCategory) {
                // Если основная категория - загружаем товары из всех подкатегорий
                const subcategoryIds = categories
                    .filter(c => c.parent_id === currentCategory)
                    .map(c => c.id);
                
                // Загружаем товары для основной категории
                const mainCategoryProducts = await getProducts(currentCategory);
                
                // Загружаем товары для всех подкатегорий
                let allSubcategoryProducts = [];
                for (const subcatId of subcategoryIds) {
                    const subcatProducts = await getProducts(subcatId);
                    allSubcategoryProducts = allSubcategoryProducts.concat(subcatProducts);
                }
                
                // Объединяем товары и удаляем дубликаты
                products = [...mainCategoryProducts, ...allSubcategoryProducts];
                products = products.filter((product, index, self) =>
                    index === self.findIndex(p => p.id === product.id)
                );
            } else {
                // Если подкатегория - загружаем товары только для неё
                products = await getProducts(currentCategory);
            }
        } else {
            // Загружаем все товары
            products = await getProducts();
        }
        
        currentProducts = products;
        displayProducts(products);
    } catch (error) {
        console.error('Помилка завантаження товарів:', error);
    }
}

function updateProductDisplay() {
    displayProducts(currentProducts);
}

function displayProducts(allProducts) {
    const container = document.getElementById('productsList');
    const title = document.getElementById('productsTitle');
    
    if (!container || !title) {
        return;
    }

    if (currentCategory) {
        const cat = categories.find(c => c.id === currentCategory);
        title.textContent = cat ? cat.name : 'Товары';
    } else {
        title.textContent = 'Всі товари';
    }
    
    // Фильтрация по поиску
    let products = allProducts.filter(prod => 
        prod.name.toLowerCase().includes(currentSearch.toLowerCase())
    );
    
    // Сортировка
    products.sort((a, b) => {
        switch (currentSort) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'price-asc':
                return a.price - b.price;
            case 'price-desc':
                return b.price - a.price;
            case 'stock':
                return b.stock - a.stock;
            default:
                return 0;
        }
    });
    
    if (products.length === 0) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">Нет товаров в этой категории</p>';
        return;
    }
    
    container.innerHTML = products.map(prod => `
        <div class="product" style="${prod.availability_status === 'Немає в наявності' ? 'opacity: 0.5;' : ''}" onclick="window.location.href='product.html?id=${prod.id}'">
            ${prod.images && prod.images.length > 0 ? `<img src="${prod.images[0].url}" alt="${prod.name}">` : ''}
            <h3>${prod.name}</h3>
            <p><strong>${prod.price} грн.</strong></p>
            <p>${prod.availability_status}</p>
            <button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCartById(${prod.id})">Додати до кошика</button>
        </div>
    `).join('');
}

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    // Обработка токена из URL (для OAuth)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    if (token) {
        authToken = token;
        localStorage.setItem('auth_token', token);
        window.history.replaceState({}, document.title, window.location.pathname);
        showNotification('Ви успішно авторизувалися та зможете відстежувати статус свого замовлення!', 'Успіх', 'success', 3000);
    } else if (error) {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (error === 'oauth_failed') {
            showNotification('Помилка авторизації через Google', 'Помилка', 'error', 4000);
        } else if (error === 'google_oauth_not_configured') {
            showNotification('Вхід через Google тимчасово не налаштований на сервері.', 'Помилка', 'error', 5000);
        } else if (error === 'google_oauth_redirect_invalid') {
            showNotification('Вхід через Google ще не налаштований для поточного домену сайту.', 'Помилка', 'error', 5000);
        }
    }

    if (authToken) {
        try {
            const profile = await getCurrentUser();
            isAdminUser = profile.is_admin;
            updateAuthUI(profile.is_admin);
        } catch (error) {
            console.error('Не удалось определить пользователя:', error);
            logoutUser();
            updateAuthUI(false);
        }
    } else {
        updateAuthUI(false);
    }
    updateCartCount();
    initOrderDetailsPending();

    initCatalogMenu();

    // Восстановить состояние из URL параметров и localStorage перед загрузкой
    restoreStateFromURL();

    await loadContent();
    setSectionOrderByCategory();
    showPendingNotification();
    
    // Обработка хэшей для модальных окон
    if (window.location.hash === '#chat') {
        chatBtn.click();
        window.location.hash = '';
    } else if (window.location.hash === '#cart') {
        cartBtn.click();
        window.location.hash = '';
    }
    
    // Обработчики для поиска и сортировки товаров
    const productSearch = document.getElementById('productSearch');
    const productSort = document.getElementById('productSort');
    
    if (productSearch) {
        productSearch.addEventListener('input', (e) => {
            currentSearch = e.target.value;
            localStorage.setItem('productSearch', currentSearch);
            updateProductDisplay();
        });
    }
    
    if (productSort) {
        productSort.addEventListener('change', (e) => {
            currentSort = e.target.value;
            localStorage.setItem('productSort', currentSort);
            updateProductDisplay();
        });
    }
});

function restoreStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const search = urlParams.get('search') || '';
    const sort = urlParams.get('sort') || 'name';
    const categoryFromUrl = urlParams.get('category');
    const scrollToProduct = urlParams.get('scrollToProduct');

    // Установить значения в поля
    const productSearchField = document.getElementById('productSearch');
    const productSortField = document.getElementById('productSort');
    if (productSearchField) productSearchField.value = search;
    if (productSortField) productSortField.value = sort;

    // Установить текущие переменные
    currentSearch = search;
    currentSort = sort;

    if (categoryFromUrl !== null && categoryFromUrl !== '') {
        currentCategory = parseInt(categoryFromUrl);
    } else {
        const savedCategory = localStorage.getItem('currentCategory');
        currentCategory = savedCategory && savedCategory !== '' ? parseInt(savedCategory) : null;
    }

    // Зберегти в localStorage
    localStorage.setItem('productSearch', currentSearch);
    localStorage.setItem('productSort', currentSort);
    localStorage.setItem('currentCategory', currentCategory !== null ? currentCategory : '');

    if (scrollToProduct) {
        setTimeout(() => scrollToProductElement(scrollToProduct), 1000); // Задержка для загрузки
    }
}

function scrollToProductElement(productId) {
    const productElement = document.querySelector(`.product[onclick*="${productId}"]`);
    if (productElement) {
        productElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Додати тимчасову підсвітку
        productElement.style.boxShadow = '0 0 20px rgba(255, 107, 107, 0.8)';
        setTimeout(() => {
            productElement.style.boxShadow = '';
        }, 2000);
    }
}
