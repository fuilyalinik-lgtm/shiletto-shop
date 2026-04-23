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
const recipientCityCombobox = document.getElementById('recipientCityCombobox');
const recipientCityOptions = document.getElementById('recipientCityOptions');
const recipientCityEmpty = document.getElementById('recipientCityEmpty');
const deliveryMethodSelect = document.getElementById('deliveryMethod');
const deliveryMethodCombobox = document.getElementById('deliveryMethodCombobox');
const deliveryMethodTrigger = document.getElementById('deliveryMethodTrigger');
const deliveryMethodValue = document.getElementById('deliveryMethodValue');
const deliveryMethodOptions = document.getElementById('deliveryMethodOptions');
const postalBranchInput = document.getElementById('postalBranchNumber');
const postalFieldGroup = document.getElementById('postalFieldGroup');
const postalBranchLabel = document.getElementById('postalBranchLabel');
const paymentMethodSelect = document.getElementById('paymentMethod');
const paymentMethodCombobox = document.getElementById('paymentMethodCombobox');
const paymentMethodTrigger = document.getElementById('paymentMethodTrigger');
const paymentMethodValue = document.getElementById('paymentMethodValue');
const paymentMethodOptions = document.getElementById('paymentMethodOptions');
const paymentDeliveryNote = document.getElementById('paymentDeliveryNote');
const notesTextarea = document.getElementById('notes');
const orderReceiptItemsDiv = document.getElementById('orderReceiptItems');
const orderReceiptTotalSpan = document.getElementById('orderReceiptTotal');
const checkoutAuthNoticeDiv = document.getElementById('checkoutAuthNotice');
const registerLink = document.getElementById('registerLink');
const loginModal = document.getElementById('loginModal');
const closeLoginModalBtn = document.getElementById('closeLoginModal');
const loginForm = document.getElementById('loginForm');
const regUsernameInput = document.getElementById('regUsername');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const verificationCodeInput = document.getElementById('regVerificationCode');
const registerStatusText = document.getElementById('registerStatusText');
const registerFeedback = document.getElementById('registerFeedback');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const switchLink = document.getElementById('switchLink');

let checkoutAuthToken = localStorage.getItem('auth_token');
let isGuest = !checkoutAuthToken;
let guestIdentifier = localStorage.getItem('guestIdentifier') || generateGuestIdentifier();
let isRegisterMode = false;
let isVerificationStep = false;
let pendingRegistrationEmail = '';
let isPasswordResetMode = false;
let passwordResetStep = '';
let pendingPasswordResetEmail = '';
let pendingPasswordResetToken = '';
const CITY_OPTIONS = [
    'Київ',
    'Вінниця',
    'Луцьк',
    'Дніпро',
    'Житомир',
    'Ужгород',
    'Запоріжжя',
    'Івано-Франківськ',
    'Кропивницький',
    'Львів',
    'Миколаїв',
    'Одеса',
    'Полтава',
    'Рівне',
    'Суми',
    'Тернопіль',
    'Харків',
    'Херсон',
    'Хмельницький',
    'Черкаси',
    'Чернівці',
    'Чернігів'
];
let filteredCityOptions = [...CITY_OPTIONS];
let activeCityIndex = -1;

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
    successMessageDiv.innerHTML = message;
    successMessageDiv.style.display = 'block';
    successMessageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

