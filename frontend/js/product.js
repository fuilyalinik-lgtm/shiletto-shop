// product.js - Логика страницы товара - Cart clearing fix v3.0
console.log('🛒 product.js loaded - cart clearing on order confirmation active');

let currentProduct = null;
let currentReviews = [];
let currentImageIndex = 0;
let isAdminUser = false;
let isRegisterMode = false;
let isVerificationStep = false;
let pendingRegistrationEmail = '';
let isPasswordResetMode = false;
let passwordResetStep = '';
let pendingPasswordResetEmail = '';
let pendingPasswordResetToken = '';
let categories = [];
let catalogMenuCloseTimer = null;
let isMouseOverCatalogMenu = false;
const DEFAULT_IMAGE_FILTER = '';
const REVIEW_RATING_LABELS = {
    1: 'Дуже погано',
    2: 'Можна краще',
    3: 'Нормально',
    4: 'Добре',
    5: 'Відмінно'
};

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
    await loadCategoriesForMenu();

    // Загрузка товара и отзывов
    await loadProduct(productId);
    await loadReviews(productId);

    // Обработчики
    setupEventListeners();
    initCatalogMenu();
});

async function loadCategoriesForMenu() {
    try {
        categories = await getCategories();
        fillCatalogMenu();
    } catch (error) {
        console.error('Ошибка загрузки категорий для меню:', error);
    }
}

