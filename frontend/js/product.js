// product.js - Логика страницы товара - Cart clearing fix v3.0
console.log('🛒 product.js loaded - cart clearing on order confirmation active');

let currentProduct = null;
let currentReviews = [];
let currentImageIndex = 0;
let isAdminUser = false;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productIdStr = urlParams.get('id');
    const productId = parseInt(productIdStr);

    if (!productIdStr || isNaN(productId) || productId <= 0) {
        alert('Неправильний ID товару');
        window.location.href = 'index.html';
        return;
    }

    // Инициализация
    if (authToken) {
        try {
            const profile = await getCurrentUser();
            isAdminUser = profile.is_admin;
            updateAuthUI(profile.is_admin);
        } catch (error) {
            logoutUser();
            updateAuthUI(false);
        }
    } else {
        updateAuthUI(false);
    }
    updateCartCount();

    // Загрузка товара и отзывов
    await loadProduct(productId);
    await loadReviews(productId);

    // Обработчики
    setupEventListeners();
});

async function loadProduct(productId) {
    console.log('Loading product with ID:', productId);
    try {
        const headers = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`/api/products/${productId}`, {
            headers
        });
        console.log('Response status:', response.status);
        if (!response.ok) throw new Error(`Товар з ID ${productId} не знайдено`);

        currentProduct = await response.json();
        console.log('Product loaded:', currentProduct);
        displayProduct(currentProduct);
    } catch (error) {
        console.error('Помилка завантаження товару:', error);
        alert(error.message || 'Помилка завантаження товару');
        window.location.href = 'index.html';
    }
}

async function loadReviews(productId) {
    try {
        const response = await fetch(`/api/products/${productId}/reviews`);
        currentReviews = await response.json();
        displayReviews(currentReviews);
    } catch (error) {
        console.error('Помилка завантаження відгуків:', error);
    }
}

function displayProduct(product) {
    document.getElementById('productName').textContent = product.name;
    document.getElementById('productPrice').textContent = `${product.price} грн.`;
    if (isAdminUser && product.drop_price) {
        document.getElementById('productPrice').textContent += ` (Дроп ціна: ${product.drop_price} грн.)`;
    }
    document.getElementById('productStock').textContent = `У наявності: ${product.stock}`;
    document.getElementById('productStatus').textContent = `Статус: ${product.availability_status}`;
    document.getElementById('productCategory').textContent = `Категорія: ${product.category}`;

    // Показать ID товара для админов
    const productIdElement = document.getElementById('productId');
    if (isAdminUser) {
        productIdElement.textContent = `ID товару: ${product.id}`;
        productIdElement.style.display = 'block';
    } else {
        productIdElement.style.display = 'none';
    }

    // Показать информацию о поставщике для админов
    const supplierInfoElement = document.getElementById('productSupplierInfo');
    if (isAdminUser && product.supplier_info) {
        supplierInfoElement.innerHTML = `<h3>Інформація про постачальника</h3><p>${product.supplier_info}</p>`;
        supplierInfoElement.style.display = 'block';
    } else {
        supplierInfoElement.style.display = 'none';
    }

    const descElement = document.getElementById('productDescription');
    descElement.innerHTML = `<h3>Опис</h3><p>${product.description || 'Опис відсутній'}</p>`;

    // Галерея изображений
    if (product.images && product.images.length > 0) {
        currentImageIndex = 0;
        const mainImage = product.images[currentImageIndex];
        document.getElementById('mainImage').src = mainImage.url;

        const thumbnailGallery = document.getElementById('thumbnailGallery');
        thumbnailGallery.innerHTML = product.images.map((img, index) => `
            <img src="${img.url}" alt="Миниатюра" class="thumbnail ${index === currentImageIndex ? 'active' : ''}" onclick="changeMainImage(${index})">
        `).join('');

        // Показать/скрыть кнопки навигации на странице товара
        const prevBtn = document.getElementById('prevImageBtn');
        const nextBtn = document.getElementById('nextImageBtn');
        if (product.images.length > 1) {
            prevBtn.style.display = 'flex';
            nextBtn.style.display = 'flex';
        } else {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
        }

        // Показать/скрыть кнопки навигации в полноэкранном режиме
        if (product.images.length > 1) {
            prevImageFullBtn.style.display = 'flex';
            nextImageFullBtn.style.display = 'flex';
        } else {
            prevImageFullBtn.style.display = 'none';
            nextImageFullBtn.style.display = 'none';
        }
    } else {
        document.getElementById('mainImage').src = '';
        document.getElementById('thumbnailGallery').innerHTML = '<p>Изображения отсутствуют</p>';
        document.getElementById('prevImageBtn').style.display = 'none';
        document.getElementById('nextImageBtn').style.display = 'none';
        prevImageFullBtn.style.display = 'none';
        nextImageFullBtn.style.display = 'none';
    }
}