function normalizeCityValue(value) {
    return String(value || '')
        .trim()
        .toLocaleLowerCase('uk-UA')
        .replace(/['`’ʼ-]/g, '');
}

function openCityCombobox() {
    if (!recipientCityCombobox) return;
    recipientCityCombobox.classList.add('open');
}

function closeCityCombobox() {
    if (!recipientCityCombobox) return;
    recipientCityCombobox.classList.remove('open');
    activeCityIndex = -1;
}

function closePickerCombobox(combobox, trigger) {
    if (!combobox) return;
    combobox.classList.remove('open');
    if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
    }
}

function closeOtherPickerComboboxes(exceptCombobox = null) {
    document.querySelectorAll('.picker-combobox.open').forEach((combobox) => {
        if (combobox !== exceptCombobox) {
            const trigger = combobox.querySelector('.picker-combobox-trigger');
            closePickerCombobox(combobox, trigger);
        }
    });
}

function applyCityValue(cityName) {
    if (!recipientCityInput) return;

    recipientCityInput.value = cityName;
    saveCheckoutFormState();
    renderCityOptions(recipientCityInput.value);
    closeCityCombobox();
}

function updateActiveCityOption() {
    if (!recipientCityOptions) return;

    const optionButtons = recipientCityOptions.querySelectorAll('.city-option');
    optionButtons.forEach((button, index) => {
        button.classList.toggle('is-active', index === activeCityIndex);
    });
}

function renderCityOptions(query = '') {
    if (!recipientCityOptions || !recipientCityEmpty) return;

    const normalizedQuery = normalizeCityValue(query);
    filteredCityOptions = CITY_OPTIONS.filter((city) => {
        const normalizedCity = normalizeCityValue(city);
        return !normalizedQuery || normalizedCity.includes(normalizedQuery);
    });

    activeCityIndex = filteredCityOptions.length ? 0 : -1;
    recipientCityOptions.innerHTML = filteredCityOptions.map((city, index) => `
        <button type="button" class="city-option${index === activeCityIndex ? ' is-active' : ''}" data-city="${escapeHtml(city)}">
            ${escapeHtml(city)}
        </button>
    `).join('');

    recipientCityEmpty.classList.toggle('visible', filteredCityOptions.length === 0);
}

function handleCityComboboxKeydown(event) {
    if (!recipientCityCombobox?.classList.contains('open')) {
        if (event.key === 'ArrowDown') {
            openCityCombobox();
            renderCityOptions(recipientCityInput?.value || '');
            event.preventDefault();
        }
        return;
    }

    if (event.key === 'Escape') {
        closeCityCombobox();
        return;
    }

    if (!filteredCityOptions.length) {
        return;
    }

    if (event.key === 'ArrowDown') {
        activeCityIndex = (activeCityIndex + 1) % filteredCityOptions.length;
        updateActiveCityOption();
        event.preventDefault();
    }

    if (event.key === 'ArrowUp') {
        activeCityIndex = (activeCityIndex - 1 + filteredCityOptions.length) % filteredCityOptions.length;
        updateActiveCityOption();
        event.preventDefault();
    }

    if (event.key === 'Enter' && activeCityIndex >= 0) {
        applyCityValue(filteredCityOptions[activeCityIndex]);
        event.preventDefault();
    }
}

function initCityCombobox() {
    if (!recipientCityInput || !recipientCityCombobox || !recipientCityOptions || !recipientCityEmpty) {
        return;
    }

    renderCityOptions(recipientCityInput.value);

    recipientCityInput.addEventListener('focus', () => {
        renderCityOptions(recipientCityInput.value);
        openCityCombobox();
    });

    recipientCityInput.addEventListener('click', () => {
        renderCityOptions(recipientCityInput.value);
        openCityCombobox();
    });

    recipientCityInput.addEventListener('input', () => {
        renderCityOptions(recipientCityInput.value);
        openCityCombobox();
    });

    recipientCityInput.addEventListener('keydown', handleCityComboboxKeydown);

    recipientCityOptions.addEventListener('click', (event) => {
        const option = event.target.closest('.city-option');
        if (!option) return;

        applyCityValue(option.dataset.city || option.textContent.trim());
        recipientCityInput.focus();
    });

    document.addEventListener('click', (event) => {
        if (!recipientCityCombobox.contains(event.target)) {
            closeCityCombobox();
        }
    });
}

function initPickerCombobox({ select, combobox, trigger, valueNode, optionsContainer }) {
    if (!select || !combobox || !trigger || !valueNode || !optionsContainer) {
        return;
    }

    const options = Array.from(select.options).map((option) => ({
        value: option.value,
        label: option.textContent.trim()
    }));

    const placeholderOption = options.find((option) => !option.value);
    const placeholderLabel = placeholderOption?.label || 'Виберіть';
    let activeIndex = Math.max(0, select.selectedIndex);

    function syncTriggerLabel() {
        const selectedOption = options.find((option) => option.value === select.value) || placeholderOption;
        const label = selectedOption?.label || placeholderLabel;
        const isPlaceholder = !select.value;

        valueNode.textContent = label;
        valueNode.classList.toggle('is-placeholder', isPlaceholder);
    }

    function renderOptions() {
        optionsContainer.innerHTML = options
            .filter((option) => option.value)
            .map((option, index) => `
                <button
                    type="button"
                    class="picker-option${option.value === select.value ? ' is-selected' : ''}${index === activeIndex ? ' is-active' : ''}"
                    data-value="${escapeHtml(option.value)}"
                >
                    ${escapeHtml(option.label)}
                </button>
            `)
            .join('');
    }

    function openCombobox() {
        closeCityCombobox();
        closeOtherPickerComboboxes(combobox);
        combobox.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        activeIndex = Math.max(0, options.findIndex((option) => option.value === select.value) - 1);
        renderOptions();
    }

    function syncFromSelect() {
        syncTriggerLabel();
        renderOptions();
    }

    function applyValue(value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncFromSelect();
        closePickerCombobox(combobox, trigger);
    }

    trigger.addEventListener('click', () => {
        const isOpen = combobox.classList.contains('open');
        if (isOpen) {
            closePickerCombobox(combobox, trigger);
            return;
        }

        openCombobox();
    });

    trigger.addEventListener('keydown', (event) => {
        const enabledOptions = options.filter((option) => option.value);
        if (!enabledOptions.length) return;

        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            if (!combobox.classList.contains('open')) {
                openCombobox();
            } else if (event.key === 'ArrowDown') {
                activeIndex = (activeIndex + 1) % enabledOptions.length;
                renderOptions();
            } else {
                applyValue(enabledOptions[Math.max(activeIndex, 0)]?.value || '');
            }
            event.preventDefault();
        }

        if (event.key === 'ArrowUp' && combobox.classList.contains('open')) {
            activeIndex = (activeIndex - 1 + enabledOptions.length) % enabledOptions.length;
            renderOptions();
            event.preventDefault();
        }

        if (event.key === 'Escape') {
            closePickerCombobox(combobox, trigger);
            event.preventDefault();
        }
    });

    optionsContainer.addEventListener('click', (event) => {
        const optionButton = event.target.closest('.picker-option');
        if (!optionButton) return;

        applyValue(optionButton.dataset.value || '');
    });

    select.addEventListener('change', syncFromSelect);

    document.addEventListener('click', (event) => {
        if (!combobox.contains(event.target)) {
            closePickerCombobox(combobox, trigger);
        }
    });

    syncFromSelect();
}

