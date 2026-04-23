const profileForm = document.getElementById('profileForm');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const addressInput = document.getElementById('address');
const profileStatus = document.getElementById('profileStatus');

const ordersList = document.getElementById('ordersList');
const orderDetails = document.getElementById('orderDetails');

const homeBtn = document.getElementById('homeBtn');
const chatBtn = document.getElementById('chatBtn');
const cartBtn = document.getElementById('cartBtn');
const profileBtn = document.getElementById('profileBtn');
const logoutBtn = document.getElementById('logoutBtn');
const logoutBtnBottom = document.getElementById('logoutBtnBottom');
const catalogBtn = document.getElementById('catalogBtn');
const aboutBtn = document.getElementById('aboutBtn');
const contactBtn = document.getElementById('contactBtn');
const catalogDropdown = document.querySelector('.catalog-dropdown');
const catalogMenu = document.getElementById('catalogMenu');
const catalogMenuContent = document.getElementById('catalogMenuContent');

const cartModal = document.getElementById('cartModal');
const closeCartModalBtn = document.getElementById('closeCartModal');
const cartItemsContainer = document.getElementById('cartItems');
const cartSummary = document.getElementById('cartSummary');
const checkoutBtn = document.getElementById('checkoutBtn');
const chatModal = document.getElementById('chatModal');
const closeChatModalBtn = document.getElementById('closeChatModal');
const chatMessagesContainer = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

let isAdminUser = false;
let userOrders = [];
let selectedOrderId = null;
let highlightedOrderId = null;
let hasScrolledToHighlightedOrder = false;
let catalogCategories = [];
let catalogMenuCloseTimer = null;
let chatAttachmentController = null;

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

function consumeHighlightedOrderId() {
    const url = new URL(window.location.href);
    const rawValue = url.searchParams.get('highlightOrderId');
    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        return null;
    }

    url.searchParams.delete('highlightOrderId');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    return parsedValue;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function showCatalogMenu() {
    if (catalogMenu) {
        catalogMenu.classList.add('show');
    }
}

function hideCatalogMenu() {
    if (catalogMenu) {
        catalogMenu.classList.remove('show');
    }
}

function cancelCatalogMenuHide() {
    if (catalogMenuCloseTimer) {
        clearTimeout(catalogMenuCloseTimer);
        catalogMenuCloseTimer = null;
    }
}

function scheduleCatalogMenuHide(delay = 200) {
    cancelCatalogMenuHide();
    catalogMenuCloseTimer = setTimeout(() => {
        hideCatalogMenu();
        catalogMenuCloseTimer = null;
    }, delay);
}

function fillHeaderCatalogMenu() {
    if (!catalogMenuContent) {
        return;
    }

    const mainCategories = catalogCategories.filter(category => !category.parent_id);

    catalogMenuContent.innerHTML = mainCategories.map(mainCategory => {
        const subCategories = catalogCategories.filter(category => category.parent_id === mainCategory.id);

        return `
            <div class="catalog-menu-category">
                <div class="catalog-menu-main-item" data-id="${mainCategory.id}">
                    ${escapeHtml(mainCategory.name)}
                </div>
                ${subCategories.length ? `
                    <div class="catalog-menu-sub-items">
                        ${subCategories.map(subCategory => `
                            <div class="catalog-menu-sub-item" data-id="${subCategory.id}">${escapeHtml(subCategory.name)}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    catalogMenuContent.querySelectorAll('[data-id]').forEach(item => {
        item.addEventListener('click', event => {
            event.stopPropagation();
            window.location.href = `/?category=${encodeURIComponent(item.dataset.id)}`;
        });
    });
}

async function loadHeaderCatalog() {
    if (!catalogMenuContent) {
        return;
    }

    try {
        catalogCategories = await getCategories();
        fillHeaderCatalogMenu();
    } catch (error) {
        console.error('Не вдалося завантажити категорії для меню:', error);
    }
}

function initHeaderNavigation() {
    if (catalogBtn) {
        catalogBtn.addEventListener('click', event => {
            if (window.matchMedia('(max-width: 768px)').matches && catalogMenu) {
                event.preventDefault();
                event.stopPropagation();
                cancelCatalogMenuHide();
                catalogMenu.classList.toggle('show');
                return;
            }

            window.location.href = '/';
        });
    }

    if (aboutBtn) {
        aboutBtn.onclick = () => {
            window.location.href = '/about';
        };
    }

    if (contactBtn) {
        contactBtn.onclick = () => {
            window.location.href = '/contact';
        };
    }

    if (catalogDropdown && catalogMenu) {
        catalogDropdown.addEventListener('mouseenter', () => {
            cancelCatalogMenuHide();
            showCatalogMenu();
        });

        catalogDropdown.addEventListener('mouseleave', () => {
            scheduleCatalogMenuHide();
        });

        catalogMenu.addEventListener('mouseenter', () => {
            cancelCatalogMenuHide();
            showCatalogMenu();
        });

        catalogMenu.addEventListener('mouseleave', () => {
            scheduleCatalogMenuHide();
        });

        catalogMenu.addEventListener('click', event => {
            event.stopPropagation();
        });

        document.addEventListener('click', event => {
            if (!catalogDropdown.contains(event.target)) {
                hideCatalogMenu();
            }
        });
    }
}

function formatChatDate(dateStr) {
    if (!dateStr) return '';

    let date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
        date = new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`);
    }

    if (Number.isNaN(date.getTime())) {
        return dateStr;
    }

    return date.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Kyiv'
    });
}

