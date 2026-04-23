let categories = [];
let products = [];
let banners = [];
let currentEditingProduct = null;
let selectedFiles = [];
let mainImageIndex = 0;

let bannerArea = {
    x: 0,
    y: 0,
    width: 100,
    height: 100
};
let bannerAreaSelecting = false;
let bannerAreaStart = { x: 0, y: 0 };
let bannerAreaBox = null;
let bannerPreviewImg = null;

let allRegisteredOrders = [];
let allGuestOrders = [];
let allBackups = [];

function renderProductImagePreview() {
    const preview = document.getElementById('productImagePreview');
    preview.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.classList.add('image-item');
        div.dataset.index = index;
        div.draggable = true;

        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.dataset.tempUrl = img.src;

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'mainImage';
        radio.value = index;
        radio.checked = index === mainImageIndex;
        radio.addEventListener('change', () => {
            mainImageIndex = index;
            renderProductImagePreview();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.type = 'button';
        deleteBtn.title = 'Видалити зображення';
        deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            selectedFiles.splice(index, 1);
            if (mainImageIndex === index) {
                mainImageIndex = 0;
            } else if (mainImageIndex > index) {
                mainImageIndex -= 1;
            }
            renderProductImagePreview();
        });

        div.appendChild(img);
        div.appendChild(radio);
        div.appendChild(deleteBtn);

        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);

        if (index === mainImageIndex) {
            img.style.border = '2px solid #007bff';
        } else {
            img.style.border = '2px solid #ccc';
        }

        preview.appendChild(div);
    });

    document.getElementById('mainImageIndex').value = mainImageIndex.toString();
}

function clearProductImagePreview() {
    selectedFiles = [];
    mainImageIndex = 0;
    document.getElementById('productImagePreview').innerHTML = '';
    document.getElementById('mainImageIndex').value = '0';
}

function updateMainImageIndex(value) {
    const num = parseInt(value, 10);
    if (!Number.isNaN(num) && num >= 0 && num < selectedFiles.length) {
        mainImageIndex = num;
        renderProductImagePreview();
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
}

function initTextareaAutoResize() {
    const descAdd = document.getElementById('productDescription');
    const descEdit = document.getElementById('editProductDescription');

    [descAdd, descEdit].forEach(el => {
        if (el) {
            el.style.overflow = 'hidden';
            autoResizeTextarea(el);
            el.addEventListener('input', () => autoResizeTextarea(el));
        }
    });
}

// Обработчик для превью изображений товара
const productImageInput = document.getElementById('productImage');
if (productImageInput) {
    productImageInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        files.forEach(file => {
            if (file && file.type.startsWith('image/')) {
                selectedFiles.push(file);
            }
        });

        if (mainImageIndex >= selectedFiles.length) {
            mainImageIndex = 0;
        }

        renderProductImagePreview();

        // Очистить input, чтобы можно было выбрать те же файлы снова
        e.target.value = '';
    });
}

let draggedElement = null;

function handleDragStart(e) {
    draggedElement = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedElement.dataset.index);
    draggedElement.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    const target = e.target.closest('#productImagePreview > div');
    if (!target || !draggedElement || target === draggedElement) return;

    const fromIndex = Number(draggedElement.dataset.index);
    const toIndex = Number(target.dataset.index);
    if (Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex === toIndex) return;

    const [moved] = selectedFiles.splice(fromIndex, 1);
    selectedFiles.splice(toIndex, 0, moved);

    if (mainImageIndex === fromIndex) {
        mainImageIndex = toIndex;
    } else if (fromIndex < mainImageIndex && toIndex >= mainImageIndex) {
        mainImageIndex -= 1;
    } else if (fromIndex > mainImageIndex && toIndex <= mainImageIndex) {
        mainImageIndex += 1;
    }

    renderProductImagePreview();
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
    }
    draggedElement = null;
}

let editDraggedElement = null;

function handleEditDragStart(e) {
    editDraggedElement = e.target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
    e.target.style.opacity = '0.5';
    e.target.classList.add('dragging');
}

function handleEditDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleEditDrop(e) {
    e.preventDefault();
    const target = e.target.closest('.image-item');
    if (target && target !== editDraggedElement) {
        const gallery = document.getElementById('editImageGallery');
        const children = Array.from(gallery.children);
        const draggedIndex = children.indexOf(editDraggedElement);
        const targetIndex = children.indexOf(target);
        
        // Переместить в DOM
        if (draggedIndex < targetIndex) {
            gallery.insertBefore(editDraggedElement, target.nextSibling);
        } else {
            gallery.insertBefore(editDraggedElement, target);
        }
        
        // Обновить порядок в данных (если нужно, но сохраним при submit)
    }
}

function handleEditDragEnd(e) {
    e.target.style.opacity = '1';
    e.target.classList.remove('dragging');
    editDraggedElement = null;
}

// Обработчики для bottom-panel кнопок
function initAdminBottomPanelButtons() {
    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) {
        homeBtn.onclick = () => {
            window.location.href = '/';
        };
    }

    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.onclick = () => {
            window.location.href = '/profile.html';
        };
    }

    const chatBtn = document.getElementById('chatBtn');
    if (chatBtn) {
        chatBtn.onclick = () => {
            window.location.href = '/chat';
        };
    }

    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) {
        cartBtn.onclick = () => {
            renderCart();
            const cartModal = document.getElementById('cartModal');
            if (cartModal) cartModal.style.display = 'block';
        };
    }

    const logoutBtnBottom = document.getElementById('logoutBtnBottom');
    if (logoutBtnBottom) {
        logoutBtnBottom.onclick = () => {
            logoutUser();
            window.location.href = '/';
        };
    }

    const backToSiteBtnBottom = document.getElementById('backToSiteBtnBottom');
    if (backToSiteBtnBottom) {
        backToSiteBtnBottom.onclick = () => {
            window.location.href = '/';
        };
    }
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