function initSelectComboboxes() {
    initPickerCombobox({
        select: deliveryMethodSelect,
        combobox: deliveryMethodCombobox,
        trigger: deliveryMethodTrigger,
        valueNode: deliveryMethodValue,
        optionsContainer: deliveryMethodOptions
    });

    initPickerCombobox({
        select: paymentMethodSelect,
        combobox: paymentMethodCombobox,
        trigger: paymentMethodTrigger,
        valueNode: paymentMethodValue,
        optionsContainer: paymentMethodOptions
    });
}

function getOrderDueTotal() {
    const cart = getCartFromStorage();
    return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
}

function updatePaymentDeliveryNote() {
    if (!paymentDeliveryNote) {
        return;
    }

    const baseNote = 'Доставка здійснюється за тарифами перевізника.';
    if (paymentMethodSelect?.value !== 'cod') {
        paymentDeliveryNote.textContent = baseNote;
        return;
    }

    const codFee = 20 + getOrderDueTotal() * 0.02;
    paymentDeliveryNote.innerHTML = `${baseNote} Вартість накладеного платежу: 20 грн. + 2% від суми замовлення, всього <strong>${Number(codFee).toLocaleString('uk-UA')}</strong> грн.`;
}

function getDeliveryFieldConfig(deliveryMethod) {
    switch (deliveryMethod) {
        case 'nova_branch':
            return {
                visible: true,
                label: 'Номер поштового відділення *',
                placeholder: 'Наприклад: № 29'
            };
        case 'nova_locker':
            return {
                visible: true,
                label: 'Номер поштомату *',
                placeholder: 'Наприклад: № 4796'
            };
        case 'nova_courier':
            return {
                visible: true,
                label: 'Адреса доставки *',
                placeholder: 'Наприклад: вул. Хрещатик, 10, кв. 5'
            };
        case 'other_post':
            return {
                visible: true,
                label: 'Адреса доставки *',
                placeholder: 'Вкажіть повну адресу доставки'
            };
        default:
            return {
                visible: false,
                label: 'Номер поштового відділення *',
                placeholder: 'Наприклад: № 29'
            };
    }
}

function updateDeliveryFieldVisibility() {
    const config = getDeliveryFieldConfig(deliveryMethodSelect?.value || '');

    if (postalFieldGroup) {
        postalFieldGroup.classList.toggle('active', config.visible);
    }

    if (postalBranchInput) {
        postalBranchInput.required = config.visible;
        postalBranchInput.placeholder = config.placeholder;
    }

    if (postalBranchLabel) {
        postalBranchLabel.textContent = config.label;
    }
}

function showRegisterError(message) {
    if (registerFeedback) {
        registerFeedback.textContent = message;
        registerFeedback.style.display = message ? 'block' : 'none';
    }
}