function fillCatalogMenu() {
    const menuContent = document.getElementById('catalogMenuContent');
    if (!menuContent) return;

    const mainCategories = categories.filter(c => !c.parent_id);
    menuContent.innerHTML = mainCategories.map(main => {
        const subCategories = categories.filter(c => c.parent_id === main.id);
        return `
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
    }).join('');

    menuContent.querySelectorAll('.catalog-menu-main-item, .catalog-menu-sub-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = Number(item.dataset.id);
            window.location.href = `/?category=${id}`;
        });
    });
}

function initCatalogMenu() {
    const reviewComment = document.getElementById('reviewComment');
    if (reviewComment) {
        const nextReviewComment = reviewComment.cloneNode(true);
        reviewComment.replaceWith(nextReviewComment);
        nextReviewComment.removeAttribute('readonly');
        nextReviewComment.removeAttribute('disabled');
        nextReviewComment.style.pointerEvents = 'auto';
        nextReviewComment.style.userSelect = 'text';
        nextReviewComment.addEventListener('click', (event) => {
            event.stopPropagation();
            nextReviewComment.focus();
        });
        nextReviewComment.addEventListener('mousedown', (event) => {
            event.stopPropagation();
        });
    }

    const reviewShowButton = document.getElementById('showReviewFormBtn');
    if (reviewShowButton) {
        const nextReviewShowButton = reviewShowButton.cloneNode(true);
        reviewShowButton.replaceWith(nextReviewShowButton);
        nextReviewShowButton.addEventListener('click', () => {
            if (!authToken) {
                alert('Увійдіть в акаунт, щоб залишити відгук');
                return;
            }

            toggleReviewForm(true);
            const commentField = document.getElementById('reviewComment');
            window.setTimeout(() => commentField?.focus(), 0);
        });
    }

    const reviewSubmitButton = document.getElementById('submitReviewBtn');
    if (reviewSubmitButton) {
        const nextReviewSubmitButton = reviewSubmitButton.cloneNode(true);
        reviewSubmitButton.replaceWith(nextReviewSubmitButton);
        nextReviewSubmitButton.addEventListener('click', async () => {
            const rating = parseInt(document.getElementById('reviewRating').value, 10);
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
                    alert('Відгук додано!');
                    toggleReviewForm(false);
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
    }

    const reviewCancelButton = document.getElementById('cancelReviewBtn');
    if (reviewCancelButton) {
        const nextReviewCancelButton = reviewCancelButton.cloneNode(true);
        reviewCancelButton.replaceWith(nextReviewCancelButton);
        nextReviewCancelButton.addEventListener('click', () => {
            toggleReviewForm(false);
        });
    }

    document.querySelectorAll('#reviewRatingStars .review-star-btn').forEach(starButton => {
        const nextStarButton = starButton.cloneNode(true);
        starButton.replaceWith(nextStarButton);
        nextStarButton.addEventListener('click', () => {
            setReviewRating(Number(nextStarButton.dataset.rating));
        });
    });

    setReviewRating(5);

    const catalogBtn = document.getElementById('catalogBtn');
    const catalogMenu = document.getElementById('catalogMenu');
    const catalogDropdown = document.querySelector('.catalog-dropdown');
    if (!catalogBtn || !catalogMenu || !catalogDropdown) return;

    catalogBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    catalogDropdown.addEventListener('mouseleave', () => {
        if (!isMouseOverCatalogMenu) {
            catalogMenuCloseTimer = setTimeout(() => {
                catalogMenu.classList.remove('show');
            }, 500);
        }
    });

    catalogDropdown.addEventListener('mouseenter', () => {
        if (catalogMenuCloseTimer) {
            clearTimeout(catalogMenuCloseTimer);
            catalogMenuCloseTimer = null;
        }
        catalogMenu.classList.add('show');
    });

    catalogMenu.addEventListener('mouseenter', () => {
        isMouseOverCatalogMenu = true;
        if (catalogMenuCloseTimer) {
            clearTimeout(catalogMenuCloseTimer);
            catalogMenuCloseTimer = null;
        }
        catalogMenu.classList.add('show');
    });

    catalogMenu.addEventListener('mouseleave', () => {
        isMouseOverCatalogMenu = false;
        catalogMenuCloseTimer = setTimeout(() => {
            catalogMenu.classList.remove('show');
        }, 500);
    });
}

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

function getReviewCountLabel(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 === 1 && mod100 !== 11) {
        return `${count} відгук`;
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return `${count} відгуки`;
    }

    return `${count} відгуків`;
}

function createReviewStarsMarkup(rating) {
    return Array.from({ length: 5 }, (_, index) => {
        const filled = index < rating;
        return `<span class="review-star ${filled ? 'is-filled' : ''}" aria-hidden="true">★</span>`;
    }).join('');
}

function updateReviewsSummary(reviews) {
    const averageElement = document.getElementById('reviewsAverage');
    const countElement = document.getElementById('reviewsCount');
    const starsElement = document.getElementById('reviewsAverageStars');

    if (!averageElement || !countElement || !starsElement) return;

    const count = reviews.length;
    const average = count ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count : 0;
    const roundedAverage = count ? Math.round(average * 10) / 10 : 0;
    const displayRating = count ? Math.round(average) : 0;

    averageElement.textContent = roundedAverage.toFixed(1);
    countElement.textContent = getReviewCountLabel(count);
    starsElement.innerHTML = createReviewStarsMarkup(displayRating);
    starsElement.setAttribute('aria-label', count
        ? `Середня оцінка ${roundedAverage.toFixed(1)} з 5`
        : 'Оцінок поки немає');
}

function setReviewRating(rating) {
    const normalizedRating = Math.max(1, Math.min(5, Number(rating) || 5));
    const ratingInput = document.getElementById('reviewRating');
    const ratingHint = document.getElementById('reviewRatingHint');

    if (ratingInput) {
        ratingInput.value = String(normalizedRating);
    }

    document.querySelectorAll('#reviewRatingStars .review-star-btn').forEach(button => {
        const buttonRating = Number(button.dataset.rating);
        const isActive = buttonRating <= normalizedRating;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-checked', buttonRating === normalizedRating ? 'true' : 'false');
    });

    if (ratingHint) {
        ratingHint.textContent = REVIEW_RATING_LABELS[normalizedRating] || REVIEW_RATING_LABELS[5];
    }
}

function resetReviewForm() {
    const commentField = document.getElementById('reviewComment');
    if (commentField) {
        commentField.value = '';
    }

    setReviewRating(5);
}

function toggleReviewForm(show) {
    const form = document.getElementById('addReviewForm');
    const trigger = document.getElementById('showReviewFormBtn');

    if (!form || !trigger) return;

    form.style.display = show ? 'block' : 'none';
    trigger.style.display = show ? 'none' : 'inline-flex';

    if (show) {
        document.getElementById('reviewComment')?.focus();
        return;
    }

    resetReviewForm();
}

function displayProduct(product) {
    document.getElementById('productName').textContent = product.name;
    document.getElementById('productPrice').textContent = `${product.price} грн.`;
    if (isAdminUser && product.drop_price) {
        document.getElementById('productPrice').textContent += ` (Дроп ціна: ${product.drop_price} грн.)`;
    }
    const productStockElement = document.getElementById('productStock');
    productStockElement.style.display = 'none';
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
        const prevImageFullBtn = document.getElementById('prevImageFullBtn');
        const nextImageFullBtn = document.getElementById('nextImageFullBtn');
        const thumbnailGallery = document.getElementById('thumbnailGallery');
        thumbnailGallery.innerHTML = product.images.map((img, index) => `
            <img src="${img.url}" alt="Миниатюра" class="thumbnail ${index === currentImageIndex ? 'active' : ''}" onclick="changeMainImage(${index})">
        `).join('');

        // Показать/скрыть кнопки навигации на странице товара
        changeMainImage(currentImageIndex);

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
        const prevImageFullBtn = document.getElementById('prevImageFullBtn');
        const nextImageFullBtn = document.getElementById('nextImageFullBtn');
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
    updateReviewsSummary(reviews);

    if (!container) return;

    if (reviews.length === 0) {
        container.innerHTML = '<p class="review-empty">Відгуків поки що немає. Будь першим, хто поділиться враженням!</p>';
        return;
    }

    container.innerHTML = reviews.map(review => `
        <div class="review">
            <div class="review-header">
                <div class="review-author-block">
                    <strong class="review-author">${escapeHtml(review.user || 'Користувач')}</strong>
                    <div class="review-stars review-stars-display" aria-label="Оцінка ${Number(review.rating) || 0} з 5">
                        ${createReviewStarsMarkup(Number(review.rating) || 0)}
                    </div>
                </div>
                <small class="review-date">${new Date(review.created_at).toLocaleDateString('uk-UA')}</small>
            </div>
            <p class="review-comment">${escapeHtml(review.comment || 'Без коментаря')}</p>
        </div>
    `).join('');
}

function changeMainImage(index, options = {}) {
    if (!currentProduct || !currentProduct.images || index < 0 || index >= currentProduct.images.length) return;

    const updateMain = options.updateMain !== false;
    const updateFullscreen = options.updateFullscreen !== false;
    currentImageIndex = index;
    fullscreenImageIndex = index;
    const currentImage = currentProduct.images[index];
    const mainImageElement = document.getElementById('mainImage');
    const mainImageGhostElement = document.getElementById('mainImageGhost');
    const fullscreenImageElement = document.getElementById('fullscreenImage');
    const fullscreenImageGhostElement = document.getElementById('fullscreenImageGhost');
    const galleryCounter = document.getElementById('galleryImageCounter');
    const fullscreenCounter = document.getElementById('fullscreenImageCounter');
    const counterText = `${index + 1} / ${currentProduct.images.length}`;

    if (mainImageElement && updateMain) {
        mainImageElement.src = currentImage.url;
        mainImageElement.style.opacity = '1';
        mainImageElement.style.transform = 'translate3d(0, 0, 0) scale(1)';
        mainImageElement.style.filter = '';
    }

    if (mainImageGhostElement) {
        mainImageGhostElement.style.opacity = '0';
        mainImageGhostElement.style.transform = 'translate3d(0, 0, 0) scale(1)';
        mainImageGhostElement.style.filter = '';
    }

    if (fullscreenImageElement && updateFullscreen) {
        fullscreenImageElement.src = currentImage.url;
        fullscreenImageElement.style.opacity = '1';
        fullscreenImageElement.style.filter = DEFAULT_IMAGE_FILTER;
        if (!fullscreenImageElement.classList.contains('zoomed')) {
            fullscreenImageElement.style.transform = 'translate3d(0, 0, 0) scale(1)';
        }
    }

    if (fullscreenImageGhostElement) {
        fullscreenImageGhostElement.style.opacity = '0';
        fullscreenImageGhostElement.style.transform = 'translate3d(0, 0, 0) scale(1)';
        fullscreenImageGhostElement.style.filter = DEFAULT_IMAGE_FILTER;
    }

    if (galleryCounter) {
        galleryCounter.textContent = counterText;
    }

    if (fullscreenCounter) {
        fullscreenCounter.textContent = counterText;
    }

    // Обновить активную миниатюру
    document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index);
    });

    resetGalleryPreviewState();
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

function resetGalleryPreviewState() {
    const mainImage = document.getElementById('mainImage');
    const mainImageGhost = document.getElementById('mainImageGhost');
    const fullscreenImage = document.getElementById('fullscreenImage');
    const fullscreenImageGhost = document.getElementById('fullscreenImageGhost');

    if (mainImage && mainImageGhost) {
        mainImage.style.zIndex = '1';
        mainImageGhost.style.zIndex = '2';
        mainImageGhost.dataset.index = '';
    }

    if (fullscreenImage && fullscreenImageGhost) {
        fullscreenImage.style.zIndex = '1';
        fullscreenImageGhost.style.zIndex = '2';
        fullscreenImageGhost.dataset.index = '';
    }
}

function isTypingInFormField(target) {
    if (!target) return false;

    const formField = target.closest('input, textarea, select, [contenteditable="true"]');
    return Boolean(formField) || target.isContentEditable;
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
    document.getElementById('prevImageBtn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        suppressMainImageClick = true;
        resetGalleryPreviewState();
        prevImage();
        window.setTimeout(() => {
            suppressMainImageClick = false;
        }, 80);
    });
    document.getElementById('nextImageBtn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        suppressMainImageClick = true;
        resetGalleryPreviewState();
        nextImage();
        window.setTimeout(() => {
            suppressMainImageClick = false;
        }, 80);
    });

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
    const catalogBtn = document.getElementById('catalogBtn');
    const aboutBtn = document.getElementById('aboutBtn');
    const contactBtn = document.getElementById('contactBtn');

    if (catalogBtn) {
        catalogBtn.addEventListener('click', () => window.location.href = '/');
    }
    if (aboutBtn) {
        aboutBtn.addEventListener('click', () => window.location.href = '/about');
    }
    if (contactBtn) {
        contactBtn.addEventListener('click', () => window.location.href = '/contact');
    }

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
    document.getElementById('logoutBtn').addEventListener('click', logoutUser);

    // Модальные кнопки (закрытие)
    const closeCartModalBtn = document.getElementById('closeCartModal');
    const closeChatModalBtn = document.getElementById('closeChatModal');
    const closeLoginModalBtn = document.getElementById('closeLoginModal');

    if (closeCartModalBtn) closeCartModalBtn.addEventListener('click', () => document.getElementById('cartModal').style.display = 'none');
    if (closeChatModalBtn) closeChatModalBtn.addEventListener('click', () => document.getElementById('chatModal').style.display = 'none');
    if (closeLoginModalBtn) {
        closeLoginModalBtn.addEventListener('click', () => {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.style.display = 'none';
            resetAuthModalState();
            updateModalMode();
        });
    }

    // Обработчик формы авторизации/регистрации
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginFormSubmit);
    }
    const mainImage = document.getElementById('mainImage');
    const mainImageGhost = document.getElementById('mainImageGhost');
    const imageModal = document.getElementById('imageModal');
    const fullscreenImage = document.getElementById('fullscreenImage');
    const fullscreenImageGhost = document.getElementById('fullscreenImageGhost');
    const productGalleryStage = document.getElementById('productGalleryStage');
    const productGalleryTrack = document.getElementById('productGalleryTrack');
    const fullscreenImageViewport = document.getElementById('fullscreenImageViewport');
    const prevImageFullBtn = document.getElementById('prevImageFullBtn');
    const nextImageFullBtn = document.getElementById('nextImageFullBtn');
    const closeImageModalBtn = document.getElementById('closeImageModalBtn');
    let isImageZoomed = false;
    let isMouseDown = false;
    let offsetX = 0;
    let offsetY = 0;
    let lastX = 0;
    let lastY = 0;
    let isMoving = false;
    let swipeTriggered = false;
    let startX = 0;
    let startY = 0;
    let isMainImageMouseDown = false;
    let mainImageStartX = 0;
    let mainImageStartY = 0;
    let mainImageSwipeTriggered = false;
    let suppressMainImageClick = false;
    let lastDragTime = 0;
    let lastDragDeltaX = 0;
    let mainImageDragOffset = 0;
    let fullscreenDragOffset = 0;
    let isMainImageAnimating = false;
    let isFullscreenAnimating = false;
    let activeSwipeContext = null;
    let fullscreenTapPrimed = false;
    let mainPreviewDirection = 0;
    let mainPreviewIndex = -1;
    let mainPreviewTravel = 0;
    let fullscreenPreviewDirection = 0;
    let fullscreenPreviewIndex = -1;
    let fullscreenPreviewTravel = 0;
    let fullscreenHadDragGesture = false;
    let fullscreenZoomScale = 1;
    let fullscreenImageIndex = 0; // Текущий индекс фото в полноэкранном режиме
    const MOVE_THRESHOLD = 5; // Минимальное расстояние для считания движением

    const SWIPE_THRESHOLD = 60;
    const VELOCITY_SWIPE_THRESHOLD = 16;
    const DRAG_RESISTANCE = 0.38;
    const FULLSCREEN_ZOOM_MIN = 1;
    const FULLSCREEN_ZOOM_MAX = 4;
    const FULLSCREEN_ZOOM_DEFAULT = 2;
    const FULLSCREEN_ZOOM_STEP = 0.22;
    const DRAG_GALLERY_ADVANCE_TIMING = {
        exitDuration: 340,
        settleDuration: 540,
        switchDelay: 330
    };

    function resetImageZoom() {
        isImageZoomed = false;
        isMouseDown = false;
        offsetX = 0;
        offsetY = 0;
        isMoving = false;
        fullscreenZoomScale = FULLSCREEN_ZOOM_MIN;
        fullscreenTapPrimed = false;
        activeSwipeContext = null;
        fullscreenImage.style.transform = 'scale(1) translate(0px, 0px)';
        fullscreenImage.style.cursor = 'pointer';
        fullscreenImage.classList.remove('zoomed');
        resetGhostImage(fullscreenImage, fullscreenImageGhost, DEFAULT_IMAGE_FILTER);
        if (fullscreenImageViewport) {
            fullscreenImageViewport.classList.remove('is-dragging');
        }
    }

    function applyZoomedImageTransform(x = offsetX, y = offsetY, transition = 'transform 0.16s ease-out') {
        const viewportWidth = fullscreenImageViewport?.clientWidth || window.innerWidth;
        const viewportHeight = fullscreenImageViewport?.clientHeight || window.innerHeight;
        const scale = Math.max(fullscreenZoomScale, FULLSCREEN_ZOOM_MIN);
        const overflowFactor = Math.max(0, scale - 1);
        const maxOffsetX = Math.max(140, viewportWidth * (0.18 + overflowFactor * 0.5));
        const maxOffsetY = Math.max(120, viewportHeight * (0.15 + overflowFactor * 0.42));
        const resistedX = applyDragResistance(x, maxOffsetX);
        const resistedY = applyDragResistance(y, maxOffsetY);

        fullscreenImage.style.transition = transition;
        fullscreenImage.style.transform = `scale(${scale}) translate(${resistedX / scale}px, ${resistedY / scale}px)`;
        return { resistedX, resistedY };
    }

    function clampFullscreenZoomScale(scale) {
        return Math.min(FULLSCREEN_ZOOM_MAX, Math.max(FULLSCREEN_ZOOM_MIN, scale));
    }

    function setFullscreenZoomScale(nextScale, options = {}) {
        const clampedScale = clampFullscreenZoomScale(nextScale);
        const shouldZoom = clampedScale > FULLSCREEN_ZOOM_MIN + 0.001;

        fullscreenZoomScale = clampedScale;
        isImageZoomed = shouldZoom;

        if (!shouldZoom) {
            resetImageZoom();
            return;
        }

        fullscreenImage.classList.add('zoomed');
        fullscreenImage.style.cursor = isMouseDown ? 'grabbing' : 'grab';
        applyZoomedImageTransform(options.x ?? offsetX, options.y ?? offsetY, options.transition ?? 'transform 0.18s ease-out');
    }

    function setGalleryImageTransform(target, offset, options = {}) {
        if (!target) return;

        const scale = options.scale ?? 1;
        const opacity = options.opacity ?? 1;
        const rotate = options.rotate ?? 0;
        const transition = options.transition ?? 'none';
        const filter = options.filter ?? '';

        target.style.transition = transition;
        target.style.opacity = `${opacity}`;
        target.style.transform = `translate3d(${offset}px, 0, 0) scale(${scale}) rotate(${rotate}deg)`;
        target.style.filter = filter;
    }

    function resetGalleryImageTransform(target, options = {}) {
        setGalleryImageTransform(target, 0, {
            scale: 1,
            opacity: 1,
            rotate: 0,
            transition: options.transition || 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease, filter 0.28s ease',
            filter: options.filter || ''
        });
    }

    function resetGhostImage(target, ghost, filter = '') {
        if (!target) return;

        target.style.transition = 'none';
        target.style.transform = 'translate3d(0, 0, 0) scale(1)';
        target.style.opacity = '1';
        target.style.filter = filter;
        target.style.zIndex = '1';

        if (!ghost) return;

        ghost.style.transition = 'none';
        ghost.style.transform = 'translate3d(0, 0, 0) scale(1)';
        ghost.style.opacity = '0';
        ghost.style.filter = filter;
        ghost.style.zIndex = '2';
        ghost.dataset.index = '';
    }

    

    function getSiblingImageIndex(baseIndex, direction) {
        if (!currentProduct?.images?.length || !direction) return -1;
        return direction > 0
            ? (baseIndex - 1 + currentProduct.images.length) % currentProduct.images.length
            : (baseIndex + 1) % currentProduct.images.length;
    }

    function resolveSwipeTargetIndex(previewIndex, baseIndex, deltaX, previewDirection) {
        if (previewIndex >= 0) {
            return previewIndex;
        }

        const fallbackDirection = previewDirection || (deltaX > 0 ? 1 : -1);
        return getSiblingImageIndex(baseIndex, fallbackDirection);
    }

    function updateDragPreview({ activeImage, ghostImage, baseIndex, deltaX, resistedOffset, filter = '' }) {
        if (!activeImage || !ghostImage || !currentProduct?.images?.length) {
            return { direction: 0, nextIndex: -1, travel: 0 };
        }

        const direction = deltaX === 0 ? 0 : (deltaX > 0 ? 1 : -1);
        if (!direction) {
            resetGhostImage(activeImage, ghostImage, filter);
            return { direction: 0, nextIndex: -1, travel: 0 };
        }

        const nextIndex = getSiblingImageIndex(baseIndex, direction);
        if (nextIndex < 0) {
            resetGhostImage(activeImage, ghostImage, filter);
            return { direction: 0, nextIndex: -1, travel: 0 };
        }

        const travel = Math.min(Math.max((activeImage.clientWidth || 420) * 0.72, 220), 340);
        const progress = Math.min(Math.abs(resistedOffset) / travel, 1);
        const ghostOffset = resistedOffset - (direction * travel);

        if (ghostImage.dataset.index !== String(nextIndex)) {
            ghostImage.src = currentProduct.images[nextIndex].url;
            ghostImage.dataset.index = String(nextIndex);
        }

        activeImage.style.transition = 'none';
        ghostImage.style.transition = 'none';
        activeImage.style.zIndex = '2';
        ghostImage.style.zIndex = '1';
        activeImage.style.filter = filter;
        ghostImage.style.filter = filter;
        activeImage.style.transform = `translate3d(${resistedOffset}px, 0, 0) scale(${1 - (progress * 0.025)})`;
        activeImage.style.opacity = `${1 - (progress * 0.26)}`;
        ghostImage.style.transform = `translate3d(${ghostOffset}px, 0, 0) scale(${0.985 + (progress * 0.015)})`;
        ghostImage.style.opacity = `${0.22 + (progress * 0.78)}`;

        return { direction, nextIndex, travel };
    }

    function cancelDragPreview(activeImage, ghostImage, direction, travel, filter = '') {
        if (!activeImage) return;

        activeImage.style.transition = 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease';
        activeImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
        activeImage.style.opacity = '1';
        activeImage.style.filter = filter;

        if (!ghostImage) return;

        const fallbackOffset = direction ? -direction * Math.max(travel * 0.72, 180) : 0;
        ghostImage.style.transition = 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease';
        ghostImage.style.transform = `translate3d(${fallbackOffset}px, 0, 0) scale(0.985)`;
        ghostImage.style.opacity = '0';
        ghostImage.style.filter = filter;

        window.setTimeout(() => {
            resetGhostImage(activeImage, ghostImage, filter);
        }, 430);
    }

    function commitDragSwap({
        activeImage,
        ghostImage,
        nextIndex,
        direction,
        travel,
        filter = '',
        syncMain = true,
        syncFullscreen = true,
        onStart,
        onComplete
    }) {
        if (!activeImage || !ghostImage || nextIndex < 0 || !currentProduct?.images?.[nextIndex]) return;

        const finalTravel = Math.max(travel || 0, 220);
        const nextImage = currentProduct.images[nextIndex];
        onStart?.();

        activeImage.style.transition = 'transform 0.48s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease';
        ghostImage.style.transition = 'transform 0.56s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.42s ease';

        requestAnimationFrame(() => {
            activeImage.style.transform = `translate3d(${direction * finalTravel}px, 0, 0) scale(0.97)`;
            activeImage.style.opacity = '0';
            ghostImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
            ghostImage.style.opacity = '1';
        });

        window.setTimeout(() => {
            changeMainImage(nextIndex, {
                updateMain: syncMain,
                updateFullscreen: syncFullscreen
            });
            activeImage.src = nextImage.url;
            activeImage.style.filter = filter;
            resetGhostImage(activeImage, ghostImage, filter);
            onComplete?.();
        }, 580);
    }

    function commitFullscreenSwipe(nextIndex, direction, travel = 0) {
        if (!fullscreenImage || !fullscreenImageGhost || nextIndex < 0 || !currentProduct?.images?.[nextIndex]) {
            return;
        }

        const finalTravel = Math.max(travel || 0, 220);
        isFullscreenAnimating = true;

        fullscreenImage.style.transition = 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease';
        fullscreenImageGhost.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.34s ease';

        requestAnimationFrame(() => {
            fullscreenImage.style.transform = `translate3d(${direction * finalTravel}px, 0, 0) scale(0.97)`;
            fullscreenImage.style.opacity = '0';
            fullscreenImageGhost.style.transform = 'translate3d(0, 0, 0) scale(1)';
            fullscreenImageGhost.style.opacity = '1';
        });

        window.setTimeout(() => {
            showFullscreenImage(nextIndex);
            resetGhostImage(fullscreenImage, fullscreenImageGhost, DEFAULT_IMAGE_FILTER);
            isFullscreenAnimating = false;
        }, 380);
    }

    function beginSwipeDrag(config, event) {
        activeSwipeContext = {
            ...config,
            startX: event.clientX,
            startY: event.clientY,
            deltaX: 0,
            deltaY: 0,
            dragOffset: 0,
            previewDirection: 0,
            previewIndex: -1,
            previewTravel: 0,
            hasGesture: false
        };

        activeSwipeContext.setDragging?.(true);
    }

    function resetSwipePreview(context) {
        if (!context) return;

        context.dragOffset = 0;
        context.previewDirection = 0;
        context.previewIndex = -1;
        context.previewTravel = 0;
    }

    function updateSwipeDrag(event) {
        if (!activeSwipeContext) return;

        const context = activeSwipeContext;
        const deltaX = event.clientX - context.startX;
        const deltaY = event.clientY - context.startY;

        context.deltaX = deltaX;
        context.deltaY = deltaY;

        if (Math.abs(deltaX) > MOVE_THRESHOLD || Math.abs(deltaY) > MOVE_THRESHOLD) {
            context.hasGesture = true;
        }

        if (!context.hasGesture) {
            return;
        }

        if (Math.abs(deltaX) <= Math.abs(deltaY)) {
            resetSwipePreview(context);
            cancelDragPreview(context.activeImage, context.ghostImage, 0, 0, context.filter);
            return;
        }

        const resistedOffset = deltaX * DRAG_RESISTANCE;
        context.dragOffset = resistedOffset;

        const preview = updateDragPreview({
            activeImage: context.activeImage,
            ghostImage: context.ghostImage,
            baseIndex: context.getBaseIndex(),
            deltaX,
            resistedOffset,
            filter: context.filter
        });

        context.previewDirection = preview.direction;
        context.previewIndex = preview.nextIndex;
        context.previewTravel = preview.travel;
    }

    function finishSwipeDrag(options = {}) {
        if (!activeSwipeContext) {
            return { type: null, hadGesture: false, committed: false };
        }

        const context = activeSwipeContext;
        activeSwipeContext = null;
        context.setDragging?.(false);

        const hadGesture = context.hasGesture;
        const horizontalDrag = hadGesture && Math.abs(context.deltaX) > Math.abs(context.deltaY);
        const direction = context.previewDirection || (context.deltaX === 0 ? 0 : (context.deltaX > 0 ? 1 : -1));
        const nextIndex = context.previewIndex >= 0
            ? context.previewIndex
            : getSiblingImageIndex(context.getBaseIndex(), direction);
        const shouldCommit = !options.cancelled && horizontalDrag && Math.abs(context.deltaX) >= SWIPE_THRESHOLD && direction && nextIndex >= 0;

        if (shouldCommit) {
            if (context.type === 'fullscreen') {
                commitFullscreenSwipe(nextIndex, direction, context.previewTravel);
            } else if (context.type === 'main') {
                suppressMainImageClick = true;
                commitDragSwap({
                    activeImage: context.activeImage,
                    ghostImage: context.ghostImage,
                    nextIndex,
                    direction,
                    travel: context.previewTravel,
                    filter: context.filter,
                    syncMain: context.syncMain,
                    syncFullscreen: context.syncFullscreen,
                    onStart: context.onStart,
                    onComplete: context.onComplete
                });
            } else {
                commitDragSwap({
                    activeImage: context.activeImage,
                    ghostImage: context.ghostImage,
                    nextIndex,
                    direction,
                    travel: context.previewTravel,
                    filter: context.filter,
                    syncMain: context.syncMain,
                    syncFullscreen: context.syncFullscreen,
                    onStart: context.onStart,
                    onComplete: context.onComplete
                });
            }
        } else if (hadGesture || Math.abs(context.dragOffset) > MOVE_THRESHOLD) {
            if (context.type === 'main') {
                suppressMainImageClick = true;
            }

            cancelDragPreview(
                context.activeImage,
                context.ghostImage,
                context.previewDirection,
                context.previewTravel,
                context.filter
            );
        }

        resetSwipePreview(context);
        return { type: context.type, hadGesture, committed: shouldCommit };
    }

    function applyDragResistance(value, limit) {
        if (Math.abs(value) <= limit) return value;

        const overflow = Math.abs(value) - limit;
        const resistedOverflow = Math.sqrt(overflow) * 12;
        return Math.sign(value) * (limit + resistedOverflow);
    }

    function animateImageSwap({
        activeImage,
        ghostImage,
        nextIndex,
        direction,
        timing = {},
        filter = '',
        syncMain = true,
        syncFullscreen = true,
        onStart,
        onComplete
    }) {
        if (!activeImage || !ghostImage || !currentProduct?.images?.[nextIndex]) {
            changeMainImage(nextIndex);
            return;
        }

        const nextImage = currentProduct.images[nextIndex];
        const enterDuration = timing.enterDuration ?? 420;
        const exitDuration = timing.exitDuration ?? 420;
        const travel = Math.min(Math.max((activeImage.clientWidth || 420) * 0.52, 150), 260);
        const exitOffset = direction > 0 ? travel : -travel;
        const enterOffset = -exitOffset * 0.68;

        onStart?.();

        ghostImage.src = nextImage.url;
        ghostImage.style.transition = 'none';
        ghostImage.style.transform = `translate3d(${enterOffset}px, 0, 0) scale(0.985)`;
        ghostImage.style.opacity = '0';
        ghostImage.style.filter = filter;

        activeImage.style.filter = filter;
        activeImage.style.willChange = 'transform, opacity';
        ghostImage.style.willChange = 'transform, opacity';

        requestAnimationFrame(() => {
            activeImage.style.transition = `transform ${exitDuration}ms cubic-bezier(0.2, 0.9, 0.22, 1), opacity ${exitDuration}ms ease`;
            ghostImage.style.transition = `transform ${enterDuration}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${enterDuration}ms ease`;

            activeImage.style.transform = `translate3d(${exitOffset}px, 0, 0) scale(0.965)`;
            activeImage.style.opacity = '0';
            ghostImage.style.transform = 'translate3d(0, 0, 0) scale(1)';
            ghostImage.style.opacity = '1';
        });

        window.setTimeout(() => {
            changeMainImage(nextIndex, {
                updateMain: syncMain,
                updateFullscreen: syncFullscreen
            });

            activeImage.src = nextImage.url;
            resetGhostImage(activeImage, ghostImage, filter);
            onComplete?.();
        }, Math.max(enterDuration, exitDuration) + 30);
    }

    function animateGalleryAdvance(target, direction, onSwitch, timing = {}) {
        if (!target) return;

        const exitDuration = timing.exitDuration ?? 160;
        const settleDuration = timing.settleDuration ?? 340;
        const switchDelay = timing.switchDelay ?? 140;
        const baseWidth = target.clientWidth || target.naturalWidth || 420;
        const exitOffset = (direction > 0 ? 1 : -1) * Math.min(Math.max(baseWidth * 0.62, 220), 360);
        setGalleryImageTransform(target, exitOffset, {
            scale: 0.93,
            opacity: 0.08,
            rotate: 0,
            transition: `transform ${exitDuration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${exitDuration}ms ease`
        });

        window.setTimeout(() => {
            onSwitch();
            setGalleryImageTransform(target, -exitOffset * 0.18, {
                scale: 0.975,
                opacity: 0.38,
                rotate: 0,
                transition: 'none'
            });

            requestAnimationFrame(() => {
                resetGalleryImageTransform(target, {
                    transition: `transform ${settleDuration}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${Math.max(280, settleDuration - 60)}ms ease`
                });
            });
        }, switchDelay);
    }

    function isPointerStillWithinContainer(nextTarget, container) {
        return Boolean(nextTarget && container && container.contains(nextTarget));
    }

    function closeImageModal() {
        imageModal.classList.remove('show');
        document.body.style.overflow = '';
        isMainImageAnimating = false;
        isFullscreenAnimating = false;
        resetImageZoom();
        resetGhostImage(mainImage, mainImageGhost, '');
        resetGhostImage(fullscreenImage, fullscreenImageGhost, DEFAULT_IMAGE_FILTER);
        if (productGalleryTrack) {
            productGalleryTrack.classList.remove('is-dragging');
        }
        // Показать нижнюю панель при закрытии полноэкранного просмотра
        const bottomPanel = document.getElementById('bottomPanel');
        if (bottomPanel) {
            bottomPanel.style.display = '';
        }
    }

    console.log('Image modal elements loaded:', { mainImage, imageModal, fullscreenImage });

    // Открытие полноэкранного просмотра
    mainImage.addEventListener('click', () => {
        if (suppressMainImageClick) {
            suppressMainImageClick = false;
            return;
        }

        console.log('Main image clicked, opening fullscreen');
        imageModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        fullscreenImage.src = mainImage.src;
        fullscreenImageIndex = currentImageIndex; // Устанавливаем индекс текущего фото
        resetImageZoom();
        // Скрыть нижнюю панель при открытии полноэкранного просмотра
        const bottomPanel = document.getElementById('bottomPanel');
        if (bottomPanel) {
            bottomPanel.style.display = 'none';
        }
    });

    mainImage.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });

    fullscreenImage.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });

    mainImage.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || isMainImageAnimating || !currentProduct?.images || currentProduct.images.length <= 1) {
            return;
        }

        suppressMainImageClick = false;
        beginSwipeDrag({
            type: 'main',
            activeImage: mainImage,
            ghostImage: mainImageGhost,
            filter: '',
            getBaseIndex: () => currentImageIndex,
            syncMain: false,
            syncFullscreen: true,
            setDragging: (isDragging) => {
                if (productGalleryTrack) {
                    productGalleryTrack.classList.toggle('is-dragging', isDragging);
                }
            },
            onStart: () => {
                isMainImageAnimating = true;
            },
            onComplete: () => {
                isMainImageAnimating = false;
                window.setTimeout(() => {
                    suppressMainImageClick = false;
                }, 0);
            }
        }, e);

        e.preventDefault();
    });

    // Функции для переключения фото в полноэкранном режиме
    function showFullscreenImage(index) {
        if (!currentProduct || !currentProduct.images || currentProduct.images.length === 0) return;

        fullscreenImageIndex = index;
        changeMainImage(index);
        resetImageZoom();
        resetGalleryImageTransform(fullscreenImage, {
            filter: DEFAULT_IMAGE_FILTER
        });
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

    prevImageFullBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetGalleryPreviewState();
        prevFullscreenImage();
    });

    nextImageFullBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetGalleryPreviewState();
        nextFullscreenImage();
    });

    if (closeImageModalBtn) {
        closeImageModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeImageModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || isTypingInFormField(e.target)) {
            return;
        }

        if (!currentProduct || !currentProduct.images || currentProduct.images.length <= 1) {
            return;
        }

        const isImageModalOpen = imageModal.classList.contains('show');

        if (e.key === 'Escape' && isImageModalOpen) {
            e.preventDefault();
            closeImageModal();
            return;
        }

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (isImageModalOpen) {
                prevFullscreenImage();
            } else {
                prevImage();
            }
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (isImageModalOpen) {
                nextFullscreenImage();
            } else {
                nextImage();
            }
        }
    });

    fullscreenImage.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || isFullscreenAnimating) {
            return;
        }

        if (isImageZoomed) {
            isMouseDown = true;
            isMoving = false;
            lastX = e.clientX;
            lastY = e.clientY;
            fullscreenTapPrimed = false;
            e.preventDefault();
            return;
        }

        fullscreenTapPrimed = true;
        beginSwipeDrag({
            type: 'fullscreen',
            activeImage: fullscreenImage,
            ghostImage: fullscreenImageGhost,
            filter: DEFAULT_IMAGE_FILTER,
            getBaseIndex: () => fullscreenImageIndex,
            syncMain: true,
            syncFullscreen: true,
            setDragging: (isDragging) => {
                if (fullscreenImageViewport) {
                    fullscreenImageViewport.classList.toggle('is-dragging', isDragging);
                }
            },
            onStart: () => {
                isFullscreenAnimating = true;
            },
            onComplete: () => {
                isFullscreenAnimating = false;
            }
        }, e);

        e.preventDefault();
    });

    fullscreenImageViewport?.addEventListener('wheel', (e) => {
        if (!imageModal.classList.contains('show') || isFullscreenAnimating) {
            return;
        }

        e.preventDefault();

        const delta = e.deltaY < 0 ? FULLSCREEN_ZOOM_STEP : -FULLSCREEN_ZOOM_STEP;
        const nextScale = clampFullscreenZoomScale((isImageZoomed ? fullscreenZoomScale : FULLSCREEN_ZOOM_MIN) + delta);

        if (nextScale <= FULLSCREEN_ZOOM_MIN) {
            resetImageZoom();
            return;
        }

        const viewportRect = fullscreenImageViewport.getBoundingClientRect();
        const focusX = e.clientX - (viewportRect.left + viewportRect.width / 2);
        const focusY = e.clientY - (viewportRect.top + viewportRect.height / 2);
        const currentScale = Math.max(fullscreenZoomScale, FULLSCREEN_ZOOM_MIN);
        const scaleRatio = nextScale / currentScale;

        offsetX = offsetX * scaleRatio + focusX * (scaleRatio - 1) * 0.35;
        offsetY = offsetY * scaleRatio + focusY * (scaleRatio - 1) * 0.35;
        fullscreenTapPrimed = false;
        isMouseDown = false;
        isMoving = false;

        setFullscreenZoomScale(nextScale, {
            x: offsetX,
            y: offsetY,
            transition: 'transform 0.18s ease-out'
        });
    }, { passive: false });

    document.addEventListener('mousemove', (e) => {
        updateSwipeDrag(e);

        if (isImageZoomed && isMouseDown) {
            const dx = Math.abs(e.clientX - lastX);
            const dy = Math.abs(e.clientY - lastY);

            if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
                isMoving = true;
                const moveFactor = 0.72;
                offsetX += (e.clientX - lastX) * moveFactor;
                offsetY += (e.clientY - lastY) * moveFactor;
                fullscreenImage.style.cursor = 'grabbing';
                applyZoomedImageTransform(offsetX, offsetY, 'transform 0.12s ease-out');
            }

            lastX = e.clientX;
            lastY = e.clientY;
        }
    });

    document.addEventListener('mouseup', () => {
        const swipeResult = finishSwipeDrag();

        if (swipeResult.type === 'fullscreen') {
            if (!swipeResult.hadGesture && !swipeResult.committed && fullscreenTapPrimed && !isImageZoomed) {
                offsetX = 0;
                offsetY = 0;
                setFullscreenZoomScale(FULLSCREEN_ZOOM_DEFAULT, {
                    x: 0,
                    y: 0,
                    transition: 'transform 0.22s ease-out'
                });
            }
            fullscreenTapPrimed = false;
        }

        if (isMouseDown && isImageZoomed) {
            isMouseDown = false;

            if (!isMoving) {
                resetImageZoom();
            } else {
                fullscreenImage.style.cursor = 'grab';
                applyZoomedImageTransform(offsetX, offsetY, 'transform 0.2s ease-out');
            }

            isMoving = false;
        }
    });

    window.addEventListener('blur', () => {
        if (activeSwipeContext) {
            finishSwipeDrag({ cancelled: true });
        }

        if (isMouseDown && isImageZoomed) {
            isMouseDown = false;
            isMoving = false;
            fullscreenImage.style.cursor = 'grab';
        }

        fullscreenTapPrimed = false;
    });
    imageModal.addEventListener('click', (e) => {
        // Закрыть если клик был не на самом изображении
        if (!fullscreenImageViewport || !fullscreenImageViewport.contains(e.target)) {
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
        if (loginBtn) loginBtn.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';
        if (profileBtn) profileBtn.style.display = 'inline-flex';
        if (chatBtn) chatBtn.style.display = 'inline-flex';
    } else {
        if (loginBtn) loginBtn.style.display = 'inline-flex';
        if (registerBtn) registerBtn.style.display = 'inline-flex';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (profileBtn) profileBtn.style.display = 'none';
        if (chatBtn) chatBtn.style.display = 'none';
    }
}

function logoutUser() {
    localStorage.removeItem('authToken');
    authToken = null;
    updateAuthUI(false);
    window.location.href = 'index.html';
}

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
        if (modalTitle) modalTitle.textContent = passwordResetStep === 'new_password' ? 'Новий пароль' : 'Відновлення пароля';
        if (regUsername) {
            regUsername.style.display = 'none';
            regUsername.required = false;
        }
        if (loginEmail) {
            loginEmail.style.display = passwordResetStep === 'code' ? 'none' : 'block';
            loginEmail.required = passwordResetStep === 'email';
            loginEmail.readOnly = passwordResetStep !== 'email';
        }
        if (loginPassword) {
            loginPassword.style.display = passwordResetStep === 'new_password' ? 'block' : 'none';
            loginPassword.required = passwordResetStep === 'new_password';
            loginPassword.placeholder = passwordResetStep === 'new_password' ? 'Новий пароль' : 'Пароль';
        }
        if (verificationCode) {
            verificationCode.style.display = passwordResetStep === 'code' ? 'block' : 'none';
            verificationCode.required = passwordResetStep === 'code';
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
        }
        if (resendCodeRow) resendCodeRow.classList.add('auth-compact-links');
        setRegisterStatus(
            passwordResetStep === 'code'
                ? `Ми надіслали код на ${pendingPasswordResetEmail || (loginEmail ? loginEmail.value.trim() : '')}. Введіть його, щоб продовжити.`
                : passwordResetStep === 'new_password'
                    ? 'Введіть новий пароль для свого акаунта.'
                    : ''
        );
        if (oauthButtons) oauthButtons.style.display = 'none';
        if (authDivider) authDivider.style.display = 'none';
        if (forgotPasswordRow) forgotPasswordRow.style.display = 'none';
        if (resendCodeRow) resendCodeRow.style.display = passwordResetStep === 'code' ? 'inline-flex' : 'none';
        const switchToLogin = document.getElementById('switchToLogin');
        if (switchToLogin) {
            switchToLogin.onclick = (e) => {
                e.preventDefault();
                resetAuthModalState();
                updateModalMode();
            };
        }
        if (passwordResetStep === 'code' && resendCodeLink) {
            resendCodeLink.onclick = async (e) => {
                e.preventDefault();
                try {
                    await requestPasswordReset(pendingPasswordResetEmail || (loginEmail ? loginEmail.value.trim() : ''));
                    showNotification('Код для відновлення пароля надіслано повторно.', 'Успіх', 'success', 3000);
                } catch (error) {
                    showNotification('Помилка повторної відправки коду: ' + error.message, 'Помилка', 'error', 4000);
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

    if (isRegisterMode) {
        if (modalTitle) modalTitle.textContent = 'Реєстрація';
        if (regUsername) {
            regUsername.style.display = isVerificationStep ? 'none' : 'block';
            regUsername.required = !isVerificationStep;
        }
        if (loginEmail) {
            loginEmail.style.display = isVerificationStep ? 'none' : 'block';
            loginEmail.required = !isVerificationStep;
        }
        if (loginPassword) {
            loginPassword.style.display = isVerificationStep ? 'none' : 'block';
            loginPassword.required = !isVerificationStep;
        }
        if (verificationCode) {
            verificationCode.style.display = isVerificationStep ? 'block' : 'none';
            verificationCode.required = isVerificationStep;
        }
        if (loginEmail) loginEmail.readOnly = isVerificationStep;
        if (loginPassword) loginPassword.placeholder = 'Пароль';
        if (modalSubmitBtn) modalSubmitBtn.textContent = isVerificationStep ? 'Підтвердити email' : 'Надіслати код';
        if (switchLink) switchLink.innerHTML = 'Вже маєте акаунт? <a href="#" id="switchToLogin" class="auth-inline-link">Увійти</a>';
        setRegisterStatus(
            isVerificationStep
                ? `Ми надіслали код на ${pendingRegistrationEmail || (loginEmail ? loginEmail.value.trim() : '')}. Введіть його, щоб завершити реєстрацію.`
                : ''
        );
        if (oauthButtons) oauthButtons.style.display = '';
        if (authDivider) authDivider.style.display = '';
        if (googleBtn) googleBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Зареєструватися через Google
        `;
        // Add event listener for switch to login
        const switchToLogin = document.getElementById('switchToLogin');
        if (switchToLogin) {
            switchToLogin.onclick = (e) => {
                e.preventDefault();
                resetAuthModalState();
                updateModalMode();
            };
        }
        if (forgotPasswordRow) forgotPasswordRow.style.display = 'none';
        if (resendCodeRow) resendCodeRow.style.display = 'none';
    } else {
        if (modalTitle) modalTitle.textContent = 'Вхід';
        if (regUsername) {
            regUsername.style.display = 'none';
            regUsername.required = false;
        }
        if (loginEmail) {
            loginEmail.style.display = 'block';
            loginEmail.required = true;
        }
        if (loginPassword) {
            loginPassword.style.display = 'block';
            loginPassword.required = true;
        }
        if (verificationCode) {
            verificationCode.style.display = 'none';
            verificationCode.required = false;
        }
        if (loginEmail) loginEmail.readOnly = false;
        if (loginPassword) loginPassword.placeholder = 'Пароль';
        if (modalSubmitBtn) modalSubmitBtn.textContent = 'Вхід';
        if (switchLink) switchLink.innerHTML = 'Ще не маєте акаунта? <a href="#" id="switchToRegister" class="auth-inline-link">Зареєструватися</a>';
        setRegisterStatus('');
        if (oauthButtons) oauthButtons.style.display = '';
        if (authDivider) authDivider.style.display = '';
        if (googleBtn) googleBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Увійти через Google
        `;
        // Add event listener for switch to register
        const switchToRegister = document.getElementById('switchToRegister');
        if (switchToRegister) {
            switchToRegister.onclick = (e) => {
                e.preventDefault();
                isRegisterMode = true;
                isVerificationStep = false;
                pendingRegistrationEmail = '';
                updateModalMode();
            };
        }
        if (forgotPasswordRow) forgotPasswordRow.style.display = 'block';
        if (resendCodeRow) resendCodeRow.style.display = 'none';
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

    if (googleBtn) googleBtn.style.display = 'block';
}

async function handleLoginFormSubmit(e) {
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
                showNotification('Код для відновлення пароля надіслано на вашу електронну пошту.', 'Успіх', 'success', 3000);
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
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.style.display = 'none';
            resetAuthModalState();
            const loginForm = document.getElementById('loginForm');
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
                showNotification('Код підтвердження надіслано на вашу електронну пошту.', 'Успіх', 'success', 3000);
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

            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.style.display = 'none';
            isRegisterMode = false;
            isVerificationStep = false;
            pendingRegistrationEmail = '';
            const loginForm = document.getElementById('loginForm');
            if (loginForm) loginForm.reset();
            updateModalMode();
            showNotification('Email підтверджено, реєстрація завершена успішно.', 'Успіх', 'success', 3000);
            window.location.reload();
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
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.style.display = 'none';
            updateAuthUI(result.is_admin);
            showNotification('Ви успішно авторизувалися та зможете відстежувати статус свого замовлення!', 'Успіх', 'success', 3000);
            window.location.reload();
        } catch (error) {
            showNotification('Помилка: ' + error.message, 'Помилка', 'error', 4000);
        }
    }
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

if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
        const cart = getCart();
        if (!cart || cart.length === 0) {
            alert('Кошик порожній. Додайте товари до оформлення.');
            return;
        }
        window.location.href = '/checkout.html';
    });
}

window.addEventListener('click', (e) => {
    const cartModal = document.getElementById('cartModal');
    const chatModal = document.getElementById('chatModal');
    const loginModal = document.getElementById('loginModal');

    if (e.target === cartModal) cartModal.style.display = 'none';
    if (e.target === chatModal) chatModal.style.display = 'none';
    if (e.target === loginModal) {
        loginModal.style.display = 'none';
        resetAuthModalState();
        updateModalMode();
    }
});

function openLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        resetAuthModalState();
        loginModal.style.display = 'block';
        updateModalMode();
    }
}

// Обработчик отправки сообщений в чат
const sendChatBtn = document.getElementById('sendChatBtn');
const chatInput = document.getElementById('chatInput');
const chatAttachmentController = typeof initChatAttachmentUI === 'function' ? initChatAttachmentUI() : null;

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
        const imageFile = chatAttachmentController?.getSelectedFile?.() || null;
        if (!text && !pendingOrderHtml && !imageFile) return;

        try {
            const messageToSend = pendingOrderHtml ? pendingOrderHtml : text;
            console.log('🛒 sendChatBtn clicked, pendingOrderHtml:', !!pendingOrderHtml);
            console.log('🛒 messageToSend includes order-receipt:', messageToSend.includes('order-receipt'));
            
            await postUserChat(messageToSend, imageFile);
            chatInputAutoGrow?.reset();
            chatAttachmentController?.clear?.();
            
            if (pendingOrderHtml && messageToSend.includes('order-receipt')) {
                console.log('🛒 Order sent successfully');
                setPendingOrderChatAttention();
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
        const content = buildChatMessageContent(msg);
        const canEditMessage = msg.sender === 'user' && !content.isHtmlMessage && !content.hasImage;
        const actions = canEditMessage ? `
            <button class="edit-btn" data-message-id="${msg.id}" style="margin-left: 5px; background: none; border: none; cursor: pointer;" title="Редагувати повідомлення">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; opacity: 0.7;">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#333333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>` : '';
            
        return `<div class="chat-message ${cssClass}" style="margin-bottom:0.6rem;" data-message-id="${msg.id}">
                    <strong>${msg.sender === 'admin' ? 'Менеджер' : 'Вы'}:</strong> ${content.html}
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
            maybeClearPendingOrderChatAttention(messages);
        }
    } catch (error) {
        console.error('Помилка при завантаженні чату:', error);
        alert('Не вдалося завантажити чат. Повторіть спробу. ' + (error.message || ''));
    }
}

// Обработчик кнопки Google OAuth
const googleLoginBtn = document.getElementById('googleLoginBtn');
if (googleLoginBtn) {
    googleLoginBtn.onclick = async () => {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        await startGoogleAuth(nextPath);
    };
}