function formatPrice(value) {
    const number = Number(value) || 0;
    return `ГРН. ${number.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function saveCart(cart) {
    if (!cart || cart.length === 0) {
        localStorage.removeItem('cart');
    } else {
        localStorage.setItem('cart', JSON.stringify(cart));
    }
}

function updateCartCount() {
    const cart = getCart();
    const countNode = document.getElementById('cartCount');
    if (countNode) {
        countNode.textContent = String(cart.reduce((sum, item) => sum + item.quantity, 0));
    }
}

function removeFromCart(productId) {
    const cart = getCart().filter(item => item.id !== productId);
    saveCart(cart);
    updateCartCount();
    renderCart();
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

function renderCart() {
    const cart = getCart();
    const cartItemsContainer = document.getElementById('cartItems');
    const cartSummary = document.getElementById('cartSummary');
    if (!cartItemsContainer || !cartSummary) return;
    if (!cart.length) {
        cartItemsContainer.innerHTML = '<p>Корзина пуста.</p>';
        cartSummary.textContent = '';
        return;
    }
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const formattedTotal = formatPrice(total);

    cartItemsContainer.innerHTML = cart.map(item => `
        <div class="cart-item">
            ${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''}
            <div class="cart-item-info">
                <strong onclick="window.open('product.html?id=${item.id}', '_blank')" style="cursor: pointer;">${item.name}</strong>
                <div class="cart-item-meta">
                    <span class="cart-item-quantity">Кількість ${item.quantity}</span>
                    <span class="cart-item-price">${formatPrice(item.price)}</span>
                </div>
            </div>
            <div class="cart-item-actions">
                <div class="count-controls">
                    <button type="button" onclick="changeCartQuantity(${item.id}, -1)">−</button>
                    <span class="cart-quantity">${item.quantity}</span>
                    <button type="button" onclick="changeCartQuantity(${item.id}, 1)">+</button>
                </div>
                <button class="remove-button" type="button" onclick="removeFromCart(${item.id})">×</button>
            </div>
        </div>
    `).join('');
    cartSummary.textContent = formattedTotal;
}

function initCartModal() {
    const closeCartModal = document.getElementById('closeCartModal');
    const closeCartModalBtn = document.getElementById('closeCartModalBtn');
    const cartModal = document.getElementById('cartModal');
    if (closeCartModal) {
        closeCartModal.onclick = () => {
            if (cartModal) cartModal.style.display = 'none';
        };
    }
    if (closeCartModalBtn) {
        closeCartModalBtn.onclick = () => {
            if (cartModal) cartModal.style.display = 'none';
        };
    }
    window.addEventListener('click', (event) => {
        if (event.target === cartModal) {
            cartModal.style.display = 'none';
        }
    });
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) {
        checkoutBtn.onclick = () => {
            window.location.href = '/checkout.html';
        };
    }
}

// Переключение между разделами
function showSection(sectionName) {
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
    if (sectionName === 'categories') {
        loadCategories();
    } else if (sectionName === 'products') {
        loadProducts();
    } else if (sectionName === 'orders') {
        loadOrders();
    } else if (sectionName === 'banners') {
        loadBannersAdmin();
    } else if (sectionName === 'backups') {
        loadBackups();
    } else if (sectionName === 'dashboard') {
        loadDashboard();
    }
}

// Загрузить Dashboard
async function loadDashboard() {
    try {
        const cats = await getCategories();
        const prods = await getProducts();
        const users = await getAdminUsers();
        document.getElementById('categoriesCount').textContent = cats.length;
        document.getElementById('productsCount').textContent = prods.length;
        document.getElementById('usersCount').textContent = users.length;
    } catch (error) {
        console.error('Помилка завантаження dashboard:', error);
    }
}

function formatBackupSize(sizeBytes) {
    const size = Number(sizeBytes || 0);
    if (size >= 1024 * 1024 * 1024) {
        return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (size >= 1024 * 1024) {
        return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (size >= 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${size} B`;
}

function formatBackupDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('uk-UA');
}

function parseUtcDate(value) {
    if (!value) return null;

    let date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        date = new Date(value.endsWith('Z') ? value : `${value}Z`);
    }

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function formatOrderCreatedAt(value) {
    const date = parseUtcDate(value);
    if (!date) {
        return value || '';
    }

    return date.toLocaleString('uk-UA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Kyiv'
    });
}

function setBackupStatus(message, type = 'success') {
    const statusNode = document.getElementById('backupStatus');
    if (!statusNode) return;

    statusNode.textContent = message;
    statusNode.className = `backup-status ${type}`;
    statusNode.style.display = 'block';
}