function setRegisterStatus(message) {
    if (registerStatusText) {
        registerStatusText.textContent = message;
        registerStatusText.style.display = message ? 'block' : 'none';
    }
}

function updateModalMode() {
    const modalTitle = document.getElementById('modalTitle');
    const modalSubmitBtn = document.getElementById('modalSubmitBtn');
    const oauthButtons = document.getElementById('oauthButtons');
    const authDivider = document.getElementById('authDivider');
    const forgotPasswordRow = document.getElementById('forgotPasswordRow');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const resendCodeRow = document.getElementById('resendCodeRow');
    const resendCodeLink = document.getElementById('resendCodeLink');

    if (isPasswordResetMode) {
        if (modalTitle) {
            modalTitle.textContent = passwordResetStep === 'new_password' ? 'Новий пароль' : 'Відновлення пароля';
        }
        if (regUsernameInput) {
            regUsernameInput.style.display = 'none';
            regUsernameInput.required = false;
        }
        if (loginEmailInput) {
            loginEmailInput.style.display = passwordResetStep === 'code' ? 'none' : 'block';
            loginEmailInput.required = passwordResetStep === 'email';
            loginEmailInput.readOnly = passwordResetStep !== 'email';
        }
        if (loginPasswordInput) {
            loginPasswordInput.style.display = passwordResetStep === 'new_password' ? 'block' : 'none';
            loginPasswordInput.required = passwordResetStep === 'new_password';
            loginPasswordInput.placeholder = passwordResetStep === 'new_password' ? 'Новий пароль' : 'Пароль';
        }
        if (verificationCodeInput) {
            verificationCodeInput.style.display = passwordResetStep === 'code' ? 'block' : 'none';
            verificationCodeInput.required = passwordResetStep === 'code';
        }
        if (modalSubmitBtn) {
            modalSubmitBtn.textContent = passwordResetStep === 'code'
                ? 'Підтвердити код'
                : passwordResetStep === 'new_password'
                    ? 'Зберегти пароль'
                    : 'Надіслати код';
        }
        if (switchLink) {
            switchLink.innerHTML = '<a href="#" id="switchToLogin" class="auth-inline-link">Повернутися до входу</a>';
            switchLink.classList.add('auth-compact-links');
            switchLink.style.display = 'inline-flex';
            const switchAnchor = document.getElementById('switchToLogin');
            if (switchAnchor) {
                switchAnchor.onclick = (event) => {
                    event.preventDefault();
                    resetRegisterForm();
                };
            }
        }
        if (resendCodeRow) resendCodeRow.classList.add('auth-compact-links');
        if (forgotPasswordRow) forgotPasswordRow.style.display = 'none';
        if (oauthButtons) oauthButtons.style.display = 'none';
        if (authDivider) authDivider.style.display = 'none';
        if (resendCodeRow) resendCodeRow.style.display = passwordResetStep === 'code' ? 'inline-flex' : 'none';
        setRegisterStatus(
            passwordResetStep === 'code'
                ? `Ми надіслали код на ${pendingPasswordResetEmail || (loginEmailInput?.value.trim() || '')}. Введіть його, щоб продовжити.`
                : passwordResetStep === 'new_password'
                    ? 'Введіть новий пароль для свого акаунта.'
                    : ''
        );
        if (passwordResetStep === 'code' && resendCodeLink) {
            resendCodeLink.onclick = async (event) => {
                event.preventDefault();
                try {
                    await requestPasswordReset(pendingPasswordResetEmail || (loginEmailInput?.value.trim() || ''));
                    showSuccess('Код для відновлення пароля надіслано повторно.');
                } catch (error) {
                    showRegisterError('Помилка повторної відправки коду: ' + error.message);
                }
            };
        }
        return;
    }

    if (switchLink) {
        switchLink.classList.remove('auth-compact-links');
        switchLink.style.display = '';
    }
    if (resendCodeRow) resendCodeRow.classList.remove('auth-compact-links');

    if (modalTitle) {
        modalTitle.textContent = isRegisterMode ? 'Реєстрація' : 'Вхід';
    }
    if (regUsernameInput) {
        regUsernameInput.style.display = isRegisterMode && !isVerificationStep ? 'block' : 'none';
        regUsernameInput.required = isRegisterMode && !isVerificationStep;
    }
    if (loginEmailInput) {
        loginEmailInput.style.display = isRegisterMode && isVerificationStep ? 'none' : 'block';
        loginEmailInput.required = !isRegisterMode || !isVerificationStep;
        loginEmailInput.readOnly = isRegisterMode && isVerificationStep;
    }
    if (loginPasswordInput) {
        loginPasswordInput.style.display = isRegisterMode && isVerificationStep ? 'none' : 'block';
        loginPasswordInput.required = !isRegisterMode || !isVerificationStep;
        loginPasswordInput.placeholder = 'Пароль';
    }
    if (verificationCodeInput) {
        verificationCodeInput.style.display = isRegisterMode && isVerificationStep ? 'block' : 'none';
        verificationCodeInput.required = isRegisterMode && isVerificationStep;
    }
    if (modalSubmitBtn) {
        modalSubmitBtn.textContent = isRegisterMode
            ? (isVerificationStep ? 'Підтвердити email' : 'Надіслати код')
            : 'Вхід';
    }
    if (switchLink) {
        switchLink.innerHTML = isRegisterMode
            ? 'Вже маєте акаунт? <a href="#" id="switchToLogin" class="auth-inline-link">Увійти</a>'
            : 'Ще не маєте акаунта? <a href="#" id="switchToRegister" class="auth-inline-link">Зареєструватися</a>';

        const switchAnchor = document.getElementById(isRegisterMode ? 'switchToLogin' : 'switchToRegister');
        if (switchAnchor) {
            switchAnchor.onclick = (event) => {
                event.preventDefault();
                isRegisterMode = !isRegisterMode;
                isVerificationStep = false;
                pendingRegistrationEmail = '';
                updateModalMode();
            };
        }
    }

    if (forgotPasswordRow) forgotPasswordRow.style.display = isRegisterMode ? 'none' : 'block';
    if (resendCodeRow) resendCodeRow.style.display = 'none';
    if (oauthButtons) oauthButtons.style.display = '';
    if (authDivider) authDivider.style.display = '';
    if (googleLoginBtn) googleLoginBtn.style.display = 'block';
    if (!isRegisterMode && forgotPasswordLink) {
        forgotPasswordLink.onclick = (event) => {
            event.preventDefault();
            isPasswordResetMode = true;
            passwordResetStep = 'email';
            pendingPasswordResetEmail = '';
            pendingPasswordResetToken = '';
            updateModalMode();
        };
    }

    setRegisterStatus(
        isRegisterMode && isVerificationStep
            ? `Ми надіслали код на ${pendingRegistrationEmail || (loginEmailInput?.value.trim() || '')}. Введіть його, щоб завершити реєстрацію.`
            : ''
    );
}