function parseUtcDate(dateStr) {
    if (!dateStr) return null;

    let date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
        date = new Date(dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`);
    }

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function formatOrderDate(dateStr) {
    if (!dateStr) return 'Невідомо';

    const date = parseUtcDate(dateStr);
    if (!date) {
        return dateStr;
    }

    return date.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Kyiv'
    });
}

function formatOrderPrice(value) {
    if (value === null || value === undefined || value === '') {
        return '0 грн';
    }

    return `${Number(value).toLocaleString('uk-UA')} грн`;
}

function parseOrderItems(itemsData) {
    try {
        const parsed = typeof itemsData === 'string' ? JSON.parse(itemsData) : itemsData;
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function getOrderStatusMeta(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const statusMap = {
        pending: {
            key: 'awaiting-confirmation',
            label: 'Замовлення очікує підтвердження менеджером',
            description: 'Замовлення ще не підтверджене. Очікуйте на обробку менеджером.'
        },
        'замовлення очікує підтвердження менеджером': {
            key: 'awaiting-confirmation',
            label: 'Замовлення очікує підтвердження менеджером',
            description: 'Замовлення ще не підтверджене. Очікуйте на обробку менеджером.'
        },
        'замовлення очікує на передплату': {
            key: 'awaiting-confirmation',
            label: 'Замовлення очікує на передплату',
            description: 'Для подальшої обробки замовлення очікується передплата.'
        },
        confirmed: {
            key: 'accepted',
            label: 'Замовлення прийнято, очікуйте номер ТТН',
            description: 'Замовлення прийняте в роботу. Після відправлення зʼявиться номер ТТН.'
        },
        'замовлення прийнято, очікуйте номер ттн': {
            key: 'accepted',
            label: 'Замовлення прийнято, очікуйте номер ТТН',
            description: 'Замовлення прийняте в роботу. Після відправлення зʼявиться номер ТТН.'
        },
        'передплата підтверджена та замовлення прийнято. очікуйте номер ттн': {
            key: 'accepted',
            label: 'Передплата підтверджена та замовлення прийнято. Очікуйте номер ТТН',
            description: 'Передплату підтверджено, замовлення прийнято в роботу. Очікуйте номер ТТН.'
        },
        'оплата підтверджена та замовлення прийнято. очікуйте номер ттн': {
            key: 'accepted',
            label: 'Оплата підтверджена та замовлення прийнято. Очікуйте номер ТТН',
            description: 'Оплату підтверджено, замовлення прийнято в роботу. Очікуйте номер ТТН.'
        },
        shipped: {
            key: 'in-delivery',
            label: 'Замовлення у процесі доставки',
            description: 'Замовлення вже відправлене та зараз прямує до вас.'
        },
        'замовлення у процесі доставки': {
            key: 'in-delivery',
            label: 'Замовлення у процесі доставки',
            description: 'Замовлення вже відправлене та зараз прямує до вас.'
        },
        'замовлення у процессі доставки': {
            key: 'in-delivery',
            label: 'Замовлення у процесі доставки',
            description: 'Замовлення вже відправлене та зараз прямує до вас.'
        },
        'замовлення очікує вас на пошті!': {
            key: 'in-delivery',
            label: 'Замовлення очікує Вас на пошті!',
            description: 'Посилка вже прибула на пошту і очікує на отримання.'
        },
        delivered: {
            key: 'received',
            label: 'Отримано',
            description: 'Замовлення успішно отримане.'
        },
        'отримано': {
            key: 'received',
            label: 'Отримано',
            description: 'Замовлення успішно отримане.'
        },
        cancelled: {
            key: 'refused',
            label: 'Відмова',
            description: 'Замовлення не було отримане: відмова або незабір з пошти.'
        },
        'відмова': {
            key: 'refused',
            label: 'Відмова',
            description: 'Замовлення не було отримане: відмова або незабір з пошти.'
        }
    };

    return statusMap[normalizedStatus] || {
        key: 'awaiting-confirmation',
        label: status || 'Замовлення очікує підтвердження менеджером',
        description: 'Детальний трекінг етапів додамо на наступному кроці.'
    };
}

function formatDeliveryMethod(order) {
    if (order.delivery_method === 'postal') {
        return `Пошта, відділення ${order.postal_branch_number || '—'}`;
    }

    if (order.delivery_method === 'courier') {
        return 'Курʼєр';
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

function formatPaymentMethod(method) {
    if (method === 'cod') return 'Накладений платіж';
    if (method === 'card') return 'Оплата карткою';
    return method || 'Не вказано';
}

function getOrderDueAmount(order) {
    const total = Number(order.total_price || 0);
    const prepayment = order.prepayment_received ? Number(order.prepayment_amount || 0) : 0;
    return Math.max(total - prepayment, 0);
}

function buildProfileOrderReceipt(order) {
    const items = parseOrderItems(order.items_data);
    const orderNumber = escapeHtml(order.order_number || `Замовлення #${order.id}`);
    const deliveryText = escapeHtml(formatDeliveryMethod(order));
    const paymentText = escapeHtml(formatPaymentMethod(order.payment_method));
    const recipientPhone = escapeHtml(order.recipient_phone || 'Не вказано');
    const recipientName = escapeHtml(order.recipient_name || 'Не вказано');
    const recipientCity = escapeHtml(order.recipient_city || 'Не вказано');
    const trackingNumber = escapeHtml(order.tracking_number || '');
    const prepaymentAmount = order.prepayment_received ? Number(order.prepayment_amount || 0) : 0;
    const dueAmount = getOrderDueAmount(order);

    if (!items.length) {
        return '<div class="orders-empty">Не вдалося прочитати склад цього замовлення.</div>';
    }

    const itemsHtml = items.map(item => {
        const quantity = Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const lineTotal = quantity * price;
        const escapedName = escapeHtml(item.name || 'Товар');
        const productUrl = item.id ? `/product.html?id=${encodeURIComponent(item.id)}` : '#';
        const imageHtml = item.image
            ? `<a class="order-receipt-link" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener noreferrer"><img class="order-receipt-img" src="${escapeHtml(item.image)}" alt="${escapedName}"></a>`
            : '';

        return `
            <div class="order-receipt-item">
                ${imageHtml}
                <div class="order-receipt-item-content">
                    <div class="order-receipt-item-title"><a class="order-receipt-link" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener noreferrer">${escapedName}</a></div>
                    <div class="order-receipt-item-meta">${quantity} × ${formatOrderPrice(price)}</div>
                </div>
                <div class="order-receipt-item-price">${formatOrderPrice(lineTotal)}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="order-receipt">
            <div class="order-receipt-header">Чек замовлення № ${orderNumber}</div>
            <div class="order-receipt-meta">
                <div>Телефон: ${recipientPhone}</div>
                <div>Ім'я: ${recipientName}</div>
                <div>Місто: ${recipientCity}</div>
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
                    <strong>${formatOrderPrice(order.total_price)}</strong>
                </span>
                ${prepaymentAmount > 0 ? `
                    <span class="order-receipt-summary-row">
                        <span>Передплата:</span>
                        <strong>${formatOrderPrice(prepaymentAmount)}</strong>
                    </span>
                ` : ''}
                <span class="order-receipt-summary-row">
                    <span>До сплати:</span>
                    <strong>${formatOrderPrice(dueAmount)}</strong>
                </span>
            </div>
        </div>
    `;
}

function renderOrdersList() {
    if (!ordersList) return;

    if (!userOrders.length) {
        ordersList.innerHTML = '<div class="orders-empty">У вас ще немає оформлених замовлень.</div>';
        return;
    }

    ordersList.innerHTML = userOrders.map(order => {
        const statusMeta = getOrderStatusMeta(order.status);
        const isActive = order.id === selectedOrderId;
        const isHighlighted = order.id === highlightedOrderId;
        const items = parseOrderItems(order.items_data);
        const itemsCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

        return `
            <button type="button" class="order-list-item ${isActive ? 'is-active' : ''} ${isHighlighted ? 'is-highlighted' : ''}" data-order-id="${order.id}">
                <div class="order-list-top">
                    <strong>${escapeHtml(order.order_number || `Замовлення #${order.id}`)}</strong>
                    <span class="order-status-badge ${escapeHtml(statusMeta.key)}">${escapeHtml(statusMeta.label)}</span>
                </div>
                <div class="order-list-meta">
                    <span>${formatOrderDate(order.created_at)}</span>
                    <span>${itemsCount} товар${itemsCount === 1 ? '' : itemsCount >= 2 && itemsCount <= 4 ? 'и' : 'ів'}</span>
                </div>
                <div class="order-list-meta">
                    <span>${escapeHtml(order.recipient_city || 'Місто не вказано')}</span>
                    <strong>${formatOrderPrice(order.total_price)}</strong>
                </div>
            </button>
        `;
    }).join('');

    ordersList.querySelectorAll('[data-order-id]').forEach(button => {
        button.addEventListener('click', () => {
            const orderId = Number(button.getAttribute('data-order-id'));
            selectOrder(orderId);
        });
    });

    if (highlightedOrderId && !hasScrolledToHighlightedOrder) {
        const highlightedButton = ordersList.querySelector(`[data-order-id="${highlightedOrderId}"]`);
        if (highlightedButton) {
            hasScrolledToHighlightedOrder = true;
            highlightedButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function renderOrderDetails(order) {
    if (!orderDetails) return;

    if (!order) {
        orderDetails.innerHTML = 'Оберіть замовлення зі списку, щоб переглянути його товари, доставку, оплату та поточний статус.';
        orderDetails.className = 'order-placeholder';
        return;
    }

    const statusMeta = getOrderStatusMeta(order.status);
    const trackingNumberBlock = order.tracking_number
        ? `<div style="margin-top:0.55rem; font-weight:700; color:#111;">ТТН: ${escapeHtml(order.tracking_number)}</div>`
        : '';
    orderDetails.className = 'order-detail-card';
    orderDetails.innerHTML = `
        <div class="order-detail-head">
            <div>
                <h3>${escapeHtml(order.order_number || `Замовлення #${order.id}`)}</h3>
                <p class="order-detail-subtitle">Створено ${formatOrderDate(order.created_at)}</p>
            </div>
            <div>
                <span class="order-status-badge ${escapeHtml(statusMeta.key)}">${escapeHtml(statusMeta.label)}</span>
                ${trackingNumberBlock}
            </div>
        </div>

        <div class="order-items-box">
            ${buildProfileOrderReceipt(order)}
        </div>

        <div class="order-status-note">
            <strong>Поточний статус:</strong> ${escapeHtml(statusMeta.description)}
        </div>
    `;
}

function selectOrder(orderId) {
    selectedOrderId = orderId;
    const order = userOrders.find(item => item.id === orderId) || null;
    renderOrdersList();
    renderOrderDetails(order);
}

async function loadOrders() {
    if (!ordersList || !orderDetails) return;

    try {
        const orders = await getUserOrders();
        userOrders = Array.isArray(orders) ? orders : [];

        if (!userOrders.length) {
            selectedOrderId = null;
            renderOrdersList();
            renderOrderDetails(null);
            return;
        }

        const highlightedOrder = highlightedOrderId
            ? userOrders.find(order => order.id === highlightedOrderId)
            : null;

        if (highlightedOrder) {
            selectedOrderId = highlightedOrder.id;
            renderOrdersList();
            renderOrderDetails(highlightedOrder);
            return;
        }

        highlightedOrderId = null;
        selectedOrderId = userOrders[0].id;
        renderOrdersList();
        renderOrderDetails(userOrders[0]);
    } catch (error) {
        console.error('Помилка завантаження замовлень:', error);
        ordersList.innerHTML = '<div class="orders-empty">Не вдалося завантажити список замовлень.</div>';
        orderDetails.className = 'order-placeholder';
        orderDetails.textContent = 'Спробуйте оновити сторінку трохи пізніше.';
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

function saveCart(cart) {
    if (!cart.length) {
        localStorage.removeItem('cart');
        return;
    }

    localStorage.setItem('cart', JSON.stringify(cart));
}

function getCartItemCount() {
    return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartCount() {
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        cartCount.textContent = String(getCartItemCount());
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
    const item = cart.find(entry => entry.id === productId);
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
    const checkoutTotal = document.getElementById('checkoutTotal');
    const checkoutText = document.getElementById('checkoutText');

    if (!cart.length) {
        cartItemsContainer.innerHTML = '<p>Кошик порожній.</p>';
        cartSummary.textContent = '';
        if (checkoutTotal) checkoutTotal.textContent = 'ГРН. 0.00';
        if (checkoutText) checkoutText.textContent = 'ОФОРМИТИ';
        return;
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const formattedTotal = `ГРН. ${total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

    cartItemsContainer.innerHTML = cart.map(item => `
        <div class="cart-item">
            ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" onclick="window.location.href='product.html?id=${item.id}'">` : ''}
            <div class="cart-item-info">
                <strong onclick="window.open('product.html?id=${item.id}', '_blank')" style="cursor: pointer;">${escapeHtml(item.name)}</strong>
                <div class="cart-item-meta">
                    <span class="cart-item-quantity">Кількість ${item.quantity}</span>
                    <span class="cart-item-price">${item.price} грн</span>
                </div>
            </div>
            <div class="cart-item-actions">
                <div class="count-controls">
                    <button onclick="changeCartQuantity(${item.id}, -1)">-</button>
                    <span class="cart-quantity">${item.quantity}</span>
                    <button onclick="changeCartQuantity(${item.id}, 1)">+</button>
                </div>
                <button class="remove-button" onclick="removeFromCart(${item.id})">x</button>
            </div>
        </div>
    `).join('');

    cartSummary.textContent = '';
    if (checkoutTotal) checkoutTotal.textContent = formattedTotal;
    if (checkoutText) checkoutText.textContent = 'ОФОРМИТИ';
}

function openCart() {
    renderCart();
    cartModal.style.display = 'block';
}

function renderProfileChatMessages(messages) {
    if (!chatMessagesContainer) {
        return;
    }

    chatMessagesContainer.innerHTML = (Array.isArray(messages) ? messages : []).map(msg => {
        const cssClass = msg.sender === 'admin' ? 'chat-admin' : 'chat-user';
        const content = buildChatMessageContent(msg);

        return `
            <div class="chat-message ${cssClass}" style="margin-bottom:0.6rem;">
                <strong>${msg.sender === 'admin' ? 'Менеджер' : 'Ви'}:</strong> ${content.html}
                <div style="font-size:0.75rem; color:#888; margin-top:0.2rem;">${formatChatDate(msg.created_at)}</div>
            </div>
        `;
    }).join('');

    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

async function loadProfileChatMessages() {
    const messages = await getUserChat();
    renderProfileChatMessages(messages);
}

async function openProfileChatModal() {
    if (chatModal) {
        chatModal.style.display = 'block';
    }
    await loadProfileChatMessages();
}

function closeProfileChatModal() {
    if (chatModal) {
        chatModal.style.display = 'none';
    }
}

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
        alert('Для доступу до профілю необхідно увійти.');
        window.location.href = '/';
    }
}

homeBtn.onclick = () => {
    window.location.href = '/';
};

chatBtn.onclick = async () => {
    try {
        if (isAdminUser) {
            window.location.href = '/chat';
            return;
        }

        await openProfileChatModal();
    } catch (error) {
        console.error('Не вдалося відкрити чат:', error);
        alert('Не вдалося завантажити чат. Спробуйте пізніше.');
    }
};

cartBtn.onclick = openCart;

profileBtn.onclick = () => {
    window.location.href = 'profile.html';
};

if (logoutBtn) {
    logoutBtn.onclick = () => {
        logoutUser();
        window.location.href = '/';
    };
}

logoutBtnBottom.onclick = () => {
    logoutUser();
    window.location.href = '/';
};

closeCartModalBtn.onclick = () => {
    cartModal.style.display = 'none';
};

if (closeChatModalBtn) {
    closeChatModalBtn.onclick = () => {
        closeProfileChatModal();
    };
}

checkoutBtn.onclick = () => {
    window.location.href = 'checkout.html';
};

if (sendChatBtn) {
    sendChatBtn.onclick = async () => {
        const message = chatInput ? chatInput.value.trim() : '';
        const imageFile = chatAttachmentController ? chatAttachmentController.getSelectedFile() : null;

        if (!message && !imageFile) {
            return;
        }

        sendChatBtn.disabled = true;

        try {
            await postUserChat(message, imageFile);
            chatInputAutoGrow?.reset();
            if (chatAttachmentController) {
                chatAttachmentController.clear();
            }
            await loadProfileChatMessages();
        } catch (error) {
            console.error('Не вдалося надіслати повідомлення:', error);
            alert('Не вдалося надіслати повідомлення. Спробуйте пізніше.');
        } finally {
            sendChatBtn.disabled = false;
        }
    };
}

profileForm.onsubmit = async event => {
    event.preventDefault();

    try {
        await updateUserProfile({
            full_name: fullNameInput.value.trim(),
            phone: phoneInput.value.trim(),
            address: addressInput.value.trim()
        });
        profileStatus.textContent = 'Дані збережено успішно.';
        profileStatus.style.color = 'green';
    } catch (error) {
        console.error('Помилка при збереженні даних профілю:', error);
        profileStatus.textContent = 'Помилка при збереженні. Спробуйте ще раз.';
        profileStatus.style.color = 'red';
    }
};

window.changeCartQuantity = changeCartQuantity;
window.removeFromCart = removeFromCart;

window.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('auth_token')) {
        alert('Для доступу до профілю необхідно увійти.');
        window.location.href = '/';
        return;
    }

    highlightedOrderId = consumeHighlightedOrderId();

    try {
        const user = await getCurrentUser();
        isAdminUser = Boolean(user && user.is_admin);
    } catch (error) {
        console.error('Не вдалося отримати дані користувача:', error);
    }

    initHeaderNavigation();
    updateCartCount();
    if (typeof initChatAttachmentUI === 'function') {
        chatAttachmentController = initChatAttachmentUI();
    }
    await loadHeaderCatalog();
    await loadProfile();
    await loadOrders();
});

window.addEventListener('click', event => {
    if (event.target === cartModal && cartModal) {
        cartModal.style.display = 'none';
    }

    if (event.target === chatModal && chatModal) {
        closeProfileChatModal();
    }
});

if (chatInput) {
    chatInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (sendChatBtn) {
                sendChatBtn.click();
            }
        }
    });
}