function displayReviews(reviews) {
    const container = document.getElementById('reviewsList');

    if (reviews.length === 0) {
        container.innerHTML = '<p>Відгуків поки що немає. Будь першим!</p>';
        return;
    }

    container.innerHTML = reviews.map(review => `
        <div class="review">
            <div class="review-header">
                <strong>${review.user}</strong>
                <div class="rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
                <small>${new Date(review.created_at).toLocaleDateString('ru-RU')}</small>
            </div>
            <p>${review.comment || 'Без комментария'}</p>
        </div>
    `).join('');
}

function changeMainImage(index) {
    if (!currentProduct || !currentProduct.images || index < 0 || index >= currentProduct.images.length) return;

    currentImageIndex = index;
    document.getElementById('mainImage').src = currentProduct.images[index].url;

    // Обновить активную миниатюру
    document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index);
    });
}

function nextImage() {
    if (!currentProduct || !currentProduct.images) return;
    const nextIndex = (currentImageIndex + 1) % currentProduct.images.length;
    changeMainImage(nextIndex);
}

function prevImage() {
    if (!currentProduct || !currentProduct.images) return;
    const prevIndex = (currentImageIndex - 1 + currentProduct.images.length) % currentProduct.images.length;
    changeMainImage(prevIndex);
}

function setupEventListeners() {
    // Кнопка назад
    document.getElementById('backBtn').addEventListener('click', () => {
        // Зберегти стан для повернення
        const state = {
            search: localStorage.getItem('productSearch') || '',
            sort: localStorage.getItem('productSort') || 'name',
            category: localStorage.getItem('currentCategory') || '',
            scrollToProduct: currentProduct.id
        };
        const params = new URLSearchParams(state);
        window.location.href = `index.html?${params.toString()}`;
    });

    // Кнопка добавления в корзину
    document.getElementById('addToCartBtn').addEventListener('click', () => {
        if (currentProduct) {
            const added = addToCartById(currentProduct.id);
            if (added) {
                updateCartCount();
                alert('Товар додано до кошика!');
            }
        }
    });

    // Кнопки навигации изображений
    document.getElementById('prevImageBtn').addEventListener('click', prevImage);
    document.getElementById('nextImageBtn').addEventListener('click', nextImage);

    // Форма отзыва
    document.getElementById('showReviewFormBtn').addEventListener('click', () => {
        if (!authToken) {
            alert('Войдите в аккаунт, чтобы оставить отзыв');
            return;
        }
        document.getElementById('addReviewForm').style.display = 'block';
        document.getElementById('showReviewFormBtn').style.display = 'none';
    });

    document.getElementById('submitReviewBtn').addEventListener('click', async () => {
        const rating = parseInt(document.getElementById('reviewRating').value);
        const comment = document.getElementById('reviewComment').value.trim();

        try {
            const response = await fetch(`/api/products/${currentProduct.id}/reviews`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ rating, comment })
            });

            if (response.ok) {
                alert('Отзыв добавлен!');
                document.getElementById('reviewComment').value = '';
                document.getElementById('addReviewForm').style.display = 'none';
                document.getElementById('showReviewFormBtn').style.display = 'block';
                await loadReviews(currentProduct.id);
            } else {
                const error = await response.json();
                alert(error.error || 'Помилка додавання відгуку');
            }
        } catch (error) {
            console.error('Помилка:', error);
            alert('Помилка додавання відгуку');
        }
    });

    // Навигация
    document.getElementById('homeBtn').addEventListener('click', () => window.location.href = 'index.html');
    document.getElementById('chatBtn').addEventListener('click', () => {
        if (!authToken) {
            openLoginModal();
            return;
        }
        openChatModal();
    });
    document.getElementById('cartBtn').addEventListener('click', () => openCartModal());
    document.getElementById('profileBtn').addEventListener('click', () => window.location.href = 'profile.html');
    document.getElementById('loginBtn').addEventListener('click', () => openLoginModal());
    document.getElementById('registerBtn').addEventListener('click', () => openRegisterModal());
    document.getElementById('logoutBtn').addEventListener('click', logoutUser);

    // Модальные кнопки (закрытие)
    const closeCartModalBtn = document.getElementById('closeCartModal');
    const closeChatModalBtn = document.getElementById('closeChatModal');
    const closeLoginModalBtn = document.getElementById('closeLoginModal');
    const closeRegisterModalBtn = document.getElementById('closeRegisterModal');

    if (closeCartModalBtn) closeCartModalBtn.addEventListener('click', () => document.getElementById('cartModal').style.display = 'none');
    if (closeChatModalBtn) closeChatModalBtn.addEventListener('click', () => document.getElementById('chatModal').style.display = 'none');
    if (closeLoginModalBtn) closeLoginModalBtn.addEventListener('click', () => document.getElementById('loginModal').style.display = 'none');
    if (closeRegisterModalBtn) closeRegisterModalBtn.addEventListener('click', () => document.getElementById('registerModal').style.display = 'none');

    // Полноэкранный просмотр фото
    const mainImage = document.getElementById('mainImage');
    const imageModal = document.getElementById('imageModal');
    const fullscreenImage = document.getElementById('fullscreenImage');
    const prevImageFullBtn = document.getElementById('prevImageFullBtn');
    const nextImageFullBtn = document.getElementById('nextImageFullBtn');
    let isImageZoomed = false;
    let isMouseDown = false;
    let offsetX = 0;
    let offsetY = 0;
    let lastX = 0;
    let lastY = 0;
    let isMoving = false;
    let fullscreenImageIndex = 0; // Текущий индекс фото в полноэкранном режиме
    const MOVE_THRESHOLD = 5; // Минимальное расстояние для считания движением

    function resetImageZoom() {
        isImageZoomed = false;
        isMouseDown = false;
        offsetX = 0;
        offsetY = 0;
        isMoving = false;
        fullscreenImage.style.transform = 'scale(1)';
        fullscreenImage.style.cursor = 'pointer';
    }

    function closeImageModal() {
        imageModal.classList.remove('show');
        resetImageZoom();
        // Показать нижнюю панель при закрытии полноэкранного просмотра
        const bottomPanel = document.getElementById('bottomPanel');
        if (bottomPanel) {
            bottomPanel.style.display = '';
        }
    }

    console.log('Image modal elements loaded:', { mainImage, imageModal, fullscreenImage });

    // Открытие полноэкранного просмотра
    mainImage.addEventListener('click', () => {
        console.log('Main image clicked, opening fullscreen');
        imageModal.classList.add('show');
        fullscreenImage.src = mainImage.src;
        fullscreenImageIndex = currentImageIndex; // Устанавливаем индекс текущего фото
        resetImageZoom();
        // Скрыть нижнюю панель при открытии полноэкранного просмотра
        const bottomPanel = document.getElementById('bottomPanel');
        if (bottomPanel) {
            bottomPanel.style.display = 'none';
        }
    });

    // Функции для переключения фото в полноэкранном режиме
    function showFullscreenImage(index) {
        if (!currentProduct || !currentProduct.images || currentProduct.images.length === 0) return;
        
        fullscreenImageIndex = index;
        fullscreenImage.src = currentProduct.images[index].url;
        resetImageZoom();
    }

    function nextFullscreenImage() {
        if (!currentProduct || !currentProduct.images) return;
        const nextIndex = (fullscreenImageIndex + 1) % currentProduct.images.length;
        showFullscreenImage(nextIndex);
    }

    function prevFullscreenImage() {
        if (!currentProduct || !currentProduct.images) return;
        const prevIndex = (fullscreenImageIndex - 1 + currentProduct.images.length) % currentProduct.images.length;
        showFullscreenImage(prevIndex);
    }

    // Обработчики для кнопок навигации в полноэкранном режиме
    prevImageFullBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Не закрывать модальное окно при клике на кнопку
        prevFullscreenImage();
    });

    nextImageFullBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Не закрывать модальное окно при клике на кнопку
        nextFullscreenImage();
    });

    // Начало взаимодействия при нажатии ЛКМ на фото
    fullscreenImage.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        lastX = e.clientX;
        lastY = e.clientY;
        isMoving = false;
        e.preventDefault();
    });

    // Перемещение фото при движении мыши с зажатой ЛКМ
    document.addEventListener('mousemove', (e) => {
        if (isImageZoomed && isMouseDown) {
            const dx = Math.abs(e.clientX - lastX);
            const dy = Math.abs(e.clientY - lastY);

            // Если движение превышает threshold, это перемещение
            if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
                isMoving = true;
                offsetX += e.clientX - lastX;
                offsetY += e.clientY - lastY;

                // Ограничить смещение в разумных пределах
                const maxOffset = 250;
                offsetX = Math.max(-maxOffset, Math.min(maxOffset, offsetX));
                offsetY = Math.max(-maxOffset, Math.min(maxOffset, offsetY));

                fullscreenImage.style.transform = `scale(2) translate(${offsetX / 2}px, ${offsetY / 2}px)`;
                fullscreenImage.style.cursor = 'grabbing';
            }

            lastX = e.clientX;
            lastY = e.clientY;
        }
    });

    // Конец взаимодействия при отпускании ЛКМ
    document.addEventListener('mouseup', () => {
        if (isMouseDown) {
            isMouseDown = false;

            // Если это был клик (без движения), то toggle зума
            if (!isMoving) {
                if (isImageZoomed) {
                    // Выключить зум при клике
                    resetImageZoom();
                } else {
                    // Включить зум при клике
                    isImageZoomed = true;
                    offsetX = 0;
                    offsetY = 0;
                    fullscreenImage.style.transform = 'scale(2)';
                    fullscreenImage.style.cursor = 'grab';
                }
            } else {
                // Это было перемещение, просто сбросить курсор
                if (isImageZoomed) {
                    fullscreenImage.style.cursor = 'grab';
                }
            }

            isMoving = false;
        }
    });

    // При выходе мыши из области фото
    fullscreenImage.addEventListener('mouseleave', () => {
        if (isMouseDown) {
            isMouseDown = false;
            isMoving = false;
            if (isImageZoomed) {
                fullscreenImage.style.cursor = 'grab';
            }
        }
    });

    // Закрытие полноэкранного просмотра
    imageModal.addEventListener('click', (e) => {
        // Закрыть если клик был не на самом изображении
        if (!fullscreenImage.contains(e.target)) {
            closeImageModal();
        }
    });

    // Обработчики модальных окон
    window.addEventListener('click', (e) => {
        const cartModal = document.getElementById('cartModal');
        const chatModal = document.getElementById('chatModal');

        if (e.target === cartModal) cartModal.style.display = 'none';
        if (e.target === chatModal) chatModal.style.display = 'none';
    });
}