function resetRegisterForm() {
    if (loginForm) {
        loginForm.reset();
    }
    showRegisterError('');
    setRegisterStatus('');
    isRegisterMode = false;
    isVerificationStep = false;
    pendingRegistrationEmail = '';
    isPasswordResetMode = false;
    passwordResetStep = '';
    pendingPasswordResetEmail = '';
    pendingPasswordResetToken = '';
    updateModalMode();
}

function saveCheckoutFormState() {
    const state = {
        recipientPhone: recipientPhoneInput?.value || '',
        recipientName: recipientNameInput?.value || '',
        recipientCity: recipientCityInput?.value || '',
        deliveryMethod: deliveryMethodSelect?.value || '',
        postalBranchNumber: postalBranchInput?.value || '',
        paymentMethod: paymentMethodSelect?.value || '',
        notes: notesTextarea?.value || ''
    };
    localStorage.setItem('checkoutFormState', JSON.stringify(state));
}

function clearCheckoutFormState() {
    localStorage.removeItem('checkoutFormState');
}

function scheduleCartClearAfterSuccessfulOrder() {
    if (typeof markPendingCheckoutCartClear === 'function') {
        markPendingCheckoutCartClear();
    }
}

function restoreCheckoutFormState(removeAfterRestore = false) {
    const rawState = localStorage.getItem('checkoutFormState');
    if (!rawState) {
        return;
    }

    try {
        const state = JSON.parse(rawState);
        if (recipientPhoneInput) recipientPhoneInput.value = state.recipientPhone || '';
        if (recipientNameInput) recipientNameInput.value = state.recipientName || '';
        if (recipientCityInput) recipientCityInput.value = state.recipientCity || '';
        if (deliveryMethodSelect) deliveryMethodSelect.value = state.deliveryMethod || '';
        if (postalBranchInput) postalBranchInput.value = state.postalBranchNumber || '';
        if (paymentMethodSelect) paymentMethodSelect.value = state.paymentMethod || '';
        if (notesTextarea) notesTextarea.value = state.notes || '';

        updateDeliveryFieldVisibility();
    } catch (error) {
        console.error('Failed to restore checkout form state:', error);
    } finally {
        if (removeAfterRestore) {
            clearCheckoutFormState();
        }
    }
}