function renderBackupCards(backups) {
    const listNode = document.getElementById('backupsList');
    if (!listNode) return;

    if (!backups.length) {
        listNode.innerHTML = '<p class="empty-message">Р РµР·РµСЂРІРЅРёС… РєРѕРїС–Р№ С‰Рµ РЅРµРјР°С”.</p>';
        return;
    }

    listNode.innerHTML = backups.map(backup => {
        const manifest = backup.manifest || {};
        const entities = manifest.entities || {};
        const uploads = manifest.uploads || {};

        const statItems = [
            `РљРѕСЂРёСЃС‚СѓРІР°С‡С–: ${entities.users ?? 0}`,
            `РўРѕРІР°СЂРё: ${entities.products ?? 0}`,
            `РљР°С‚РµРіРѕСЂС–С—: ${entities.categories ?? 0}`,
            `Р‘Р°РЅРµСЂРё: ${entities.banners ?? 0}`,
            `Р—Р°РјРѕРІР»РµРЅРЅСЏ: ${(entities.orders ?? 0) + (entities.guest_orders ?? 0)}`,
            `Р§Р°С‚Рё: ${(entities.chat_messages ?? 0) + (entities.guest_chat_messages ?? 0)}`,
            `Р¤Р°Р№Р»Рё: ${uploads.files_count ?? 0}`
        ];

        return `
            <div class="backup-card">
                <div class="backup-card-header">
                    <div class="backup-card-title">${escapeAdminHtml(backup.filename)}</div>
                </div>
                <div class="backup-card-meta">
                    <div><strong>РЎС‚РІРѕСЂРµРЅРѕ:</strong> ${escapeAdminHtml(formatBackupDate(manifest.created_at || backup.created_at))}</div>
                    <div><strong>Р РѕР·РјС–СЂ:</strong> ${escapeAdminHtml(formatBackupSize(backup.size_bytes))}</div>
                    <div><strong>Р”Р¶РµСЂРµР»Рѕ:</strong> ${escapeAdminHtml(manifest.source || 'manual')}</div>
                    <div><strong>Р‘Р”:</strong> ${escapeAdminHtml(manifest.database?.driver || 'unknown')}</div>
                </div>
                <div class="backup-card-stats">
                    ${statItems.map(item => `<span class="backup-stat-chip">${escapeAdminHtml(item)}</span>`).join('')}
                </div>
                <div class="backup-card-actions">
                    <button type="button" class="btn-secondary" onclick="handleBackupDownload('${encodeURIComponent(backup.filename)}')">Р—Р°РІР°РЅС‚Р°Р¶РёС‚Рё</button>
                    <button type="button" class="btn-danger" onclick="handleBackupRestore('${encodeURIComponent(backup.filename)}')">Р’С–РґРЅРѕРІРёС‚Рё</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadBackups() {
    const listNode = document.getElementById('backupsList');
    if (!listNode) return;

    listNode.innerHTML = '<p class="empty-message">Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ СЂРµР·РµСЂРІРЅРёС… РєРѕРїС–Р№...</p>';

    try {
        allBackups = await getAdminBackups();
        renderBackupCards(allBackups);
    } catch (error) {
        console.error('Backup loading error:', error);
        listNode.innerHTML = `<p class="empty-message">${escapeAdminHtml(error.message || 'РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё СЂРµР·РµСЂРІРЅС– РєРѕРїС–С—.')}</p>`;
    }
}

async function handleBackupDownload(encodedFilename) {
    try {
        const filename = decodeURIComponent(encodedFilename);
        const result = await downloadAdminBackup(filename);
        const downloadUrl = window.URL.createObjectURL(result.blob);
        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = result.filename || filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        alert(`РџРѕРјРёР»РєР° Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ: ${error.message}`);
    }
}

async function createBackupAndRefresh() {
    try {
        setBackupStatus('РЎС‚РІРѕСЂСЋС”РјРѕ СЂРµР·РµСЂРІРЅСѓ РєРѕРїС–СЋ...', 'success');
        const backup = await createAdminBackup();
        setBackupStatus(`Р РµР·РµСЂРІРЅСѓ РєРѕРїС–СЋ ${backup.filename} СѓСЃРїС–С€РЅРѕ СЃС‚РІРѕСЂРµРЅРѕ.`, 'success');
        await loadBackups();
    } catch (error) {
        setBackupStatus(error.message || 'РќРµ РІРґР°Р»РѕСЃСЏ СЃС‚РІРѕСЂРёС‚Рё СЂРµР·РµСЂРІРЅСѓ РєРѕРїС–СЋ.', 'error');
    }
}

async function handleBackupRestore(encodedFilename) {
    const filename = decodeURIComponent(encodedFilename);
    const confirmed = window.confirm(`Р’С–РґРЅРѕРІРёС‚Рё СЃР°Р№С‚ Р· СЂРµР·РµСЂРІРЅРѕС— РєРѕРїС–С— ${filename}? ПоточнС– РґР°РЅС– Р±СѓРґСѓС‚СЊ Р·Р°РјС–РЅРµРЅС–.`);
    if (!confirmed) return;

    try {
        setBackupStatus(`Р’С–РґРЅРѕРІР»СЋС”РјРѕ РґР°РЅС– Р· ${filename}...`, 'success');
        const result = await restoreAdminBackup(filename);
        const restorePoint = result.restore_point?.filename ? ` РўРѕС‡РєР° РІС–РґРєР°С‚Сѓ: ${result.restore_point.filename}.` : '';
        setBackupStatus(`Р’С–РґРЅРѕРІР»РµРЅРЅСЏ Р·Р°РІРµСЂС€РµРЅРѕ.${restorePoint}`, 'success');
        await loadBackups();
    } catch (error) {
        setBackupStatus(error.message || 'РќРµ РІРґР°Р»РѕСЃСЏ РІС–РґРЅРѕРІРёС‚Рё Р±РµРєР°Рї.', 'error');
    }
}

async function restoreBackupFromUploadedFile() {
    const input = document.getElementById('restoreBackupFile');
    const file = input?.files?.[0];

    if (!file) {
        alert('РћР±РµСЂС–С‚СЊ ZIP-С„Р°Р№Р» Р· СЂРµР·РµСЂРІРЅРѕСЋ РєРѕРїС–С”СЋ.');
        return;
    }

    const confirmed = window.confirm(`Р’С–РґРЅРѕРІРёС‚Рё СЃР°Р№С‚ Р· С„Р°Р№Р»Сѓ ${file.name}? ПоточнС– РґР°РЅС– Р±СѓРґСѓС‚СЊ Р·Р°РјС–РЅРµРЅС–.`);
    if (!confirmed) return;

    try {
        setBackupStatus(`Р—Р°РІР°РЅС‚Р°Р¶СѓС”РјРѕ С‚Р° РІС–РґРЅРѕРІР»СЋС”РјРѕ ${file.name}...`, 'success');
        const result = await restoreAdminBackupFromFile(file);
        input.value = '';
        const restorePoint = result.restore_point?.filename ? ` РўРѕС‡РєР° РІС–РґРєР°С‚Сѓ: ${result.restore_point.filename}.` : '';
        setBackupStatus(`Р’С–РґРЅРѕРІР»РµРЅРЅСЏ Р· Р·Р°РІР°РЅС‚Р°Р¶РµРЅРѕРіРѕ С„Р°Р№Р»Сѓ Р·Р°РІРµСЂС€РµРЅРѕ.${restorePoint}`, 'success');
        await loadBackups();
    } catch (error) {
        setBackupStatus(error.message || 'РќРµ РІРґР°Р»РѕСЃСЏ РІС–РґРЅРѕРІРёС‚Рё Р±РµРєР°Рї Р· С„Р°Р№Р»Сѓ.', 'error');
    }
}

function renderRegisteredOrders(orders) {
    const registeredContainer = document.getElementById('registeredOrdersList');
    registeredContainer.innerHTML = orders.length
        ? orders.map(order => renderOrderCard(order, false)).join('')
        : '<p class="empty-message">Поки немає зареєстрованих замовлень.</p>';
    bindOrderStatusControls();
}

function renderGuestOrders(orders) {
    const guestContainer = document.getElementById('guestOrdersList');
    guestContainer.innerHTML = orders.length
        ? orders.map(order => renderOrderCard(order, true)).join('')
        : '<p class="empty-message">Поки немає гостьових замовлень.</p>';
    bindOrderStatusControls();
}

function filterRegisteredOrders() {
    const searchTerm = document.getElementById('registeredOrdersSearch').value.trim().toLowerCase();
    if (!searchTerm) {
        renderRegisteredOrders(allRegisteredOrders);
        return;
    }
    const filtered = allRegisteredOrders.filter(order => 
        order.order_number && order.order_number.toLowerCase().includes(searchTerm)
    );
    renderRegisteredOrders(filtered);
}

function filterGuestOrders() {
    const searchTerm = document.getElementById('guestOrdersSearch').value.trim().toLowerCase();
    if (!searchTerm) {
        renderGuestOrders(allGuestOrders);
        return;
    }
    const filtered = allGuestOrders.filter(order => 
        order.order_number && order.order_number.toLowerCase().includes(searchTerm)
    );
    renderGuestOrders(filtered);
}

function formatAdminPrice(value) {
    if (value === null || value === undefined) return '0 грн.';
    return Number(value).toLocaleString('uk-UA') + ' грн.';
}

function getAdminDueAmount(order) {
    const total = Number(order.total_price || 0);
    const prepayment = order.prepayment_received ? Number(order.prepayment_amount || 0) : 0;
    return Math.max(total - prepayment, 0);
}

function escapeAdminHtml(value) {
    const div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
}

function getOrderStatusOptions(selectedStatus) {
    const statuses = [
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

    return statuses.map(status => `
        <option value="${status}" ${status === selectedStatus ? 'selected' : ''}>${status}</option>
    `).join('');
}

function isDeliveryOrderStatus(status) {
    return status === 'Замовлення у процесі доставки';
}

function parseOrderItems(itemsData) {
    let items = [];
    try {
        items = typeof itemsData === 'string' ? JSON.parse(itemsData) : itemsData;
    } catch (error) {
        items = [];
    }

    return Array.isArray(items) ? items : [];
}

function formatAdminDeliveryMethod(order) {
    if (order.delivery_method === 'postal') {
        return `Пошта, відділення ${order.postal_branch_number || '—'}`;
    }

    if (order.delivery_method === 'courier') {
        return 'Кур’єр';
    }

    if (order.delivery_method === 'nova_branch') {
        return `Доставка у відділення Нової пошти (${order.postal_branch_number || '—'})`;
    }

    if (order.delivery_method === 'nova_locker') {
        return `Доставка у поштомат Нової пошти (${order.postal_branch_number || '—'})`;
    }

    if (order.delivery_method === 'nova_courier') {
        return `Доставка кур'єром Нової пошти (${order.postal_branch_number || '—'})`;
    }

    if (order.delivery_method === 'other_post') {
        return `Доставка іншою поштою (${order.postal_branch_number || '—'})`;
    }

    return order.delivery_method || 'Не вказано';
}

function formatAdminPaymentMethod(method) {
    if (method === 'cod') return 'Накладений платіж';
    if (method === 'card') return 'Оплата карткою';
    return method || 'Не вказано';
}

function buildAdminOrderReceipt(order, isGuest = false) {
    const items = parseOrderItems(order.items_data);
    if (!items.length) {
        return '<div class="order-items-empty">Немає товарів</div>';
    }

    const orderNumber = escapeAdminHtml(order.order_number || `Замовлення #${order.id}`);
    const customerName = escapeAdminHtml(isGuest ? (order.guest_name || 'Не вказано') : (order.recipient_name || 'Не вказано'));
    const customerPhone = escapeAdminHtml(isGuest ? (order.guest_phone || 'Не вказано') : (order.recipient_phone || 'Не вказано'));
    const customerCity = escapeAdminHtml(isGuest ? (order.guest_city || 'Не вказано') : (order.recipient_city || 'Не вказано'));
    const deliveryText = escapeAdminHtml(formatAdminDeliveryMethod(order));
    const paymentText = escapeAdminHtml(formatAdminPaymentMethod(order.payment_method));
    const trackingNumber = escapeAdminHtml(order.tracking_number || '');
    const prepaymentAmount = order.prepayment_received ? Number(order.prepayment_amount || 0) : 0;
    const dueAmount = getAdminDueAmount(order);
    const customerTypeLabel = isGuest ? 'Гостьове замовлення' : 'Замовлення користувача';
    const customerExtraLine = isGuest
        ? ''
        : `<div>Email: ${escapeAdminHtml(order.user_email || 'Не вказано')}</div>`;

    const itemsHtml = items.map(item => {
        const quantity = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const lineTotal = quantity * price;
        const name = escapeAdminHtml(item.name || 'Товар');
        const hasLink = item.id !== null && item.id !== undefined && item.id !== '';
        const productUrl = hasLink ? `/product.html?id=${encodeURIComponent(item.id)}` : '';
        const imageHtml = item.image
            ? `<a class="order-receipt-link" href="${hasLink ? escapeAdminHtml(productUrl) : '#'}" ${hasLink ? 'target="_blank" rel="noopener noreferrer"' : ''}><img class="order-receipt-img" src="${escapeAdminHtml(item.image)}" alt="${name}"></a>`
            : '';
        const titleHtml = hasLink
            ? `<a class="order-receipt-link" href="${escapeAdminHtml(productUrl)}" target="_blank" rel="noopener noreferrer">${name}</a>`
            : name;

        return `
            <div class="order-receipt-item">
                ${imageHtml}
                <div class="order-receipt-item-content">
                    <div class="order-receipt-item-title">${titleHtml}</div>
                    <div class="order-receipt-item-meta">${quantity} × ${formatAdminPrice(price)}</div>
                </div>
                <div class="order-receipt-item-price">${formatAdminPrice(lineTotal)}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="order-receipt">
            <div class="order-receipt-header">${customerTypeLabel} № ${orderNumber}</div>
            <div class="order-receipt-meta">
                <div>Телефон: ${customerPhone}</div>
                <div>Ім'я: ${customerName}</div>
                ${customerExtraLine}
                <div>Місто: ${customerCity}</div>
                <div>Доставка: ${deliveryText}</div>
                <div>Оплата: ${paymentText}</div>
                ${trackingNumber ? `<div><strong>ТТН:</strong> ${trackingNumber}</div>` : ''}
            </div>
            <div class="order-receipt-items">
                ${itemsHtml}
            </div>
            <div class="order-receipt-total">
                <span class="order-receipt-summary-row">
                    <span>Загальна сума:</span>
                    <strong>${formatAdminPrice(order.total_price)}</strong>
                </span>
                ${prepaymentAmount > 0 ? `
                    <span class="order-receipt-summary-row">
                        <span>Передплата:</span>
                        <strong>${formatAdminPrice(prepaymentAmount)}</strong>
                    </span>
                ` : ''}
                <span class="order-receipt-summary-row">
                    <span>До сплати:</span>
                    <strong>${formatAdminPrice(dueAmount)}</strong>
                </span>
            </div>
        </div>
    `;
}

function renderOrderCard(order, isGuest = false) {
    const createdAt = formatOrderCreatedAt(order.created_at);
    const currentStatus = order.status || 'Замовлення очікує підтвердження менеджером';
    const trackingNumber = order.tracking_number || '';
    const prepaymentReceived = Boolean(order.prepayment_received);
    const prepaymentAmount = prepaymentReceived ? Number(order.prepayment_amount || 0) : '';

    return `
        <div class="order-card">
            <div class="order-card-header">
                <div class="order-label">${isGuest ? 'Гостьове замовлення' : 'Замовлення'}</div>
                <div class="order-number">${escapeAdminHtml(order.order_number || '—')}</div>
            </div>
            <div class="admin-order-layout">
                <div class="admin-order-receipt-wrap">
                    ${buildAdminOrderReceipt(order, isGuest)}
                </div>
                <div class="admin-order-side">
                    <div class="admin-order-side-block">
                        <div class="admin-order-side-title">Керування замовленням</div>
                        <div class="admin-order-side-meta"><strong>Дата:</strong> ${escapeAdminHtml(createdAt)}</div>
                        <div class="order-status-control">
                            <strong>Статус:</strong>
                            <select class="order-status-select" data-order-id="${order.id}" data-order-type="${isGuest ? 'guest' : 'registered'}">
                                ${getOrderStatusOptions(currentStatus)}
                            </select>
                            <div class="order-ttn-control" style="${isDeliveryOrderStatus(currentStatus) ? '' : 'display:none;'}">
                                <input type="text" class="order-ttn-input" value="${escapeAdminHtml(trackingNumber)}" placeholder="ТТН">
                            </div>
                            <label class="order-prepayment-toggle">
                                <input type="checkbox" class="order-prepayment-checkbox" ${prepaymentReceived ? 'checked' : ''}>
                                <span>Передплата отримана</span>
                            </label>
                            <div class="order-prepayment-control" style="${prepaymentReceived ? '' : 'display:none;'}">
                                <input type="number" min="0" step="0.01" class="order-prepayment-input" value="${escapeAdminHtml(prepaymentAmount)}" placeholder="Сума передплати">
                            </div>
                            <button type="button" class="btn-edit order-status-save-btn" data-order-id="${order.id}" data-order-type="${isGuest ? 'guest' : 'registered'}">Зберегти статус</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function loadOrders() {
    try {
        const [orders, guestOrders] = await Promise.all([getAllOrders(), getAdminGuestOrders()]);
        allRegisteredOrders = orders;
        allGuestOrders = guestOrders;
        document.getElementById('registeredOrdersCount').textContent = orders.length;
        document.getElementById('guestOrdersCount').textContent = guestOrders.length;

        renderRegisteredOrders(orders);
        renderGuestOrders(guestOrders);
        bindOrderStatusControls();
    } catch (error) {
        console.error('Помилка завантаження замовлень:', error);
        document.getElementById('registeredOrdersList').innerHTML = '<p class="empty-message">Не вдалося завантажити зареєстровані замовлення.</p>';
        document.getElementById('guestOrdersList').innerHTML = '<p class="empty-message">Не вдалося завантажити гостьові замовлення.</p>';
    }
}

// Загрузить категории
async function handleOrderStatusChange(event) {
    const select = event.target;
    const statusControl = select.closest('.order-status-control');
    const ttnControl = statusControl?.querySelector('.order-ttn-control');
    if (ttnControl) {
        ttnControl.style.display = isDeliveryOrderStatus(select.value) ? '' : 'none';
    }
}

function handlePrepaymentToggle(event) {
    const checkbox = event.target;
    const statusControl = checkbox.closest('.order-status-control');
    const prepaymentControl = statusControl?.querySelector('.order-prepayment-control');
    const prepaymentInput = statusControl?.querySelector('.order-prepayment-input');
    if (prepaymentControl) {
        prepaymentControl.style.display = checkbox.checked ? '' : 'none';
    }
    if (!checkbox.checked && prepaymentInput) {
        prepaymentInput.value = '';
    }
}

function bindOrderStatusControls() {
    document.querySelectorAll('.order-status-select').forEach(select => {
        select.dataset.previousStatus = select.value;
        select.onchange = handleOrderStatusChange;
    });

    document.querySelectorAll('.order-prepayment-checkbox').forEach(checkbox => {
        checkbox.onchange = handlePrepaymentToggle;
    });

    document.querySelectorAll('.order-status-save-btn').forEach(button => {
        button.onclick = handleOrderStatusSave;
    });
}

function notifyOrderStatusUpdated(status, trackingNumber = '') {
    const message = isDeliveryOrderStatus(status) && trackingNumber
        ? `Статус замовлення оновлено. ТТН ${trackingNumber} збережено.`
        : 'Статус замовлення оновлено.';

    if (typeof showNotification === 'function') {
        showNotification(message, 'Успіх', 'success', 3000);
        return;
    }

    alert(message);
}

async function handleOrderStatusSave(event) {
    const button = event.target;
    const statusControl = button.closest('.order-status-control');
    const select = statusControl?.querySelector('.order-status-select');
    const ttnInput = statusControl?.querySelector('.order-ttn-input');
    const prepaymentCheckbox = statusControl?.querySelector('.order-prepayment-checkbox');
    const prepaymentInput = statusControl?.querySelector('.order-prepayment-input');
    if (!select) return;

    const orderId = Number(button.dataset.orderId);
    const orderType = button.dataset.orderType;
    const status = select.value;
    const trackingNumber = ttnInput ? ttnInput.value.trim() : '';
    const prepaymentReceived = Boolean(prepaymentCheckbox?.checked);
    const prepaymentAmount = prepaymentInput ? prepaymentInput.value.trim() : '';

    if (isDeliveryOrderStatus(status) && !trackingNumber) {
        alert('Вкажіть номер ТТН для статусу доставки.');
        if (ttnInput) ttnInput.focus();
        return;
    }

    if (prepaymentReceived && !prepaymentAmount) {
        alert('Вкажіть суму передплати.');
        if (prepaymentInput) prepaymentInput.focus();
        return;
    }

    button.disabled = true;

    try {
        const payload = {
            prepayment_received: prepaymentReceived,
            prepayment_amount: prepaymentReceived ? prepaymentAmount : null
        };

        if (orderType === 'guest') {
            const result = await updateAdminGuestOrderStatus(orderId, status, trackingNumber, payload);
            allGuestOrders = allGuestOrders.map(order => order.id === orderId ? {
                ...order,
                status: result.status,
                tracking_number: result.tracking_number || '',
                prepayment_received: Boolean(result.prepayment_received),
                prepayment_amount: result.prepayment_amount
            } : order);
        } else {
            const result = await updateAdminOrderStatus(orderId, status, trackingNumber, payload);
            allRegisteredOrders = allRegisteredOrders.map(order => order.id === orderId ? {
                ...order,
                status: result.status,
                tracking_number: result.tracking_number || '',
                prepayment_received: Boolean(result.prepayment_received),
                prepayment_amount: result.prepayment_amount
            } : order);
        }

        select.dataset.previousStatus = status;
        notifyOrderStatusUpdated(status, trackingNumber);
        await loadOrders();
    } catch (error) {
        console.error('Помилка оновлення статусу замовлення:', error);
        alert(error.message || 'Не вдалося оновити статус замовлення. Спробуйте ще раз.');
    } finally {
        button.disabled = false;
    }
}

async function loadCategories() {
    try {
        categories = await getCategories();
        const categoryMap = categories.reduce((acc, item) => {
            acc[item.id] = item.name;
            return acc;
        }, {});

        const mainCats = categories.filter(c => !c.parent_id);
        const tbody = document.querySelector('#categoriesTable tbody');

        tbody.innerHTML = mainCats.map(main => {
            const children = categories.filter(c => c.parent_id === main.id);
            const mainRow = `
                <tr>
                    <td>${main.id}</td>
                    <td>${main.name}</td>
                    <td>-</td>
                    <td>${main.description || '-'}</td>
                    <td><button class="btn-delete" onclick="deleteCategory(${main.id})">Видалити</button></td>
                </tr>
            `;
            const childRows = children.map(sub => `
                <tr>
                    <td>${sub.id}</td>
                    <td>↳ ${sub.name}</td>
                    <td>${categoryMap[sub.parent_id] || '-'}</td>
                    <td>${sub.description || '-'}</td>
                    <td><button class="btn-delete" onclick="deleteCategory(${sub.id})">Видалити</button></td>
                </tr>
            `).join('');
            return mainRow + childRows;
        }).join('');
    } catch (error) {
        alert('Помилка завантаження категорій: ' + error.message);
    }
}

// Загрузить товары
async function loadProducts() {
    try {
        categories = await getCategories();
        products = await getProducts();
        
        const categoryMap = {};
        categories.forEach(cat => {
            categoryMap[cat.id] = cat.name;
        });
        
        const tbody = document.querySelector('#productsTable tbody');
        tbody.innerHTML = products.map(prod => `
            <tr>
                <td>
                    ${prod.images && prod.images.length > 0 ? prod.images.map(img => `<img src="${img.url}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px; margin-right: 5px; ${img.is_main ? 'border: 2px solid #007bff;' : ''}" title="${img.is_main ? 'Заглавное' : ''}">`).join('') : '-'}
                </td>
                <td>${prod.id}</td>
                <td>${prod.name}</td>
                <td>${prod.price} грн.</td>
                <td>${prod.availability_status || 'В наявності'}</td>
                <td>${categoryMap[prod.category_id] || '-'}</td>
                <td>
                    <button class="btn-edit" onclick="editProduct(${prod.id})">Редагувати</button>
                    <button class="btn-delete" onclick="deleteProduct(${prod.id})">Видалити</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        alert('Помилка завантаження товарів: ' + error.message);
    }
}

// Модальные окна для добавления
function openAddCategoryModal() {
    document.getElementById('addCategoryModal').style.display = 'block';
}

function closeAddCategoryModal() {
    document.getElementById('addCategoryModal').style.display = 'none';
    document.getElementById('addCategoryForm').reset();
}

function openAddSubcategoryModal() {
    document.getElementById('addSubcategoryModal').style.display = 'block';
    renderSubcategoryParentSelect();
}

function closeAddSubcategoryModal() {
    document.getElementById('addSubcategoryModal').style.display = 'none';
    document.getElementById('addSubcategoryForm').reset();
}

async function renderSubcategoryParentSelect() {
    try {
        const cats = await getCategories();
        const parentSelect = document.getElementById('subcategoryParent');
        parentSelect.innerHTML = '<option value="">Выберите основную категорию</option>' +
            cats.filter(c => !c.parent_id).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } catch (error) {
        console.error('Помилка завантаження основних категорій для підкатегорії:', error);
    }
}

function openAddProductModal() {
    document.getElementById('addProductModal').style.display = 'block';
    loadCategoriesForSelect();
    clearProductImagePreview();
    initTextareaAutoResize();
}

function closeAddProductModal() {
    document.getElementById('addProductModal').style.display = 'none';
    document.getElementById('addProductForm').reset();
    clearProductImagePreview();
}

async function loadCategoriesForSelect() {
    try {
        const cats = await getCategories();
        const select = document.getElementById('productCategory');
        select.innerHTML = '<option value="">Выберите категорию</option>' + cats.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
    } catch (error) {
        console.error('Помилка завантаження категорій для селекта:', error);
    }
}

function openEditProductModal(product) {
    document.getElementById('editProductModal').style.display = 'block';
    document.getElementById('editProductName').value = product.name;
    document.getElementById('editProductDescription').value = product.description || '';
    document.getElementById('editProductSupplierInfo').value = product.supplier_info || '';
    document.getElementById('editProductAvailabilityStatus').value = product.availability_status || 'В наявності';
    document.getElementById('editProductPrice').value = product.price;
    document.getElementById('editProductDropPrice').value = product.drop_price || '';
    document.getElementById('editProductStock').value = product.stock;
    loadCategoriesForEditSelect();
    // Устанавливаем категорию после загрузки опций
    setTimeout(() => {
        document.getElementById('editProductCategory').value = product.category_id;
    }, 100);
    initTextareaAutoResize();
    
    // Заполняем галерею изображений
    const imagesContainer = document.getElementById('editProductImages');
    if (product.images && product.images.length > 0) {
        imagesContainer.innerHTML = '<h4>Текущие фото (выберите заглавное, перетаскивайте для изменения порядка):</h4><div id="editImageGallery" class="image-gallery">' + product.images.sort((a, b) => a.order - b.order).map(img => `
            <div class="image-item" data-id="${img.id}" draggable="true">
                <label>
                    <input type="radio" name="mainImage" value="${img.id}" ${img.is_main ? 'checked' : ''}>
                    <img src="${img.url}" alt="Фото товара">
                </label>
            </div>
        `).join('') + '</div>';
        
        // Додати обробники drag and drop
        const gallery = document.getElementById('editImageGallery');
        const items = gallery.querySelectorAll('.image-item');
        items.forEach(item => {
            item.addEventListener('dragstart', handleEditDragStart);
            item.addEventListener('dragover', handleEditDragOver);
            item.addEventListener('drop', handleEditDrop);
            item.addEventListener('dragend', handleEditDragEnd);
        });
    } else {
        imagesContainer.innerHTML = '<p>Нет фото</p>';
    }
    // Изображение не предзаполняем, пользователь может выбрать новое
}

function closeEditProductModal() {
    document.getElementById('editProductModal').style.display = 'none';
    document.getElementById('editProductForm').reset();
    currentEditingProduct = null;
}

async function loadCategoriesForEditSelect() {
    try {
        const cats = await getCategories();
        const select = document.getElementById('editProductCategory');
        select.innerHTML = '<option value="">Выберите категорию</option>';

        const mainCats = cats.filter(c => !c.parent_id);
        mainCats.forEach(main => {
            const mainOption = document.createElement('option');
            mainOption.value = main.id;
            mainOption.textContent = main.name;
            select.appendChild(mainOption);

            const children = cats.filter(c => c.parent_id === main.id);
            children.forEach(sub => {
                const subOption = document.createElement('option');
                subOption.value = sub.id;
                subOption.textContent = `↳ ${main.name} / ${sub.name}`;
                select.appendChild(subOption);
            });
        });
    } catch (error) {
        console.error('Помилка завантаження категорій:', error);
    }
}

async function loadCategoriesForSelect() {
    try {
        const cats = await getCategories();
        const select = document.getElementById('productCategory');
        select.innerHTML = '<option value="">Выберите категорию</option>';

        const mainCats = cats.filter(c => !c.parent_id);
        mainCats.forEach(main => {
            const mainOption = document.createElement('option');
            mainOption.value = main.id;
            mainOption.textContent = main.name;
            select.appendChild(mainOption);

            const children = cats.filter(c => c.parent_id === main.id);
            children.forEach(sub => {
                const subOption = document.createElement('option');
                subOption.value = sub.id;
                subOption.textContent = `↳ ${main.name} / ${sub.name}`;
                select.appendChild(subOption);
            });
        });
    } catch (error) {
        console.error('Помилка завантаження категорій:', error);
    }
}

// Додати категорію
document.getElementById('addCategoryForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('categoryName').value.trim();
    const description = document.getElementById('categoryDescription').value.trim();

    if (!name) {
        return alert('Вкажіть назву категорії');
    }

    try {
        await createCategory(name, description, null);
        alert('Категорія додана!');
        closeAddCategoryModal();
        loadCategories();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
};

// Додати підкатегорію
document.getElementById('addSubcategoryForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('subcategoryName').value.trim();
    const description = document.getElementById('subcategoryDescription').value.trim();
    const parentId = parseInt(document.getElementById('subcategoryParent').value);

    if (!name) {
        return alert('Вкажіть назву підкатегорії');
    }
    if (Number.isNaN(parentId)) {
        return alert('Оберіть основну категорію');
    }

    try {
        await createCategory(name, description, parentId);
        alert('Підкатегорія додана!');
        closeAddSubcategoryModal();
        loadCategories();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
};

// Додати товар: реалізація нижче (в кінці файлу, робота з selectedFiles і mainImageIndex)

// Редагувати товар
document.getElementById('editProductForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!currentEditingProduct) return;
    const name = document.getElementById('editProductName').value;
    const description = document.getElementById('editProductDescription').value.trim();
    const supplierInfo = document.getElementById('editProductSupplierInfo').value.trim();
    const supplierUrl = document.getElementById('editProductSupplierUrl').value.trim();
    const availabilityStatus = document.getElementById('editProductAvailabilityStatus').value;
    const price = parseFloat(document.getElementById('editProductPrice').value);
    const dropPrice = document.getElementById('editProductDropPrice').value.trim();
    const stock = document.getElementById('editProductStock').value.trim() ? parseInt(document.getElementById('editProductStock').value) : 0;
    const categoryId = parseInt(document.getElementById('editProductCategory').value);
    const imageFiles = Array.from(document.getElementById('editProductImage').files);
    const mainImageId = document.querySelector('input[name="mainImage"]:checked')?.value;    
    try {
        await updateProduct(currentEditingProduct.id, name, price, categoryId, stock, imageFiles, mainImageId, description, supplierInfo, availabilityStatus, dropPrice, supplierUrl);
        
        // Обновить порядок изображений
        const gallery = document.getElementById('editImageGallery');
        if (gallery) {
            const items = gallery.querySelectorAll('.image-item');
            const orders = Array.from(items).map((item, index) => ({
                id: parseInt(item.dataset.id),
                order: index
            }));
            if (orders.length > 0) {
                await apiRequest(`/products/${currentEditingProduct.id}/images/order`, 'PUT', { orders });
            }
        }
        
        alert('Товар оновлено!');
        closeEditProductModal();
        loadProducts();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
};

// Видалити категорію
async function deleteCategory(id) {
    showConfirmDialog('Підтвердження видалення', 'Видалити категорію? Це видалить всі товари в ній!', async () => {
        try {
            await apiRequest(`/categories/${id}`, 'DELETE');
            alert('Категорія видалена!');
            loadCategories();
        } catch (error) {
            alert('Помилка: ' + error.message);
        }
    });
}

// Видалити товар
async function deleteProduct(id) {
    showConfirmDialog('Підтвердження видалення', 'Видалити товар?', async () => {
        try {
            const response = await apiRequest(`/products/${id}`, 'DELETE');
            alert('Товар видалено!');
            loadProducts();
        } catch (error) {
            alert('Помилка: ' + error.message);
        }
    });
}

// Редагувати товар
async function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    currentEditingProduct = product;
    openEditProductModal(product);
}

// Загрузить баннеры
async function loadBannersAdmin() {
    try {
        banners = await getAllBanners();
        const tbody = document.querySelector('#bannersTable tbody');
        tbody.innerHTML = banners.map(banner => `
            <tr>
                <td>
                    ${banner.image_filename ? `<img src="/uploads/${banner.image_filename}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 5px;">` : '-'}
                </td>
                <td>
                    ${banner.page_type === 'main' ? 'Головна' : 'Про нас'}
                </td>
                <td>
                    <strong>ID: ${banner.id}</strong><br>
                    ${banner.title ? `<small>Заголовок: ${banner.title}</small><br>` : ''}
                    ${banner.link_url ? `<small>Посилання: <a href="${banner.link_url}" target="_blank">${banner.link_url}</a></small>` : ''}
                </td>
                <td>
                    <button class="btn-delete" onclick="deleteBannerAdmin(${banner.id})">Удалить</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        alert('Помилка завантаження банерів: ' + error.message);
    }
}

function resetBannerAreaPicker() {
    bannerArea = { x: 0, y: 0, width: 100, height: 100 };
    document.getElementById('bannerAreaX').value = '0';
    document.getElementById('bannerAreaY').value = '0';
    document.getElementById('bannerAreaWidth').value = '100';
    document.getElementById('bannerAreaHeight').value = '100';
    updateBannerAreaBox();
}

function updateBannerAreaBox() {
    const picker = document.getElementById('bannerAreaPicker');
    const box = document.getElementById('bannerSelectionBox');
    if (!picker || !box) return;
    box.style.left = `${bannerArea.x}%`;
    box.style.top = `${bannerArea.y}%`;
    box.style.width = `${bannerArea.width}%`;
    box.style.height = `${bannerArea.height}%`;
}

function initBannerAreaPicker() {
    const imageInput = document.getElementById('bannerImage');
    const picker = document.getElementById('bannerAreaPicker');
    const xInput = document.getElementById('bannerAreaX');
    const yInput = document.getElementById('bannerAreaY');
    const wInput = document.getElementById('bannerAreaWidth');
    const hInput = document.getElementById('bannerAreaHeight');

    picker.innerHTML = '<span style="color:#999; font-size:0.9rem;">Кліцніть для завантаження фото, щоб налаштувати область посилання</span>';
    bannerPreviewImg = null;
    bannerAreaSelecting = false;
    bannerAreaBox = null;
    resetBannerAreaPicker();

    imageInput.onchange = () => {
        const file = imageInput.files[0];
        if (!file) {
            picker.innerHTML = '<span style="color:#999; font-size:0.9rem;">Кліцніть для завантаження фото, щоб налаштувати область посилання</span>';
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            picker.innerHTML = '';
            const img = document.createElement('img');
            img.src = event.target.result;
            img.id = 'bannerPickerImage';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '300px';
            img.style.display = 'block';
            img.style.userSelect = 'none';
            img.style.cursor = 'crosshair';
            img.style.margin = 'auto';

            bannerPreviewImg = img;

            const selectionBox = document.createElement('div');
            selectionBox.id = 'bannerSelectionBox';
            selectionBox.className = 'banner-selection-box';
            picker.appendChild(img);
            picker.appendChild(selectionBox);
            picker.style.position = 'relative';
            picker.style.display = 'flex';
            picker.style.alignItems = 'center';
            picker.style.justifyContent = 'center';

            const handleMouseDown = (e) => {
                if (e.target !== img) return;
                e.preventDefault();
                bannerAreaSelecting = true;
                const rect = picker.getBoundingClientRect();
                const imgRect = img.getBoundingClientRect();
                const px = ((e.clientX - imgRect.left) / imgRect.width) * 100;
                const py = ((e.clientY - imgRect.top) / imgRect.height) * 100;
                bannerAreaStart = { x: Math.max(0, Math.min(100, px)), y: Math.max(0, Math.min(100, py)) };
                bannerArea = { x: bannerAreaStart.x, y: bannerAreaStart.y, width: 0.1, height: 0.1 };
                updateBannerAreaBox();
            };

            const handleMouseMove = (e) => {
                if (!bannerAreaSelecting) return;
                e.preventDefault();
                const imgRect = img.getBoundingClientRect();
                const px = ((e.clientX - imgRect.left) / imgRect.width) * 100;
                const py = ((e.clientY - imgRect.top) / imgRect.height) * 100;
                let x1 = Math.min(bannerAreaStart.x, px);
                let y1 = Math.min(bannerAreaStart.y, py);
                let x2 = Math.max(bannerAreaStart.x, px);
                let y2 = Math.max(bannerAreaStart.y, py);
                x1 = Math.max(0, Math.min(100, x1));
                y1 = Math.max(0, Math.min(100, y1));
                x2 = Math.max(0, Math.min(100, x2));
                y2 = Math.max(0, Math.min(100, y2));

                bannerArea = { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
                updateBannerAreaBox();

                xInput.value = Math.round(bannerArea.x * 10) / 10;
                yInput.value = Math.round(bannerArea.y * 10) / 10;
                wInput.value = Math.round(bannerArea.width * 10) / 10;
                hInput.value = Math.round(bannerArea.height * 10) / 10;
            };

            const handleMouseUp = () => {
                if (!bannerAreaSelecting) return;
                bannerAreaSelecting = false;
            };

            picker.addEventListener('mousedown', handleMouseDown, false);
            document.addEventListener('mousemove', handleMouseMove, false);
            document.addEventListener('mouseup', handleMouseUp, false);
            
            // Сохраняем обработчики для последующего удаления
            picker._mouseDownHandler = handleMouseDown;
            picker._mouseMoveHandler = handleMouseMove;
            picker._mouseUpHandler = handleMouseUp;
        };
        reader.readAsDataURL(file);
    };

    const updateAreaFromInputs = () => {
        const x = parseFloat(xInput.value) || 0;
        const y = parseFloat(yInput.value) || 0;
        const w = parseFloat(wInput.value) || 100;
        const h = parseFloat(hInput.value) || 100;
        bannerArea = {
            x: Math.max(0, Math.min(100, x)),
            y: Math.max(0, Math.min(100, y)),
            width: Math.max(1, Math.min(100, w)),
            height: Math.max(1, Math.min(100, h))
        };
        updateBannerAreaBox();
    };

    [xInput, yInput, wInput, hInput].forEach(input => {
        input.oninput = updateAreaFromInputs;
    });
}

// Открыть модальное окно для добавления баннера
function openAddBannerModal() {
    document.getElementById('addBannerModal').style.display = 'block';
    document.getElementById('addBannerForm').reset();
    initBannerAreaPicker();
}

// Закрыть модальное окно баннера
function closeBannerModal() {
    const picker = document.getElementById('bannerAreaPicker');
    if (picker && picker._mouseDownHandler) {
        picker.removeEventListener('mousedown', picker._mouseDownHandler);
        document.removeEventListener('mousemove', picker._mouseMoveHandler);
        document.removeEventListener('mouseup', picker._mouseUpHandler);
        picker._mouseDownHandler = null;
        picker._mouseMoveHandler = null;
        picker._mouseUpHandler = null;
    }
    document.getElementById('addBannerModal').style.display = 'none';
    document.getElementById('addBannerForm').reset();
}

// Добавить баннер
document.getElementById('addBannerForm').onsubmit = async (e) => {
    e.preventDefault();
    const imageFile = document.getElementById('bannerImage').files[0];
    const pageType = document.getElementById('bannerPageType').value;
    const title = document.getElementById('bannerTitle').value.trim();
    const description = document.getElementById('bannerDescription').value.trim();
    const linkUrl = document.getElementById('bannerLinkUrl').value.trim();
    
    // Читаем значения области клика
    const areaX = parseInt(document.getElementById('bannerAreaX').value) || 0;
    const areaY = parseInt(document.getElementById('bannerAreaY').value) || 0;
    const areaWidth = parseInt(document.getElementById('bannerAreaWidth').value) || 100;
    const areaHeight = parseInt(document.getElementById('bannerAreaHeight').value) || 100;
    
    if (!imageFile) {
        alert('Будь ласка, оберіть зображення');
        return;
    }
    
    if (!pageType) {
        alert('Будь ласка, оберіть тип сторінки');
        return;
    }

    try {
        await createBanner(imageFile, pageType, title, description, linkUrl, areaX, areaY, areaWidth, areaHeight);
        alert('Банер додано!');
        closeBannerModal();
        loadBannersAdmin();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
};

// Видалити банер
async function deleteBannerAdmin(id) {
    if (!id || isNaN(Number(id))) {
        alert('Некоректний ID банера: ' + id);
        return;
    }

    showConfirmDialog('Підтвердження видалення', 'Удалить баннер?', async () => {
        try {
            console.log('Запит на видалення банера: id=', id);
            await deleteBanner(id);
            alert('Банер видалено!');
            loadBannersAdmin();
        } catch (error) {
            console.error('deleteBannerAdmin error', error);
        }
    });
}

// ===== ГОСТЕВОЙ ЧАТ =====
let selectedGuestIdentifier = null;
let guestChatMessages = [];

async function loadGuestChatUsers() {
    try {
        const users = await getGuestChatUsers();
        const usersList = document.getElementById('guestChatUsersList');
        usersList.innerHTML = '';

        if (!users.length) {
            usersList.innerHTML = '<p style="text-align: center; color: #999;">Нет гостей</p>';
            return;
        }

        users.forEach(guest => {
            const userDiv = document.createElement('div');
            userDiv.style.padding = '0.75rem';
            userDiv.style.borderBottom = '1px solid #ddd';
            userDiv.style.cursor = 'pointer';
            userDiv.style.borderRadius = '6px';
            userDiv.style.marginBottom = '0.5rem';
            userDiv.style.background = selectedGuestIdentifier === guest.guest_identifier ? '#007bff' : 'white';
            userDiv.style.color = selectedGuestIdentifier === guest.guest_identifier ? 'white' : '#333';
            
            let text = guest.guest_phone || guest.guest_identifier;
            if (guest.unread_count && guest.unread_count > 0) {
                text += ` (${guest.unread_count})`;
                userDiv.style.fontWeight = 'bold';
            }
            
            userDiv.textContent = text;
            userDiv.addEventListener('click', () => openGuestChat(guest.guest_identifier));
            usersList.appendChild(userDiv);
        });
    } catch (error) {
        console.error('Error loading guest chat users:', error);
        document.getElementById('guestChatUsersList').innerHTML = '<p style="color: red;">Помилка завантаження</p>';
    }
}

async function openGuestChat(guestIdentifier) {
    selectedGuestIdentifier = guestIdentifier;
    await loadGuestChatMessages();
    loadGuestChatUsers();
}

async function loadGuestChatMessages() {
    try {
        const messages = await getAdminGuestChat();
        const messagesDiv = document.getElementById('guestChatMessages');
        messagesDiv.innerHTML = '';

        if (!selectedGuestIdentifier) {
            messagesDiv.innerHTML = '<p style="text-align: center; color: #999;">Выберите гостя</p>';
            return;
        }

        // Фільтрувати повідомлення тільки для вибраного гостя
        const filteredMessages = messages.filter(m => m.guest_identifier === selectedGuestIdentifier);
        guestChatMessages = filteredMessages;

        if (!filteredMessages.length) {
            messagesDiv.innerHTML = '<p style="text-align: center; color: #999;">Нема повідомлень</p>';
            return;
        }

        filteredMessages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.style.marginBottom = '0.75rem';
            msgDiv.style.padding = '0.75rem';
            msgDiv.style.borderRadius = '6px';
            msgDiv.style.maxWidth = '80%';
            
            if (msg.sender === 'admin') {
                msgDiv.style.background = '#007bff';
                msgDiv.style.color = 'white';
                msgDiv.style.marginLeft = 'auto';
                msgDiv.style.textAlign = 'right';
            } else {
                msgDiv.style.background = '#e9ecef';
                msgDiv.style.color = '#333';
            }

            const timeSpan = document.createElement('div');
            timeSpan.style.fontSize = '0.75rem';
            timeSpan.style.opacity = '0.7';
            timeSpan.style.marginTop = '0.25rem';
            timeSpan.textContent = new Date(msg.created_at).toLocaleString('uk-UA');

            msgDiv.innerHTML = msg.message;
            msgDiv.appendChild(timeSpan);
            messagesDiv.appendChild(msgDiv);
        });

        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (error) {
        console.error('Error loading guest chat messages:', error);
    }
}

async function sendGuestChatMessage() {
    if (!selectedGuestIdentifier) {
        alert('Viберіть гостя');
        return;
    }

    const input = document.getElementById('guestChatInput');
    const message = input.value.trim();

    if (!message) {
        return;
    }

    try {
        await postAdminGuestChat(selectedGuestIdentifier, message);
        input.value = '';
        await loadGuestChatMessages();
        await loadGuestChatUsers();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
}

// Закрытие модальных окон по клику на фон
window.onclick = (event) => {
    const addCategoryModal = document.getElementById('addCategoryModal');
    const addProductModal = document.getElementById('addProductModal');
    const editProductModal = document.getElementById('editProductModal');
    const addBannerModal = document.getElementById('addBannerModal');
    
    if (event.target === addCategoryModal) {
        closeAddCategoryModal();
    }
    if (event.target === addProductModal) {
        closeAddProductModal();
    }
    if (event.target === editProductModal) {
        closeEditProductModal();
    }
    if (event.target === addBannerModal) {
        closeBannerModal();
    }
};

// Добавить товар
document.getElementById('addProductForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('productName').value;
    const description = document.getElementById('productDescription').value.trim();
    const supplierInfo = document.getElementById('productSupplierInfo').value.trim();
    const supplierUrl = document.getElementById('productSupplierUrl').value.trim();
    const availabilityStatus = document.getElementById('productAvailabilityStatus').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    const dropPrice = document.getElementById('productDropPrice').value.trim();
    const stock = document.getElementById('productStock').value.trim() ? parseInt(document.getElementById('productStock').value) : 0;
    const categoryId = parseInt(document.getElementById('productCategory').value);
    const imageFiles = selectedFiles;
    const mainImageIndex = parseInt(document.getElementById('mainImageIndex').value);

    if (!name || !description || !availabilityStatus || Number.isNaN(price) || Number.isNaN(categoryId)) {
        alert('Заповніть всі обов\'язкові поля');
        return;
    }

    try {
        await createProduct(name, price, categoryId, stock, imageFiles, mainImageIndex, description, supplierInfo, availabilityStatus, dropPrice, supplierUrl);
        alert('Товар додано!');
        closeAddProductModal();
        loadProducts();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
};

// Додати категорію
document.getElementById('addCategoryForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('categoryName').value;

    if (!name) {
        alert('Введіть назву категорії');
        return;
    }

    try {
        await createCategory(name);
        alert('Категорія додана!');
        closeAddCategoryModal();
        loadCategories();
    } catch (error) {
        alert('Помилка: ' + error.message);
    }
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('dashboard-section').classList.add('active');
    loadDashboard();
    initTextareaAutoResize();

    initAdminBottomPanelButtons();
    initCartModal();
    updateCartCount();

    // Обработчик поиска заказов
    const registeredOrdersSearch = document.getElementById('registeredOrdersSearch');
    if (registeredOrdersSearch) {
        registeredOrdersSearch.addEventListener('input', filterRegisteredOrders);
    }

    const guestOrdersSearch = document.getElementById('guestOrdersSearch');
    if (guestOrdersSearch) {
        guestOrdersSearch.addEventListener('input', filterGuestOrders);
    }

    const sectionToggleButtons = document.querySelectorAll('.section-toggle');
    sectionToggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            const content = document.getElementById(targetId);
            if (!content) return;
            const collapsed = content.classList.toggle('collapsed');
            button.textContent = collapsed ? 'Розгорнути' : 'Згорнути';
        });
    });

    const createBackupBtn = document.getElementById('createBackupBtn');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', createBackupAndRefresh);
    }

    const refreshBackupsBtn = document.getElementById('refreshBackupsBtn');
    if (refreshBackupsBtn) {
        refreshBackupsBtn.addEventListener('click', loadBackups);
    }

    const restoreUploadedBackupBtn = document.getElementById('restoreUploadedBackupBtn');
    if (restoreUploadedBackupBtn) {
        restoreUploadedBackupBtn.addEventListener('click', restoreBackupFromUploadedFile);
    }

    window.onclick = (event) => {
        const addCategoryModal = document.getElementById('addCategoryModal');
        const addProductModal = document.getElementById('addProductModal');
        const editProductModal = document.getElementById('editProductModal');
        const addBannerModal = document.getElementById('addBannerModal');

        if (event.target === addCategoryModal) {
            closeAddCategoryModal();
        }
        if (event.target === addProductModal) {
            closeAddProductModal();
        }
        if (event.target === editProductModal) {
            closeEditProductModal();
        }
        if (event.target === addBannerModal) {
            closeBannerModal();
        }
    };
});