// Функции из script.js (копируем необходимые)
function updateAuthUI(isAdmin) {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const profileBtn = document.getElementById('profileBtn');
    const chatBtn = document.getElementById('chatBtn');

    if (authToken) {
        loginBtn.style.display = 'none';
        registerBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
        profileBtn.style.display = 'inline-flex';
        if (chatBtn) chatBtn.style.display = 'inline-flex';
    } else {
        loginBtn.style.display = 'inline-flex';
        registerBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
        profileBtn.style.display = 'none';
        if (chatBtn) chatBtn.style.display = 'none';
    }
}

function logoutUser() {
    localStorage.removeItem('authToken');
    authToken = null;
    updateAuthUI(false);
    window.location.href = 'index.html';
}

function updateCartCount() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = count;
}

function getCart() {
    return JSON.parse(localStorage.getItem('cart') || '[]');
}

function addToCartById(productId) {
    const cart = getCart();
    const existing = cart.find(item => item.id === productId);

    if (currentProduct.availability_status === 'Немає в наявності') {
        alert('Товар наразі відсутній у наявності. Додавання у кошик тимчасово невожливе.');
        return false;
    }

    const desired = existing ? existing.quantity + 1 : 1;
    if (currentProduct.stock !== null && currentProduct.stock !== undefined && desired > currentProduct.stock) {
        alert('Недостаточно товара на складе');
        return false;
    }

    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            id: currentProduct.id,
            name: currentProduct.name,
            price: currentProduct.price,
            quantity: 1,
            stock: currentProduct.stock,
            image: currentProduct.images && currentProduct.images.length > 0 ? currentProduct.images[0].url : null
        });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    return true;
}