function setFieldValueIfEmpty(field, value) {
    if (!field) return false;

    const nextValue = String(value || '').trim();
    if (!nextValue || field.value.trim()) {
        return false;
    }

    field.value = nextValue;
    return true;
}

async function applyProfileDefaults() {
    if (isGuest) {
        return;
    }

    try {
        const data = await getUserProfile();
        const profile = data && data.profile ? data.profile : null;
        if (!profile) {
            return;
        }

        const hasChanges = [
            setFieldValueIfEmpty(recipientNameInput, profile.full_name),
            setFieldValueIfEmpty(recipientPhoneInput, profile.phone),
            setFieldValueIfEmpty(recipientCityInput, profile.address)
        ].some(Boolean);

        if (hasChanges) {
            saveCheckoutFormState();
        }
    } catch (error) {
        console.error('Failed to apply checkout profile defaults:', error);
    }
}

function syncCheckoutFormState() {
    [
        recipientPhoneInput,
        recipientNameInput,
        recipientCityInput,
        deliveryMethodSelect,
        postalBranchInput,
        paymentMethodSelect,
        notesTextarea
    ].forEach((field) => {
        if (!field) return;
        field.addEventListener('input', saveCheckoutFormState);
        field.addEventListener('change', saveCheckoutFormState);
    });
}

function updateCheckoutAuthStatus() {
    const token = localStorage.getItem('auth_token');
    if (token) {
        isGuest = false;
        if (guestAuthNoticeDiv) {
            guestAuthNoticeDiv.style.display = 'none';
        }
        if (checkoutAuthNoticeDiv) {
            checkoutAuthNoticeDiv.style.display = 'none';
        }
    } else {
        isGuest = true;
        if (guestAuthNoticeDiv) {
            guestAuthNoticeDiv.style.display = 'block';
        }
        if (checkoutAuthNoticeDiv) {
            checkoutAuthNoticeDiv.style.display = 'block';
        }
    }
}

// Сделать функцию глобальной для вызова из script.js
window.updateCheckoutAuthStatus = updateCheckoutAuthStatus;

function openRegisterModal() {
    if (loginModal) {
        isRegisterMode = false;
        resetRegisterForm();
        updateModalMode();
        loginModal.style.display = 'block';
    }
}

function closeRegisterModal() {
    if (loginModal) {
        loginModal.style.display = 'none';
    }
    resetRegisterForm();
}

async function handleRegisterFormSubmit(event) {
    event.preventDefault();
    const email = loginEmailInput?.value.trim() || '';
    const password = loginPasswordInput?.value.trim() || '';
    const username = regUsernameInput?.value.trim() || '';
    const verificationCode = verificationCodeInput?.value.trim() || '';
    saveCheckoutFormState();

    if (isRegisterMode) {
        if (!isVerificationStep && (!username || !email || !password)) {
            showRegisterError('Будь ласка, заповніть всі поля для реєстрації.');
            return;
        }
        if (isVerificationStep && !verificationCode) {
            showRegisterError('Введіть код підтвердження з email.');
            return;
        }

        try {
            showRegisterError('');
            if (!isVerificationStep) {
                const validationError = validateRegistrationInput(username, email, password);
                if (validationError) {
                    showRegisterError(validationError);
                    return;
                }
                await requestRegistrationCode(username, email, password);
                pendingRegistrationEmail = email;
                isVerificationStep = true;
                updateModalMode();
                showSuccess('Код підтвердження надіслано на вашу електронну пошту.');
                return;
            }

            const result = await verifyRegistrationCode(email, verificationCode);
            checkoutAuthToken = result.token;
            isGuest = false;
            updateCheckoutAuthStatus();
            restoreCheckoutFormState();
            await applyProfileDefaults();
            showSuccess('Email підтверджено, реєстрація завершена успішно.');
            closeRegisterModal();
        } catch (error) {
            showRegisterError('Помилка реєстрації: ' + error.message);
        }
    } else {
        if (isPasswordResetMode) {
            const email = pendingPasswordResetEmail || (loginEmailInput?.value.trim() || '');
            const verificationCode = verificationCodeInput?.value.trim() || '';
            const newPassword = loginPasswordInput?.value || '';

            try {
                showRegisterError('');
                if (passwordResetStep === 'email') {
                    pendingPasswordResetEmail = loginEmailInput?.value.trim() || '';
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
                    showSuccess('Код для відновлення пароля надіслано на вашу електронну пошту.');
                    return;
                }

                if (passwordResetStep === 'code') {
                    const result = await verifyPasswordResetCode(email, verificationCode);
                    pendingPasswordResetToken = result.reset_token;
                    passwordResetStep = 'new_password';
                    if (verificationCodeInput) verificationCodeInput.value = '';
                    updateModalMode();
                    return;
                }

                await confirmPasswordReset(email, pendingPasswordResetToken, newPassword);
                const loginResult = await loginUser(email, newPassword);
                checkoutAuthToken = loginResult.token;
                localStorage.setItem('auth_token', checkoutAuthToken);
                isGuest = false;
                updateCheckoutAuthStatus();
                restoreCheckoutFormState();
                await applyProfileDefaults();
                resetRegisterForm();
                closeRegisterModal();
                showSuccess('Пароль успішно оновлено, ви автоматично увійшли в акаунт.');
            } catch (error) {
                showRegisterError('Помилка відновлення пароля: ' + error.message);
            }
        } else if (!email || !password) {
            showRegisterError('Будь ласка, заповніть всі поля для входу.');
            return;
        } else {
            try {
                showRegisterError('');
                const loginResult = await loginUser(email, password);
                checkoutAuthToken = loginResult.token;
                localStorage.setItem('auth_token', checkoutAuthToken);
                isGuest = false;
                updateCheckoutAuthStatus();
                restoreCheckoutFormState();
                await applyProfileDefaults();
                showSuccess('Ви успішно авторизувалися та зможете відстежувати статус свого замовлення!');
                closeRegisterModal();
            } catch (error) {
                showRegisterError('Помилка: ' + error.message);
            }
        }
    }
}

