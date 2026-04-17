const API_BASE = 'http://localhost:8080/api';
let authToken = localStorage.getItem('auth_token');

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

// Функции для аутентификации
async function registerUser(username, email, password) {
    return await apiRequest('/auth/register', 'POST', { username, email, password });
}

async function loginUser(email, password) {
    const result = await apiRequest('/auth/login', 'POST', { email, password });
    authToken = result.token;
    localStorage.setItem('auth_token', authToken);
    return result;
}

async function logoutUser() {
    authToken = null;
    localStorage.removeItem('auth_token');
}

async function getUserProfile() {
    return await apiRequest('/user/profile', 'GET');
}

async function updateUserProfile(data) {
    return await apiRequest('/user/profile', 'PUT', data);
}

async function getCurrentUser() {
    return await apiRequest('/auth/me', 'GET');
}

async function sendContactMessage(message) {
    return await apiRequest('/user/contact', 'POST', { message });
}

async function getUserChat() {
    return await apiRequest('/user/chat', 'GET');
}

async function getAdminChat() {
    return await apiRequest('/admin/chat', 'GET');
}

async function postUserChat(message) {
    return await apiRequest('/user/chat', 'POST', { message });
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

async function getAdminChat() {
    return await apiRequest('/admin/chat', 'GET');
}

async function getAdminUserChat(userId) {
    return await apiRequest(`/admin/chat/${userId}`, 'GET');
}

async function postAdminChat(userId, message) {
    return await apiRequest(`/admin/chat/${userId}`, 'POST', { message });
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

async function createGuestOrder(orderData) {
    return await apiRequest('/guest/order', 'POST', orderData);
}

async function getAdminGuestOrders() {
    return await apiRequest('/admin/guest-orders', 'GET');
}

// ===== Функции для гостевого чата =====
async function getGuestChat(guestIdentifier) {
    return await apiRequest(`/guest/chat?guest_identifier=${encodeURIComponent(guestIdentifier)}`, 'GET');
}

async function postGuestChat(guestIdentifier, message) {
    return await apiRequest(`/guest/chat?guest_identifier=${encodeURIComponent(guestIdentifier)}`, 'POST', { message });
}

async function getAdminGuestChat() {
    return await apiRequest('/admin/guest-chat', 'GET');
}

async function postAdminGuestChat(guestIdentifier, message) {
    return await apiRequest('/admin/guest-chat', 'POST', { guest_identifier: guestIdentifier, message });
}

async function getGuestChatUsers() {
    return await apiRequest('/admin/guest-chat-users', 'GET');
}

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
    document.addEventListener('DOMContentLoaded', initAdminPanel);
} else {
    // DOM уже загружен
    initAdminPanel();
}