function openCartModal() {
    renderCart();
    const cartModal = document.getElementById('cartModal');
    if (cartModal) cartModal.style.display = 'block';
}

function openChatModal() {
    if (isAdminUser) {
        window.location.href = '/chat';
    } else {
        const chatModal = document.getElementById('chatModal');
        if (chatModal) {
            chatModal.style.display = 'block';
            loadChatMessages();
        }
    }
}

function renderCart() {
    const cart = getCart();
    const cartItemsContainer = document.getElementById('cartItems');
    const cartSummary = document.getElementById('cartSummary');

    if (!cartItemsContainer || !cartSummary) return;

    if (!cart.length) {
        cartItemsContainer.innerHTML = '<p>Кошик порожній.</p>';
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
                <button onclick="removeFromCart(${item.id})">Видалити</button>
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
        alert('Превышено количество на складе');
        return;
    }

    item.quantity = nextQuantity;
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    renderCart();
}

function removeFromCart(productId) {
    const cart = getCart().filter(item => item.id !== productId);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    renderCart();
}

const checkoutBtn = document.getElementById('checkoutBtn');
const orderConfirmModal = document.getElementById('orderConfirmModal');
const confirmOrderBtn = document.getElementById('confirmOrderBtn');
const cancelOrderBtn = document.getElementById('cancelOrderBtn');
const closeOrderConfirmModalBtn = document.getElementById('closeOrderConfirmModal');