function renderOrderReceipt() {
    const cart = getCartFromStorage();
    const total = getOrderDueTotal();
    const due = total;

    if (!cart.length) {
        orderReceiptItemsDiv.innerHTML = '<div style="color:#666; padding: 0.5rem 0;">У Вашому кошику наразі немає товарів.</div>';
        orderReceiptTotalSpan.innerHTML = `
            <span class="order-receipt-summary-row">
                <span>Загальна сума:</span>
                <strong>${formatPrice(0)}</strong>
            </span>
            <span class="order-receipt-summary-row">
                <span>До сплати:</span>
                <strong>${formatPrice(0)}</strong>
            </span>
        `;
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

    orderReceiptTotalSpan.innerHTML = `
        <span class="order-receipt-summary-row">
            <span>Загальна сума:</span>
            <strong>${formatPrice(total)}</strong>
        </span>
        <span class="order-receipt-summary-row">
            <span>До сплати:</span>
            <strong>${formatPrice(due)}</strong>
        </span>
    `;

    updatePaymentDeliveryNote();
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
async function initCheckout() {
    console.log('🛒 Initializing checkout...');

    restoreCheckoutFormState();
    initCityCombobox();
    initSelectComboboxes();
    syncCheckoutFormState();

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        checkoutAuthToken = token;
        localStorage.setItem('auth_token', token);
        isGuest = false;
        if (guestAuthNoticeDiv) {
            guestAuthNoticeDiv.style.display = 'none';
        }
        showSuccess('Ви успішно авторизувалися та зможете відстежувати статус свого замовлення!');
        urlParams.delete('token');
        const newSearch = urlParams.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
    }
    
    // Обновить статус авторизации
    updateCheckoutAuthStatus();
    await applyProfileDefaults();

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
    // Условное отображение дополнительного поля доставки
    deliveryMethodSelect.addEventListener('change', updateDeliveryFieldVisibility);
    paymentMethodSelect.addEventListener('change', updatePaymentDeliveryNote);

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
            saveCheckoutFormState();
            openRegisterModal();
        });
    }

    const checkoutAuthLink = document.getElementById('checkoutAuthLink');
    if (checkoutAuthLink) {
        checkoutAuthLink.addEventListener('click', (event) => {
            event.preventDefault();
            if (!isGuest) {
                showSuccess('Ви вже авторизовані. Ви зможете відстежувати своє замовлення.');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
            saveCheckoutFormState();
            openRegisterModal();
        });
    }

    if (googleLoginBtn) {
        googleLoginBtn.onclick = async () => {
            const nextPath = `${window.location.pathname}${window.location.search}`;
            await startGoogleAuth(nextPath, {
                beforeRedirect: () => saveCheckoutFormState()
            });
        };
    }

    if (closeLoginModalBtn) {
        closeLoginModalBtn.addEventListener('click', closeRegisterModal);
    }

    if (loginForm) {
        loginForm.addEventListener('submit', handleRegisterFormSubmit);
    }

    window.addEventListener('click', (event) => {
        if (event.target === loginModal) {
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
        let orderResult;
        if (isGuest) {
            // Создать заказ как гость
            orderResult = await createGuestOrderFlow();
        } else {
            // Зареєстрований користувач
            orderResult = await createRegisteredUserOrder();
        }

        const orderNumber = orderResult?.order_number || 'невідомий';
        const successMessage = isGuest
            ? `✅ Замовлення <strong>${orderNumber}</strong> успішно створено! Менеджер звʼяжеться з Вами найближчим часом.`
            : `✅ Замовлення <strong>${orderNumber}</strong> успішно створено! Менеджер звʼяжеться з Вами найближчим часом. <a href="#">Переглянути статус замовлення</a>`;
        showSuccess(successMessage);

        if (guestAuthNoticeDiv) {
            guestAuthNoticeDiv.style.display = 'none';
        }
        
        // Прокрутить страницу вверх, чтобы пользователь увидел уведомление
        if (!isGuest && orderResult?.id) {
            const successOrderLink = successMessageDiv.querySelector('a');
            if (successOrderLink) {
                successOrderLink.href = `/profile.html?highlightOrderId=${encodeURIComponent(orderResult.id)}`;
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Очистить корзину
        scheduleCartClearAfterSuccessfulOrder();
        
        // Обновить чек и интерфейс, но не перенаправлять пользователя
        renderOrderReceipt();
        submitBtn.disabled = true;
        submitBtn.textContent = 'Замовлення оформлено';

    } catch (error) {
        console.error('Error creating order:', error);
        showError('Помилка при створенні замовлення: ' + (error.message || 'Невідома помилка'));
        submitBtn.disabled = false;
        submitBtn.textContent = 'Підтвердити';
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

    if (getDeliveryFieldConfig(delivery).visible && !postalBranch) {
        const labelText = (postalBranchLabel?.textContent || 'Додаткове поле доставки')
            .replace(' *', '')
            .trim()
            .toLowerCase();
        showError(`Будь ласка, введіть ${labelText}.`);
        return false;
    }

    return true;
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
        const summary = buildOrderSummary(result.order_number);
        await postUserChat(summary);
        setPendingOrderChatAttention(result.order_number);

        return result;
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
        const summary = buildOrderSummary(result.order_number);
        await postGuestChat(guestIdentifier, summary);

        return result;
    } catch (error) {
        throw new Error('Помилка при створенні замовлення: ' + (error.message || ''));
    }
}

function buildOrderSummary(orderNumber) {
    const cart = getCartFromStorage();
    const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const deliveryValue = postalBranchInput.value.trim();
    let deliveryText = 'Не вказано';

    switch (deliveryMethodSelect.value) {
        case 'nova_branch':
            deliveryText = `Доставка у відділення Нової пошти (${escapeHtml(deliveryValue) || 'не вказано'})`;
            break;
        case 'nova_locker':
            deliveryText = `Доставка у поштомат Нової пошти (${escapeHtml(deliveryValue) || 'не вказано'})`;
            break;
        case 'nova_courier':
            deliveryText = `Доставка кур'єром Нової пошти (${escapeHtml(deliveryValue) || 'не вказано'})`;
            break;
        case 'other_post':
            deliveryText = `Доставка іншою поштою (${escapeHtml(deliveryValue) || 'не вказано'})`;
            break;
    }
    const paymentText = paymentMethodSelect.value === 'cod' ? 'Накладений платіж' : 'Оплата карткою';

    let summary = `
        <div class="order-receipt">
            <div class="order-receipt-header">Чек замовлення № ${escapeHtml(orderNumber)}</div>
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
                <span class="order-receipt-summary-row">
                    <span>Загальна сума:</span>
                    <strong>${formatPrice(total)}</strong>
                </span>
                <span class="order-receipt-summary-row">
                    <span>До сплати:</span>
                    <strong>${formatPrice(total)}</strong>
                </span>
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

// Обработчик кнопки Google OAuth
const googleRegisterBtn = document.getElementById('googleRegisterBtn');
if (googleRegisterBtn) {
    googleRegisterBtn.onclick = async () => {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        await startGoogleAuth(nextPath, {
            beforeRedirect: () => saveCheckoutFormState()
        });
    };
}
