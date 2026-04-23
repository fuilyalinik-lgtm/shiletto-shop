// Динамический базовый URL - автоматически подставляется текущий домен
const API_BASE = `${window.location.origin}/api`;
let authToken = localStorage.getItem('auth_token');
const AUTH_USER_ID_KEY = 'auth_user_id';
const CHAT_ORDER_ATTENTION_KEY = 'chat_order_attention_map';
const CHECKOUT_PENDING_CART_CLEAR_KEY = 'checkout_pending_cart_clear';

function isCheckoutPage() {
    return window.location.pathname.endsWith('/checkout.html') || window.location.pathname.endsWith('checkout.html');
}

function markPendingCheckoutCartClear() {
    sessionStorage.setItem(CHECKOUT_PENDING_CART_CLEAR_KEY, '1');
}

function clearPendingCheckoutCartClearMark() {
    sessionStorage.removeItem(CHECKOUT_PENDING_CART_CLEAR_KEY);
}

function flushPendingCheckoutCartClearIfNeeded() {
    if (isCheckoutPage()) {
        return;
    }

    if (sessionStorage.getItem(CHECKOUT_PENDING_CART_CLEAR_KEY) !== '1') {
        return;
    }

    localStorage.removeItem('cart');
    sessionStorage.removeItem('cart');
    localStorage.removeItem('checkoutFormState');
    clearPendingCheckoutCartClearMark();
}

flushPendingCheckoutCartClearIfNeeded();

function persistAuthUserId(userId) {
    if (userId === null || userId === undefined || userId === '') {
        localStorage.removeItem(AUTH_USER_ID_KEY);
        return;
    }

    localStorage.setItem(AUTH_USER_ID_KEY, String(userId));
}

function getAuthUserIdFromToken() {
    const token = localStorage.getItem('auth_token') || authToken;
    if (!token) return '';

    try {
        const tokenParts = token.split('.');
        if (tokenParts.length < 2) return '';

        const base64Url = tokenParts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const paddedBase64 = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
        const payload = JSON.parse(window.atob(paddedBase64));
        return payload && payload.user_id ? String(payload.user_id) : '';
    } catch {
        return '';
    }
}

function getPersistedAuthUserId() {
    const storedUserId = localStorage.getItem(AUTH_USER_ID_KEY);
    if (storedUserId) {
        return String(storedUserId);
    }

    const tokenUserId = getAuthUserIdFromToken();
    if (tokenUserId) {
        persistAuthUserId(tokenUserId);
    }

    return tokenUserId;
}