let pendingOrderHtml = null;
let pendingOrderCart = null;
let orderPreviewElement = null;

function buildOrderMessage(cart) {
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const itemsHtml = cart.map(item => {
        const productUrl = `/product.html?id=${item.id}`;
        return `
            <div class="order-receipt-item">
                ${item.image ? `<a class="order-receipt-link" href="${productUrl}"><img class="order-receipt-img" src="${item.image}" alt="${item.name}"></a>` : ''}
                <div class="order-receipt-item-content">
                    <div class="order-receipt-item-title"><a class="order-receipt-link" href="${productUrl}">${item.name}</a></div>
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
                <span>Загальна сума</span>
                <strong>${total} грн</strong>
            </div>
        </div>`;
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
        console.log('Confirm button clicked (product page) - clearing cart');
        // Сохраняем тележку перед закрытием модального окна
        const cartToSend = pendingOrderCart;
        hideOrderConfirmModal();
        
        if (cartToSend && cartToSend.length > 0) {
            // Очищаємо кошик ПРИ ПОДТВЕРЖДЕНИИ ЗАКАЗА
            console.log('🛒 Clearing cart on order confirmation (product page)...');
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
            const cartSummaryEl = document.getElementById('cartSummary');
            if (cartSummaryEl) {
                cartSummaryEl.textContent = '';
            }
            console.log('🛒 Cart cleared on order confirmation (product page)');
            
            console.log('Opening chat with order (product)...', cartToSend);
            await openChatWithOrder(cartToSend);
        } else {
            console.warn('No pending order cart');
            alert('Помилка: кошик порожній');
        }
    };
} else {
    console.warn('confirmOrderBtn not found on product page');
}

if (cancelOrderBtn) {
    cancelOrderBtn.onclick = hideOrderConfirmModal;
}

if (closeOrderConfirmModalBtn) {
    closeOrderConfirmModalBtn.onclick = hideOrderConfirmModal;
}

async function openChatWithOrder(cart) {
    if (!cart.length) {
        alert('Кошик порожній. Додайте товари.');
        return;
    }

    const isLogged = !!localStorage.getItem('auth_token');
    const loginModal = document.getElementById('loginModal');

    if (!isLogged) {
        alert('Для відправки замовлення в чат потрібно увійти.');
        if (loginModal) loginModal.style.display = 'block';
        return;
    }

    const cartModal = document.getElementById('cartModal');
    const chatModal = document.getElementById('chatModal');
    const chatInput = document.getElementById('chatInput');
    const chatMessagesContainer = document.getElementById('chatMessages');

    try {
        // Будуємо HTML чека
        pendingOrderHtml = buildOrderMessage(cart);
        console.log('🛒 pendingOrderHtml set, length:', pendingOrderHtml.length);
        console.log('🛒 pendingOrderHtml includes order-receipt:', pendingOrderHtml.includes('order-receipt'));
        
        // Закриваємо кошик і відкриваємо чат модал
        if (cartModal) cartModal.style.display = 'none';
        const chatModal = document.getElementById('chatModal');
        if (chatModal) {
            chatModal.style.display = 'block';
            loadChatMessages();
        }
        console.log('Chat modal opened (product page)');
        
        // Чистимо поле введення
        if (chatInput) {
            chatInput.value = '';
        }
        
        // Додаємо прев'u0457 замовлення з затримкою для надійності
        setTimeout(() => {
            console.log('Rendering order preview (product page)');
            if (pendingOrderHtml && chatMessagesContainer) {
                orderPreviewElement = document.createElement('div');
                orderPreviewElement.className = 'chat-message chat-user order-preview';
                orderPreviewElement.innerHTML = pendingOrderHtml;
                chatMessagesContainer.appendChild(orderPreviewElement);
                
                try {
                    orderPreviewElement.scrollIntoView({ block: 'end', behavior: 'smooth' });
                } catch (e) {
                    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
                }
            }
            if (chatInput) {
                chatInput.focus();
            }
        }, 100);
        
    } catch (error) {
        console.error('Помилка при відкритті чату для замовлення:', error);
        alert('Помилка при відкритті чату.');
    }
}

if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
        const cart = getCart();
        showOrderConfirmModal(cart);
    });
}

window.addEventListener('click', (e) => {
    const cartModal = document.getElementById('cartModal');
    const chatModal = document.getElementById('chatModal');
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');

    if (e.target === cartModal) cartModal.style.display = 'none';
    if (e.target === chatModal) chatModal.style.display = 'none';
    if (e.target === loginModal) loginModal.style.display = 'none';
    if (e.target === registerModal) registerModal.style.display = 'none';
    if (e.target === orderConfirmModal) hideOrderConfirmModal();
});

function openLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.style.display = 'block';
}

function openRegisterModal() {
    const registerModal = document.getElementById('registerModal');
    if (registerModal) registerModal.style.display = 'block';
}

// Обработчик отправки сообщений в чат
const sendChatBtn = document.getElementById('sendChatBtn');
const chatInput = document.getElementById('chatInput');

function saveCart(cart) {
    if (cart.length === 0) {
        // Явно удаляем ключ из localStorage при очистке корзины
        localStorage.removeItem('cart');
        console.log('Cart key removed from localStorage');
    } else {
        localStorage.setItem('cart', JSON.stringify(cart));
    }
}

if (sendChatBtn) {
    sendChatBtn.onclick = async () => {
        console.log('🛒 sendChatBtn clicked - starting execution');
        const text = chatInput.value.trim();
        if (!text && !pendingOrderHtml) return;

        try {
            const messageToSend = pendingOrderHtml ? pendingOrderHtml : text;
            console.log('🛒 sendChatBtn clicked, pendingOrderHtml:', !!pendingOrderHtml);
            console.log('🛒 messageToSend includes order-receipt:', messageToSend.includes('order-receipt'));
            
            await postUserChat(messageToSend);
            chatInput.value = '';
            
            if (pendingOrderHtml && messageToSend.includes('order-receipt')) {
                console.log('🛒 Order sent successfully');
                pendingOrderHtml = null;
            }
            
            await loadChatMessages();
        } catch (error) {
            console.error('Помилка при надсиланні повідомлення чату:', error);
            alert('Не вдалося надіслати повідомлення. Спробуйте пізніше.');
        }
    };
}

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
    const chatMessagesContainer = document.getElementById('chatMessages');
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
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.onclick = (e) => {
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
        console.log('Loading chat messages...');
        const messages = await getUserChat();
        console.log('Received messages:', messages?.length || 0);
        
        const chatInput = document.getElementById('chatInput');
        const sendChatBtn = document.getElementById('sendChatBtn');
        if (chatInput) chatInput.style.display = 'block';
        if (sendChatBtn) sendChatBtn.style.display = 'inline-block';

        if (Array.isArray(messages)) {
            renderChatMessages(messages);
            console.log('Chat messages rendered');
        }
    } catch (error) {
        console.error('Помилка при завантаженні чату:', error);
        alert('Не вдалося завантажити чат. Повторіть спробу. ' + (error.message || ''));
    }
}