function readChatOrderAttentionMap() {
    try {
        const raw = localStorage.getItem(CHAT_ORDER_ATTENTION_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeChatOrderAttentionMap(map) {
    if (!map || typeof map !== 'object' || !Object.keys(map).length) {
        localStorage.removeItem(CHAT_ORDER_ATTENTION_KEY);
        return;
    }

    localStorage.setItem(CHAT_ORDER_ATTENTION_KEY, JSON.stringify(map));
}

function getCurrentChatOrderAttentionEntry() {
    const userId = getPersistedAuthUserId();
    if (!userId) return null;

    const attentionMap = readChatOrderAttentionMap();
    const entry = attentionMap[userId];
    return entry && typeof entry === 'object' ? entry : null;
}

function setPendingOrderChatAttention(orderReference = '') {
    const userId = getPersistedAuthUserId();
    if (!userId) return;

    const attentionMap = readChatOrderAttentionMap();
    attentionMap[userId] = {
        orderReference: typeof orderReference === 'string' ? orderReference.trim() : '',
        createdAt: Date.now()
    };
    writeChatOrderAttentionMap(attentionMap);
    refreshChatOrderAttentionState();
}

function clearPendingOrderChatAttention() {
    const userId = getPersistedAuthUserId();
    if (!userId) {
        refreshChatOrderAttentionState();
        return;
    }

    const attentionMap = readChatOrderAttentionMap();
    if (attentionMap[userId]) {
        delete attentionMap[userId];
        writeChatOrderAttentionMap(attentionMap);
    }

    refreshChatOrderAttentionState();
}

function maybeClearPendingOrderChatAttention(messages) {
    const pendingEntry = getCurrentChatOrderAttentionEntry();
    if (!pendingEntry || !Array.isArray(messages) || !messages.length) {
        return false;
    }

    const normalizedOrderReference = typeof pendingEntry.orderReference === 'string'
        ? pendingEntry.orderReference.trim()
        : '';

    const matchingOrderWasSeen = messages.some(message => {
        const rawMessage = typeof message?.message === 'string' ? message.message : '';
        if (!rawMessage.includes('order-receipt')) {
            return false;
        }

        return !normalizedOrderReference || rawMessage.includes(normalizedOrderReference);
    });

    if (!matchingOrderWasSeen) {
        return false;
    }

    clearPendingOrderChatAttention();
    return true;
}

async function apiRequest(endpoint, method = 'GET', data = null) {
    const url = `${API_BASE}${endpoint}`;
    console.log('🛒 apiRequest', method, url, data ? 'with data' : 'no data');
    const currentToken = localStorage.getItem('auth_token'); // Читаем актуальный токен каждый раз
    const token = currentToken || authToken;
    console.log('🛒 apiRequest token present:', !!token);
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const config = {
        method,
        headers
    };
    
    if (data) {
        config.body = JSON.stringify(data);
    }
    
    console.log('🛒 apiRequest making fetch...');
    const response = await fetch(url, config);
    console.log('🛒 apiRequest response status:', response.status);
    let result;

    const text = await response.text();
    console.log('🛒 apiRequest response text length:', text.length);
    if (text) {
        try {
            result = JSON.parse(text);
            console.log('🛒 apiRequest parsed JSON');
        } catch {
            result = text;
            console.log('🛒 apiRequest received text response');
        }
    } else {
        result = null;
        console.log('🛒 apiRequest empty response');
    }

    if (!response.ok) {
        console.log('🛒 apiRequest error response:', result);
        if (response.status === 401) {
            logoutUser();
            throw new Error('Сесія закінчилася. Увійдіть знову.');
        }
        if (result && typeof result === 'object' && result.error) {
            throw new Error(result.error);
        }
        throw new Error(`Request failed (${response.status})`);
    }

    console.log('🛒 apiRequest success');
    return result;
}

async function formDataRequest(endpoint, method = 'POST', formData) {
    const url = `${API_BASE}${endpoint}`;
    const currentToken = localStorage.getItem('auth_token');
    const token = currentToken || authToken;
    const headers = {};

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: formData
    });

    let result;
    const text = await response.text();
    if (text) {
        try {
            result = JSON.parse(text);
        } catch {
            result = text;
        }
    } else {
        result = null;
    }

    if (!response.ok) {
        if (response.status === 401) {
            logoutUser();
            throw new Error('Сесія закінчилася. Увійдіть знову.');
        }
        if (result && typeof result === 'object' && result.error) {
            throw new Error(result.error);
        }
        throw new Error(`Request failed (${response.status})`);
    }

    return result;
}

const CHAT_IMAGE_MAX_SIZE = 15 * 1024 * 1024;

function escapeChatHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function formatChatImageSize(size) {
    if (!Number.isFinite(size) || size <= 0) {
        return '';
    }

    if (size >= 1024 * 1024) {
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${Math.round(size / 1024)} KB`;
}

function isRichChatMessage(message) {
    const text = typeof message === 'string' ? message : '';
    return text.includes('<div') || text.includes('<span') || text.includes('<strong') || text.includes('order-receipt');
}

function normalizeOrderReceiptHtml(message) {
    const text = typeof message === 'string' ? message : '';
    if (!text || !text.includes('order-receipt')) {
        return text;
    }

    return text.replace(
        /(<span class="order-status-badge[^"]*">)\s*pending\s*(<\/span>)/gi,
        '$1Замовлення очікує підтвердження менеджером$2'
    );
}

function buildChatMessageContent(messageData, options = {}) {
    const text = normalizeOrderReceiptHtml(typeof messageData?.message === 'string' ? messageData.message : '');
    const imageUrl = typeof messageData?.image_url === 'string' ? messageData.image_url : '';
    const extraHtml = options.extraHtml || '';
    const parts = [];
    const isHtmlMessage = isRichChatMessage(text);
    const hasImage = Boolean(imageUrl);
    const escapedText = escapeChatHtml(text).replace(/\n/g, '<br>');
    let imageHtml = '';

    if (hasImage) {
        const escapedImageUrl = escapeChatHtml(imageUrl);
        imageHtml = `
            <a class="chat-message-image-link" href="${escapedImageUrl}" target="_blank" rel="noopener noreferrer">
                <img class="chat-message-image" src="${escapedImageUrl}" alt="Фото у чаті" loading="lazy">
            </a>
        `;
    }

    if (hasImage && text && !isHtmlMessage) {
        return {
            html: `
                <div class="chat-message-media">
                    ${imageHtml}
                    <div class="chat-message-caption">${escapedText}</div>
                    ${extraHtml}
                </div>
            `,
            isHtmlMessage,
            hasImage
        };
    }

    if (imageHtml) {
        parts.push(imageHtml);
    }

    if (text) {
        if (isHtmlMessage) {
            parts.push(`<div class="message-html">${text}${extraHtml}</div>`);
        } else {
            parts.push(`<span class="message-text">${escapedText}</span>${extraHtml}`);
        }
    } else if (extraHtml) {
        parts.push(extraHtml);
    }

    return {
        html: parts.join(''),
        isHtmlMessage,
        hasImage
    };
}

function initChatAttachmentUI(options = {}) {
    const attachButton = document.getElementById(options.attachButtonId || 'chatAttachBtn');
    const imageInput = document.getElementById(options.inputId || 'chatImageInput');
    const preview = document.getElementById(options.previewId || 'chatImagePreview');

    if (!attachButton || !imageInput || !preview) {
        return {
            getSelectedFile: () => null,
            hasSelectedFile: () => false,
            clear: () => {},
            setEnabled: () => {}
        };
    }

    let selectedFile = null;
    let previewUrl = '';

    function revokePreviewUrl() {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = '';
        }
    }

    function renderPreview() {
        if (!selectedFile) {
            revokePreviewUrl();
            preview.innerHTML = '';
            preview.classList.remove('is-visible');
            return;
        }

        revokePreviewUrl();
        previewUrl = URL.createObjectURL(selectedFile);
        preview.innerHTML = `
            <div class="chat-image-preview-card">
                <img class="chat-image-preview-thumb" src="${previewUrl}" alt="Попередній перегляд фото">
                <div class="chat-image-preview-meta">
                    <strong>${escapeChatHtml(selectedFile.name)}</strong>
                    <span>${formatChatImageSize(selectedFile.size)}</span>
                </div>
                <button type="button" class="chat-image-remove-btn" data-action="remove-chat-image" aria-label="Прибрати фото">&times;</button>
            </div>
        `;
        preview.classList.add('is-visible');
    }

    function clear() {
        selectedFile = null;
        imageInput.value = '';
        renderPreview();
    }

    attachButton.addEventListener('click', () => {
        if (!attachButton.disabled) {
            imageInput.click();
        }
    });

    imageInput.addEventListener('change', () => {
        const file = imageInput.files && imageInput.files[0];
        if (!file) {
            clear();
            return;
        }

        if (!file.type.startsWith('image/')) {
            alert('Можна прикріплювати лише фото.');
            clear();
            return;
        }

        if (file.size > CHAT_IMAGE_MAX_SIZE) {
            alert('Фото занадто велике. Максимальний розмір 15 MB.');
            clear();
            return;
        }

        selectedFile = file;
        renderPreview();
    });

    preview.addEventListener('click', event => {
        const removeButton = event.target.closest('[data-action="remove-chat-image"]');
        if (removeButton) {
            clear();
        }
    });

    return {
        getSelectedFile: () => selectedFile,
        hasSelectedFile: () => Boolean(selectedFile),
        clear,
        setEnabled: enabled => {
            attachButton.disabled = !enabled;
            imageInput.disabled = !enabled;
            attachButton.classList.toggle('is-disabled', !enabled);
            if (!enabled) {
                clear();
            }
        }
    };
}

// Функции для аутентификации
async function requestRegistrationCode(username, email, password) {
    return await apiRequest('/auth/register', 'POST', { username, email, password });
}

async function verifyRegistrationCode(email, code) {
    const result = await apiRequest('/auth/register/verify', 'POST', { email, code });
    authToken = result.token;
    localStorage.setItem('auth_token', authToken);
    persistAuthUserId(result && result.user_id ? result.user_id : '');
    refreshChatOrderAttentionState();
    scheduleChatUnreadBadgeRefresh();
    return result;
}

async function resendRegistrationCode(username, email, password) {
    return await apiRequest('/auth/register/resend', 'POST', { username, email, password });
}

async function requestPasswordReset(email) {
    return await apiRequest('/auth/password-reset/request', 'POST', { email });
}

async function verifyPasswordResetCode(email, code) {
    return await apiRequest('/auth/password-reset/verify', 'POST', { email, code });
}

async function confirmPasswordReset(email, resetToken, newPassword) {
    return await apiRequest('/auth/password-reset/confirm', 'POST', {
        email,
        reset_token: resetToken,
        new_password: newPassword
    });
}

async function registerUser(username, email, password) {
    return await requestRegistrationCode(username, email, password);
}

function validateRegistrationInput(username, email, password) {
    const trimmedUsername = (username || '').trim();
    const normalizedEmail = (email || '').trim();
    const rawPassword = password || '';

    if (!trimmedUsername || !normalizedEmail || !rawPassword) {
        return 'Будь ласка, заповніть усі поля.';
    }

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
        return "Ім'я користувача має містити від 3 до 30 символів.";
    }

    return '';
}

async function loginUser(email, password) {
    const result = await apiRequest('/auth/login', 'POST', { email, password });
    authToken = result.token;
    localStorage.setItem('auth_token', authToken);
    persistAuthUserId(result && result.user_id ? result.user_id : '');
    refreshChatOrderAttentionState();
    scheduleChatUnreadBadgeRefresh();
    return result;
}

async function logoutUser() {
    authToken = null;
    localStorage.removeItem('auth_token');
    persistAuthUserId('');
    renderChatUnreadBadge(0);
    refreshChatOrderAttentionState();
}

async function getUserProfile() {
    return await apiRequest('/user/profile', 'GET');
}

async function updateUserProfile(data) {
    return await apiRequest('/user/profile', 'PUT', data);
}

async function getCurrentUser() {
    const result = await apiRequest('/auth/me', 'GET');
    persistAuthUserId(result && result.id ? result.id : '');
    return result;
}

async function sendContactMessage(message) {
    return await apiRequest('/user/contact', 'POST', { message });
}

async function getUserChat() {
    const result = await apiRequest('/user/chat', 'GET');
    scheduleChatUnreadBadgeRefresh();
    return result;
}

async function getAdminChat() {
    return await apiRequest('/admin/chat', 'GET');
}

async function postUserChat(message = '', imageFile = null) {
    if (!imageFile) {
        return await apiRequest('/user/chat', 'POST', { message });
    }

    const formData = new FormData();
    formData.append('message', message || '');
    formData.append('image', imageFile);
    return await formDataRequest('/user/chat', 'POST', formData);
}

async function deleteUserChatMessage(messageId) {
    return await apiRequest(`/user/chat/${messageId}`, 'DELETE');
}

async function updateUserChatMessage(messageId, newMessage) {
    return await apiRequest(`/user/chat/${messageId}`, 'PUT', { message: newMessage });
}

async function getAdminUsers() {
    return await apiRequest('/admin/users', 'GET');
}

async function getAdminBackups() {
    return await apiRequest('/admin/backups', 'GET');
}

async function createAdminBackup() {
    return await apiRequest('/admin/backups', 'POST', {});
}

async function restoreAdminBackup(filename) {
    return await apiRequest('/admin/backups/restore', 'POST', { filename });
}

async function restoreAdminBackupFromFile(file) {
    const formData = new FormData();
    formData.append('backup', file);
    return await formDataRequest('/admin/backups/restore', 'POST', formData);
}

async function downloadAdminBackup(filename) {
    const url = `${API_BASE}/admin/backups/${encodeURIComponent(filename)}/download`;
    const currentToken = localStorage.getItem('auth_token');
    const token = currentToken || authToken;
    const headers = {};

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method: 'GET',
        headers
    });

    if (!response.ok) {
        let errorMessage = `Request failed (${response.status})`;

        try {
            const payload = await response.json();
            if (payload && payload.error) {
                errorMessage = payload.error;
            }
        } catch {
            // Ignore JSON parsing errors for binary responses.
        }

        if (response.status === 401) {
            logoutUser();
        }

        throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename=\"?([^\";]+)\"?/i);

    return {
        blob,
        filename: match ? match[1] : filename
    };
}

async function getAdminChat() {
    return await apiRequest('/admin/chat', 'GET');
}

async function getAdminUserChat(userId) {
    const result = await apiRequest(`/admin/chat/${userId}`, 'GET');
    scheduleChatUnreadBadgeRefresh();
    return result;
}

async function postAdminChat(userId, message = '', imageFile = null) {
    if (!imageFile) {
        return await apiRequest(`/admin/chat/${userId}`, 'POST', { message });
    }

    const formData = new FormData();
    formData.append('message', message || '');
    formData.append('image', imageFile);
    return await formDataRequest(`/admin/chat/${userId}`, 'POST', formData);
}

// Функции для категорий
async function getCategories() {
    return await apiRequest('/categories');
}

async function createCategory(name, description = '', parentId = null) {
    const payload = { name, description };
    if (parentId !== null && !Number.isNaN(Number(parentId))) {
        payload.parent_id = Number(parentId);
    }
    return await apiRequest('/categories', 'POST', payload);
}

// Функции для товаров
async function getProducts(categoryId = null) {
    const endpoint = categoryId ? `/products?category_id=${categoryId}` : '/products';
    return await apiRequest(endpoint);
}

async function createProduct(name, price, categoryId, stock = 0, imageFiles = [], mainImageIndex = 0, description = '', supplierInfo = '', availabilityStatus = 'В наявності', dropPrice = null, supplierUrl = '') {
    const url = `${API_BASE}/products`;
    const authToken = localStorage.getItem('auth_token'); // Читаем актуальный токен
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('supplier_info', supplierInfo);
    formData.append('supplier_url', supplierUrl);
    formData.append('availability_status', availabilityStatus);
    formData.append('price', price);
    if (dropPrice !== null && dropPrice !== '') {
        formData.append('drop_price', dropPrice);
    }
    formData.append('category_id', categoryId);
    formData.append('stock', stock);
    formData.append('main_image_index', mainImageIndex);
    
    for (let i = 0; i < imageFiles.length && i < 15; i++) {
        formData.append('images', imageFiles[i]);
    }
    
    const config = {
        method: 'POST',
        body: formData
    };
    
    // Добавляем Authorization заголовок если есть токен
    if (authToken) {
        config.headers = {
            'Authorization': `Bearer ${authToken}`
        };
    }
    
    const response = await fetch(url, config);
    const result = await response.json();
    
    if (!response.ok) {
        throw new Error(result.error || 'Request failed');
    }
    
    return result;
}

async function updateProduct(id, name, price, categoryId, stock = 0, imageFiles = [], mainImageId = null, description = '', supplierInfo = '', availabilityStatus = 'В наявності', dropPrice = null, supplierUrl = '') {
    const url = `${API_BASE}/products/${id}`;
    const authToken = localStorage.getItem('auth_token'); // Читаем актуальный токен
    
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('supplier_info', supplierInfo);
    formData.append('supplier_url', supplierUrl);
    formData.append('availability_status', availabilityStatus);
    formData.append('price', price);
    if (dropPrice !== null && dropPrice !== '') {
        formData.append('drop_price', dropPrice);
    }
    formData.append('category_id', categoryId);
    formData.append('stock', stock);
    if (mainImageId) {
        formData.append('main_image_id', mainImageId);
    }
    
    for (let i = 0; i < imageFiles.length && i < 15; i++) {
        formData.append('images', imageFiles[i]);
    }
    
    const config = {
        method: 'PUT',
        body: formData
    };
    
    // Добавляем Authorization заголовок если есть токен
    if (authToken) {
        config.headers = {
            'Authorization': `Bearer ${authToken}`
        };
    }
    
    const response = await fetch(url, config);
    const result = await response.json();
    
    if (!response.ok) {
        throw new Error(result.error || 'Request failed');
    }
    
    return result;
}

async function deleteProduct(id) {
    return await apiRequest(`/products/${id}`, 'DELETE');
}

// Функции для баннеров
async function getBanners() {
    return await apiRequest('/banners');
}

async function getAboutBanners() {
    return await apiRequest('/banners/about');
}

async function getAllBanners() {
    return await apiRequest('/banners/all');
}

async function createBanner(imageFile, pageType = 'main', title = '', description = '', linkUrl = '', areaX = 0, areaY = 0, areaWidth = 100, areaHeight = 100) {
    if (!imageFile) {
        throw new Error('Файл для баннера не выбран');
    }

    const url = `${API_BASE}/banners`;
    const authToken = localStorage.getItem('auth_token'); // Читаем актуальный токен
    
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('page_type', pageType);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('link_url', linkUrl);
    formData.append('area_x', areaX.toString());
    formData.append('area_y', areaY.toString());
    formData.append('area_width', areaWidth.toString());
    formData.append('area_height', areaHeight.toString());
    
    const config = {
        method: 'POST',
        body: formData
    };
    
    // Добавляем Authorization заголовок если есть токен
    if (authToken) {
        config.headers = {
            'Authorization': `Bearer ${authToken}`
        };
    }
    
    const response = await fetch(url, config);
    const result = await response.json();
    
    if (!response.ok) {
        throw new Error(result.error || 'Запрос не удался');
    }
    
    return result;
}

async function deleteBanner(id) {
    return await apiRequest(`/banners/${id}`, 'DELETE');
}

// ===== Функции для заказов =====
async function createOrder(orderData) {
    return await apiRequest('/orders', 'POST', orderData);
}

async function getUserOrders() {
    return await apiRequest('/user/orders', 'GET');
}

async function getAllOrders() {
    return await apiRequest('/admin/orders', 'GET');
}

async function updateAdminOrderStatus(orderId, status, trackingNumber = '', extraData = {}) {
    return await apiRequest(`/admin/orders/${orderId}/status`, 'PUT', {
        status,
        tracking_number: trackingNumber,
        ...extraData
    });
}

async function createGuestOrder(orderData) {
    return await apiRequest('/guest/order', 'POST', orderData);
}

async function getAdminGuestOrders() {
    return await apiRequest('/admin/guest-orders', 'GET');
}

async function updateAdminGuestOrderStatus(orderId, status, trackingNumber = '', extraData = {}) {
    return await apiRequest(`/admin/guest-orders/${orderId}/status`, 'PUT', {
        status,
        tracking_number: trackingNumber,
        ...extraData
    });
}

// ===== Функции для гостевого чата =====
async function getGuestChat(guestIdentifier) {
    return await apiRequest(`/guest/chat?guest_identifier=${encodeURIComponent(guestIdentifier)}`, 'GET');
}

async function postGuestChat(guestIdentifier, message) {
    return await apiRequest(`/guest/chat?guest_identifier=${encodeURIComponent(guestIdentifier)}`, 'POST', { message });
}

async function getAdminGuestChat() {
    const result = await apiRequest('/admin/guest-chat', 'GET');
    scheduleChatUnreadBadgeRefresh();
    return result;
}

async function postAdminGuestChat(guestIdentifier, message) {
    return await apiRequest('/admin/guest-chat', 'POST', { guest_identifier: guestIdentifier, message });
}

async function getGuestChatUsers() {
    return await apiRequest('/admin/guest-chat-users', 'GET');
}

async function getChatUnreadSummary() {
    return await apiRequest('/chat/unread-summary', 'GET');
}

function ensureChatUnreadBadge() {
    const chatBtn = document.getElementById('chatBtn');
    if (!chatBtn) return null;

    chatBtn.classList.add('has-chat-badge');

    let badge = chatBtn.querySelector('.chat-unread-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'chat-unread-badge';
        badge.setAttribute('aria-live', 'polite');
        chatBtn.appendChild(badge);
    }

    return badge;
}

function refreshChatOrderAttentionState() {
    const chatBtn = document.getElementById('chatBtn');
    if (!chatBtn) return;

    if (!localStorage.getItem('auth_token')) {
        chatBtn.classList.remove('has-chat-order-attention');
        return;
    }

    const pendingEntry = getCurrentChatOrderAttentionEntry();
    chatBtn.classList.toggle('has-chat-order-attention', Boolean(pendingEntry));
}

function renderChatUnreadBadge(count) {
    const badge = ensureChatUnreadBadge();
    if (!badge) return;

    const numericCount = Number(count) || 0;
    if (numericCount <= 0) {
        badge.style.display = 'none';
        badge.textContent = '';
        return;
    }

    badge.textContent = numericCount > 99 ? '99+' : String(numericCount);
    badge.style.display = 'inline-block';
}

async function refreshChatUnreadBadge() {
    const chatBtn = document.getElementById('chatBtn');
    if (!chatBtn) return;

    if (!localStorage.getItem('auth_token')) {
        renderChatUnreadBadge(0);
        return;
    }

    try {
        const summary = await getChatUnreadSummary();
        renderChatUnreadBadge(summary && summary.count ? summary.count : 0);
    } catch (error) {
        console.log('Chat unread badge refresh skipped:', error.message);
        renderChatUnreadBadge(0);
    }
}

function scheduleChatUnreadBadgeRefresh() {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
        if (typeof window.refreshChatUnreadBadge === 'function') {
            window.refreshChatUnreadBadge();
        }
    }, 0);
}

function initChatUnreadBadge() {
    if (window.__chatUnreadBadgeInitialized) return;
    window.__chatUnreadBadgeInitialized = true;

    refreshChatUnreadBadge();
    refreshChatOrderAttentionState();

    window.setInterval(() => {
        if (document.visibilityState === 'visible') {
            refreshChatUnreadBadge();
            refreshChatOrderAttentionState();
        }
    }, 15000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshChatUnreadBadge();
            refreshChatOrderAttentionState();
        }
    });

    window.addEventListener('focus', refreshChatUnreadBadge);
    window.addEventListener('focus', refreshChatOrderAttentionState);
}

window.refreshChatUnreadBadge = refreshChatUnreadBadge;
window.refreshChatOrderAttentionState = refreshChatOrderAttentionState;

// ===== Инициализация админ-панели на всех страницах =====
async function initAdminPanel() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return; // Нет токена - не админ
        
        // Получаем информацию о текущем пользователе
        const user = await getCurrentUser();
        if (!user || !user.is_admin) return; // Не админ
        
        // Ищем bottom-panel
        const bottomPanel = document.getElementById('bottomPanel');
        if (!bottomPanel) return; // Нет панели на странице
        
        // Проверяем есть ли уже кнопка администратора
        if (document.getElementById('adminPanelBtn')) return; // Кнопка уже есть
        
        // Создаем кнопку админ-панели
        const adminBtn = document.createElement('button');
        adminBtn.id = 'adminPanelBtn';
        adminBtn.innerHTML = `<svg class="bottom-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V9" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 3V9H19" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12H15" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 16H12" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Адмін`;
        adminBtn.onclick = () => {
            window.location.href = '/admin/dashboard';
        };
        
        // Добавляем кнопку в конец панели
        bottomPanel.appendChild(adminBtn);
    } catch (error) {
        console.log('Admin panel initialization skipped:', error.message);
    }
}

// Инициализация админ-панели когда DOM готов
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAdminPanel();
        initChatUnreadBadge();
    });
} else {
    // DOM уже загружен
    initAdminPanel();
    initChatUnreadBadge();
}
