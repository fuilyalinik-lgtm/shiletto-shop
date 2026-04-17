from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import os
from datetime import datetime, timedelta
import jwt
from werkzeug.utils import secure_filename
import uuid
from sqlalchemy import text
from mimetypes import guess_type
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='../frontend', static_url_path='/static')
CORS(app, origins=["https://shiletto-shop.onrender.com", "http://localhost:8080", "http://127.0.0.1:8080"])

logger.info("=== FLASK APP STARTED ===")

# ===== КОНФИГУРАЦИЯ =====
# Использовать переменные окружения в продакшене
ENV = os.getenv('FLASK_ENV', 'development')
DB_PATH = os.getenv('DATABASE_URL', 'sqlite:///database.db')

# Если DATABASE_URL не установлена, использовать SQLite с абсолютным путом
if DB_PATH == 'sqlite:///database.db':
    db_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
    os.makedirs(db_dir, exist_ok=True)
    DB_PATH = f'sqlite:///{db_dir}/database.db'

app.config['SQLALCHEMY_DATABASE_URI'] = DB_PATH
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')  # ИЗМЕНИТЕ!

# Папка для загрузок
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
if not os.path.isabs(UPLOAD_FOLDER):
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB

# Создать папку для загрузок
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)

# ===== МОДЕЛИ БД =====
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    telegram_id = db.Column(db.String(100), unique=True, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class UserProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True)
    full_name = db.Column(db.String(200), nullable=True)
    phone = db.Column(db.String(50), nullable=True)
    address = db.Column(db.String(500), nullable=True)
    user = db.relationship('User', backref=db.backref('profile', uselist=False))

class ContactMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User', backref='messages')

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    sender = db.Column(db.String(20), nullable=False)  # 'user' или 'admin'
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User', backref='chat_messages')

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text)
    parent_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    products = db.relationship('Product', backref='category', lazy=True, cascade='all, delete-orphan')
    children = db.relationship('Category', backref=db.backref('parent', remote_side=[id]), lazy=True, cascade='all, delete-orphan')

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    supplier_info = db.Column(db.Text, nullable=True, default='')
    price = db.Column(db.Float, nullable=False)
    drop_price = db.Column(db.Float, nullable=True)
    stock = db.Column(db.Integer, default=0)
    availability_status = db.Column(db.String(50), nullable=False, default='В наявності')
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    images = db.relationship('ProductImage', backref='product', lazy=True, cascade='all, delete-orphan')

class ProductImage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    is_main = db.Column(db.Boolean, default=False)
    order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Banner(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=True, default='')
    description = db.Column(db.Text, nullable=True, default='')
    image_filename = db.Column(db.String(255), nullable=False)
    link_url = db.Column(db.String(2048), nullable=True, default='')
    area_x = db.Column(db.Float, nullable=False, default=0.0)   # процент от 0 до 100
    area_y = db.Column(db.Float, nullable=False, default=0.0)
    area_width = db.Column(db.Float, nullable=False, default=100.0)
    area_height = db.Column(db.Float, nullable=False, default=100.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5
    comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    product = db.relationship('Product', backref='reviews')
    user = db.relationship('User', backref='reviews')

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    items_data = db.Column(db.Text, nullable=False)  # JSON с товарами
    total_price = db.Column(db.Float, nullable=False)
    recipient_phone = db.Column(db.String(50), nullable=False)
    recipient_name = db.Column(db.String(200), nullable=False)
    recipient_city = db.Column(db.String(100), nullable=False)
    delivery_method = db.Column(db.String(50), nullable=False)  # 'postal', 'courier', etc.
    postal_branch_number = db.Column(db.String(20), nullable=True)
    payment_method = db.Column(db.String(50), nullable=False)  # 'cod', 'card', etc.
    status = db.Column(db.String(50), default='pending')  # 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User', backref='orders')

class GuestOrder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    guest_phone = db.Column(db.String(50), nullable=False)
    guest_name = db.Column(db.String(200), nullable=False)
    guest_city = db.Column(db.String(100), nullable=False)
    items_data = db.Column(db.Text, nullable=False)  # JSON с товарами
    total_price = db.Column(db.Float, nullable=False)
    delivery_method = db.Column(db.String(50), nullable=False)  # 'postal', 'courier', etc.
    postal_branch_number = db.Column(db.String(20), nullable=True)
    payment_method = db.Column(db.String(50), nullable=False)  # 'cod', 'card', etc.
    status = db.Column(db.String(50), default='pending')  # 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class GuestChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    guest_identifier = db.Column(db.String(255), nullable=False)  # Session ID или другой идентификатор гостя
    guest_phone = db.Column(db.String(50), nullable=True)  # Номер телефона гостя (может быть получен из заказа)
    sender = db.Column(db.String(20), nullable=False)  # 'guest' или 'admin'
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
from werkzeug.security import generate_password_hash, check_password_hash

def create_token(user_id, expires_in=24):
    """Создает JWT токен"""
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(hours=expires_in)
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

def verify_token(token):
    """Проверяет JWT токен"""
    try:
        payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        return payload['user_id']
    except:
        return None

def token_required(f):
    """Декоратор для защиты маршрутов"""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': 'Token missing'}), 401
        
        user_id = verify_token(token)
        if not user_id:
            return jsonify({'error': 'Invalid token'}), 401
        
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    """Декоратор для проверки прав админа"""
    from functools import wraps
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        user = User.query.get(request.user_id)
        if not user or not user.is_admin:
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated

# ===== МАРШРУТИ: РЕЄСТРАЦІЯ І ВХІД =====
@app.route('/api/auth/register', methods=['POST'])
def register():
    logger.info("=== REGISTER ENDPOINT CALLED ===")
    data = request.json
    logger.info(f"Register data: {data}")
    
    if User.query.filter_by(email=data['email']).first():
        logger.info(f"Email {data['email']} already registered")
        return jsonify({'error': 'Email already registered'}), 400
    
    user = User(
        username=data['username'],
        email=data['email'],
        password_hash=generate_password_hash(data['password'])
    )
    db.session.add(user)
    db.session.commit()
    
    token = create_token(user.id)
    logger.info(f"User registered successfully, id: {user.id}, token created")
    return jsonify({'token': token, 'user_id': user.id}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(email=data['email']).first()
    
    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    token = create_token(user.id)
    return jsonify({'token': token, 'is_admin': user.is_admin, 'user_id': user.id}), 200

@app.route('/api/auth/me', methods=['GET'])
@token_required
def me():
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    profile = UserProfile.query.filter_by(user_id=user.id).first()
    return jsonify({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'is_admin': user.is_admin,
        'profile': {
            'full_name': profile.full_name if profile else None,
            'phone': profile.phone if profile else None,
            'address': profile.address if profile else None
        }
    }), 200

@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_user_profile():
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    profile = UserProfile.query.filter_by(user_id=user.id).first()
    if not profile:
        profile = UserProfile(user_id=user.id)
        db.session.add(profile)
        db.session.commit()

    return jsonify({
        'user_id': user.id,
        'username': user.username,
        'email': user.email,
        'profile': {
            'full_name': profile.full_name,
            'phone': profile.phone,
            'address': profile.address
        }
    }), 200

@app.route('/api/user/profile', methods=['PUT'])
@token_required
def update_user_profile():
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.json
    profile = UserProfile.query.filter_by(user_id=user.id).first()
    if not profile:
        profile = UserProfile(user_id=user.id)
        db.session.add(profile)

    profile.full_name = data.get('full_name', profile.full_name)
    profile.phone = data.get('phone', profile.phone)
    profile.address = data.get('address', profile.address)
    db.session.commit()

    return jsonify({'message': 'Profile updated'}), 200

@app.route('/api/user/contact', methods=['POST'])
@token_required
def send_contact_message():
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.json
    text = data.get('message')
    if not text or not text.strip():
        return jsonify({'error': 'Message is required'}), 400

    msg = ContactMessage(user_id=user.id, message=text.strip())
    db.session.add(msg)
    db.session.commit()

    # Здесь можно отправить уведомление менеджеру (например через email/telegram)
    return jsonify({'message': 'Сообщение отправлено менеджеру'}), 201

@app.route('/api/user/chat', methods=['GET'])
@token_required
def get_user_chat():
    logger.info(f"GET /api/user/chat for user_id: {request.user_id}")
    user = User.query.get(request.user_id)
    if not user:
        logger.info(f"User not found: {request.user_id}")
        return jsonify({'error': 'User not found'}), 404

    messages = ChatMessage.query.filter_by(user_id=user.id).order_by(ChatMessage.created_at).all()
    logger.info(f"Found {len(messages)} messages for user {user.id}")
    
    # Якщо чат порожній, додати привітальне повідомлення від адміна
    if not messages:
        welcome_message = ChatMessage(
            user_id=user.id,
            sender='admin',
            message='Вітаю! Мене звати Влад, я менеджер інтернет-магазину SHILETTO SHOP. Чим можу допомогти?'
        )
        db.session.add(welcome_message)
        db.session.commit()
        messages = [welcome_message]  # Обновить список сообщений
    
    # Логируем информацию о сообщениях
    for i, msg in enumerate(messages):
        is_html = '<div' in msg.message or '<span' in msg.message or 'order-receipt' in msg.message
        logger.info(f"Message {i+1}: sender={msg.sender}, length={len(msg.message)}, is_html={is_html}")
        if is_html:
            logger.info(f"  HTML message preview: {msg.message[:200]}...")
    
    return jsonify([{
        'id': m.id,
        'user_id': m.user_id,
        'sender': m.sender,
        'message': m.message,
        'created_at': m.created_at.replace(microsecond=0).isoformat() + 'Z'
    } for m in messages]), 200

@app.route('/api/user/chat', methods=['POST'])
@token_required
def post_user_chat():
    logger.info("=== POST USER CHAT ENDPOINT CALLED ===")
    logger.info(f"POST /api/user/chat for user_id: {request.user_id}")
    user = User.query.get(request.user_id)
    if not user:
        logger.info(f"User not found: {request.user_id}")
        return jsonify({'error': 'User not found'}), 404

    data = request.json
    text = data.get('message')
    logger.info(f"Received message: {text[:100]}... (length: {len(text) if text else 0})")
    
    if not text or not text.strip():
        logger.info("Message is empty or None")
        return jsonify({'error': 'Message is required'}), 400

    # Проверяем, содержит ли сообщение HTML
    is_html = '<div' in text or '<span' in text or 'order-receipt' in text
    logger.info(f"Message contains HTML: {is_html}")

    chat_msg = ChatMessage(user_id=user.id, sender='user', message=text.strip(), is_read=False)
    db.session.add(chat_msg)

    # Сохраняем также как контактное сообщение, чтобы админ мог увидеть исходящие запросы пользователей
    contact_msg = ContactMessage(user_id=user.id, message=text.strip())
    db.session.add(contact_msg)

    try:
        db.session.commit()
        logger.info(f"Message saved successfully, chat_msg.id: {chat_msg.id}")
        return jsonify({'message': 'Сообщение отправлено в чат и передано менеджеру'}), 201
    except Exception as e:
        logger.error(f"Error saving message: {e}")
        db.session.rollback()
        return jsonify({'error': 'Failed to save message'}), 500

@app.route('/api/admin/chat/<int:user_id>', methods=['GET'])
@admin_required
def get_admin_chat_for_user(user_id):
    try:
        target = User.query.get(user_id)
        if not target:
            return jsonify({'error': 'User not found'}), 404

        # Отметить все пользовательские сообщения как прочитанные при открытии диалога (если столбец is_read есть)
        try:
            ChatMessage.query.filter_by(user_id=target.id, sender='user', is_read=False).update({'is_read': True})
            db.session.commit()
        except Exception:
            db.session.rollback()

        messages = ChatMessage.query.filter_by(user_id=target.id).order_by(ChatMessage.created_at).all()
        result = []
        for m in messages:
            created = m.created_at or datetime.utcnow()
            result.append({
                'id': m.id,
                'user_id': m.user_id,
                'sender': m.sender,
                'message': m.message,
                'created_at': created.replace(microsecond=0).isoformat() + 'Z'
            })

        return jsonify(result), 200
    except Exception as e:
        db.session.rollback()
        app.logger.error('Error in get_admin_chat_for_user: %s', e, exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/chat', methods=['GET'])
@admin_required
def get_admin_chat():
    messages = ChatMessage.query.order_by(ChatMessage.created_at).all()
    return jsonify([{
        'id': m.id,
        'user_id': m.user_id,
        'username': m.user.username if m.user else None,
        'sender': m.sender,
        'message': m.message,
        'created_at': m.created_at.replace(microsecond=0).isoformat() + 'Z'
    } for m in messages]), 200


@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_admin_users():
    users = User.query.filter_by(is_admin=False).all()
    data = []
    for u in users:
        unread_count = 0
        last_unread_time = None
        try:
            last_unread = ChatMessage.query.filter_by(user_id=u.id, sender='user', is_read=False).order_by(ChatMessage.created_at.desc()).first()
            if last_unread:
                unread_count = ChatMessage.query.filter_by(user_id=u.id, sender='user', is_read=False).count()
                last_unread_time = last_unread.created_at.replace(microsecond=0).isoformat() + 'Z'
        except Exception:
            # в случае отсутствия колонки is_read или иной ошибки - игнорируем
            unread_count = 0

        data.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'full_name': u.profile.full_name if getattr(u, 'profile', None) else None,
            'display_name': (u.profile.full_name.strip() if getattr(u, 'profile', None) and u.profile.full_name and u.profile.full_name.strip() else f'User #{u.id}'),
            'unread_count': unread_count,
            'last_unread_time': last_unread_time
        })

    return jsonify(data), 200


@app.route('/api/admin/chat/<int:user_id>', methods=['POST'])
@admin_required
def post_admin_chat(user_id):
    target = User.query.get(user_id)
    if not target:
        return jsonify({'error': 'User not found'}), 404

    data = request.json
    text = data.get('message')
    if not text or not text.strip():
        return jsonify({'error': 'Message is required'}), 400

    chat_msg = ChatMessage(user_id=target.id, sender='admin', message=text.strip())
    db.session.add(chat_msg)
    db.session.commit()

    return jsonify({'message': 'Ответ отправлен пользователю'}), 201

@app.route('/api/user/chat/<int:message_id>', methods=['DELETE'])
@token_required
def delete_user_chat_message(message_id):
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    message = ChatMessage.query.get(message_id)
    if not message:
        return jsonify({'error': 'Message not found'}), 404

    if message.user_id != user.id or message.sender != 'user':
        return jsonify({'error': 'You can only delete your own messages'}), 403

    db.session.delete(message)
    db.session.commit()

    return jsonify({'message': 'Message deleted'}), 200

@app.route('/api/user/chat/<int:message_id>', methods=['PUT'])
@token_required
def update_user_chat_message(message_id):
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    message = ChatMessage.query.get(message_id)
    if not message:
        return jsonify({'error': 'Message not found'}), 404

    if message.user_id != user.id or message.sender != 'user':
        return jsonify({'error': 'You can only edit your own messages'}), 403

    data = request.json
    new_text = data.get('message')
    if not new_text or not new_text.strip():
        return jsonify({'error': 'Message is required'}), 400

    message.message = new_text.strip()
    db.session.commit()

    return jsonify({'message': 'Message updated'}), 200

@app.route('/api/admin/contacts', methods=['GET'])
@admin_required
def list_contact_messages():
    messages = ContactMessage.query.order_by(ContactMessage.created_at.desc()).all()
    return jsonify([{
        'id': m.id,
        'user_id': m.user_id,
        'user_email': m.user.email if m.user else None,
        'message': m.message,
        'created_at': m.created_at.isoformat()
    } for m in messages]), 200

# ===== МАРШРУТЫ: КАТЕГОРИИ ===== 
@app.route('/api/categories', methods=['GET'])
def get_categories():
    categories = Category.query.all()
    return jsonify([{
        'id': c.id,
        'name': c.name,
        'description': c.description,
        'parent_id': c.parent_id,
        'parent_name': c.parent.name if c.parent else None
    } for c in categories])

@app.route('/api/categories', methods=['POST'])
@admin_required
def create_category():
    data = request.json
    name = data.get('name')
    description = data.get('description', '')
    parent_id = data.get('parent_id')

    if not name:
        return jsonify({'error': 'Название категории обязательно'}), 400

    parent = None
    if parent_id is not None:
        parent = Category.query.filter_by(id=parent_id, parent_id=None).first()
        if not parent:
            return jsonify({'error': 'Родительская категория не найдена или не является основной'}), 400

    category = Category(name=name, description=description, parent_id=parent_id)
    db.session.add(category)
    db.session.commit()
    return jsonify({'id': category.id}), 201

@app.route('/api/categories/<int:id>', methods=['DELETE'])
@admin_required
def delete_category(id):
    category = Category.query.get_or_404(id)
    db.session.delete(category)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 204

# ===== МАРШРУТЫ: ТОВАРЫ =====
def get_user_from_token():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return None
    user_id = verify_token(token)
    if not user_id:
        return None
    return User.query.get(user_id)


@app.route('/api/products', methods=['GET'])
def get_products():
    category_id = request.args.get('category_id')
    query = Product.query
    if category_id:
        query = query.filter_by(category_id=category_id)
    
    current_user = get_user_from_token()
    is_admin = current_user.is_admin if current_user else False

    products = query.all()
    result = []
    for p in products:
        images = [{'url': f'/uploads/{img.filename}', 'is_main': img.is_main, 'id': img.id, 'order': img.order} for img in sorted(p.images, key=lambda x: (x.order, not x.is_main, x.created_at))]
        prod_data = {
            'id': p.id,
            'name': p.name,
            'description': p.description,
            'price': p.price,
            'availability_status': p.availability_status,
            'category_id': p.category_id,
            'images': images
        }

        if is_admin:
            prod_data['stock'] = p.stock
        if is_admin:
            prod_data['supplier_info'] = p.supplier_info
        result.append(prod_data)
    return jsonify(result)

@app.route('/api/products', methods=['POST'])
@admin_required
def create_product():
    try:
        # Обработка multipart/form-data с файлами
        name = request.form.get('name')
        description = request.form.get('description', '').strip()
        supplier_info = request.form.get('supplier_info', '').strip()
        availability_status = request.form.get('availability_status', 'В наявності')
        price = float(request.form.get('price'))
        drop_price = request.form.get('drop_price')
        if drop_price:
            drop_price = float(drop_price)
        else:
            drop_price = None
        stock = int(request.form.get('stock', 0))
        category_id = int(request.form.get('category_id'))
        
        product = Product(
            name=name,
            description=description,
            supplier_info=supplier_info,
            availability_status=availability_status,
            price=price,
            drop_price=drop_price,
            category_id=category_id,
            stock=stock
        )
        db.session.add(product)
        db.session.flush()  # Получить id продукта
        
        # Обработка загруженных файлов
        images = request.files.getlist('images')
        main_image_index = int(request.form.get('main_image_index', 0))
        for i, file in enumerate(images[:15]):
            if file and file.filename:
                # Проверка расширения файла
                allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
                if '.' in file.filename:
                    ext = file.filename.rsplit('.', 1)[1].lower()
                    if ext in allowed_extensions:
                        # Генерируем уникальное имя файла
                        filename = f"{uuid.uuid4().hex}.{ext}"
                        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                        file.save(filepath)
                        product_image = ProductImage(product_id=product.id, filename=filename, is_main=(i == main_image_index), order=i)
                        db.session.add(product_image)
        
        db.session.commit()
        return jsonify({'id': product.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/products/<int:id>', methods=['GET'])
def get_product(id):
    try:
        product = Product.query.get_or_404(id)
        images = ProductImage.query.filter_by(product_id=id).order_by(ProductImage.order).all()
        
        # Проверяем токен опционально для админских полей
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        is_admin = False
        if token:
            user_id = verify_token(token)
            if user_id:
                user = User.query.get(user_id)
                if user and user.is_admin:
                    is_admin = True
        
        response = {
            'id': product.id,
            'name': product.name,
            'description': product.description,
            'price': product.price,
            'stock': product.stock,
            'availability_status': product.availability_status,
            'category': product.category.name if product.category else None,
            'images': [{'id': img.id, 'url': f'/uploads/{img.filename}', 'is_main': img.is_main} for img in images],
            'created_at': product.created_at.isoformat(),
            'updated_at': product.updated_at.isoformat()
        }
        if is_admin:
            if product.drop_price is not None:
                response['drop_price'] = product.drop_price
            if product.supplier_info:
                response['supplier_info'] = product.supplier_info
        return jsonify(response)
    except Exception as e:
        print(f'Error in get_product({id}): {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/<int:id>', methods=['PUT'])
@admin_required
def update_product(id):
    product = Product.query.get_or_404(id)
    try:
        # Обработка multipart/form-data с файлами
        name = request.form.get('name', product.name)
        description = request.form.get('description', product.description)
        supplier_info = request.form.get('supplier_info', product.supplier_info)
        availability_status = request.form.get('availability_status', product.availability_status)
        price = float(request.form.get('price', product.price))
        drop_price = request.form.get('drop_price')
        if drop_price:
            drop_price = float(drop_price)
        else:
            drop_price = None
        stock = int(request.form.get('stock', product.stock))
        category_id = int(request.form.get('category_id', product.category_id))
        main_image_id = request.form.get('main_image_id')
        
        product.name = name
        product.description = description
        product.supplier_info = supplier_info
        product.availability_status = availability_status
        product.price = price
        product.drop_price = drop_price
        product.stock = stock
        product.category_id = category_id
        
        # Обработка загруженных файлов - заменяем все изображения
        images = request.files.getlist('images')
        if images and any(img.filename for img in images):
            # Удаляем старые изображения
            for img in product.images:
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], img.filename)
                if os.path.exists(filepath):
                    os.remove(filepath)
            # Удаляем записи из БД
            ProductImage.query.filter_by(product_id=product.id).delete()
            
            # Добавляем новые
            for i, file in enumerate(images[:15]):
                if file and file.filename:
                    allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
                    if '.' in file.filename:
                        ext = file.filename.rsplit('.', 1)[1].lower()
                        if ext in allowed_extensions:
                            filename = f"{uuid.uuid4().hex}.{ext}"
                            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                            file.save(filepath)
                            product_image = ProductImage(product_id=product.id, filename=filename, is_main=(i == 0), order=i)
                            db.session.add(product_image)
        elif main_image_id:
            # Обновляем основное изображение среди существующих
            ProductImage.query.filter_by(product_id=product.id).update({'is_main': False})
            img = ProductImage.query.filter_by(id=int(main_image_id), product_id=product.id).first()
            if img:
                img.is_main = True
        
        db.session.commit()
        return jsonify({'message': 'Updated'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/products/<int:id>', methods=['DELETE'])
@admin_required
def delete_product(id):
    product = Product.query.get_or_404(id)
    db.session.delete(product)
    db.session.commit()
    return jsonify({'message': 'Deleted'}), 204

@app.route('/api/products/<int:product_id>/images/order', methods=['PUT'])
@admin_required
def update_product_images_order(product_id):
    data = request.json
    image_orders = data.get('orders', [])
    
    for order_data in image_orders:
        img_id = order_data['id']
        order = order_data['order']
        img = ProductImage.query.filter_by(id=img_id, product_id=product_id).first()
        if img:
            img.order = order
    
    db.session.commit()
    return jsonify({'message': 'Order updated'})

# ===== МАРШРУТЫ: ОТЗЫВЫ =====
@app.route('/api/products/<int:product_id>/reviews', methods=['GET'])
def get_product_reviews(product_id):
    reviews = Review.query.filter_by(product_id=product_id).order_by(Review.created_at.desc()).all()
    return jsonify([{
        'id': r.id,
        'user': r.user.username,
        'rating': r.rating,
        'comment': r.comment,
        'created_at': r.created_at.isoformat()
    } for r in reviews])

@app.route('/api/products/<int:product_id>/reviews', methods=['POST'])
@token_required
def add_product_review(product_id):
    current_user = User.query.get(request.user_id)
    if not current_user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.json
    rating = data.get('rating')
    comment = data.get('comment', '')
    
    if not rating or not (1 <= rating <= 5):
        return jsonify({'error': 'Rating must be between 1 and 5'}), 400
    
    review = Review(
        product_id=product_id,
        user_id=current_user.id,
        rating=rating,
        comment=comment
    )
    db.session.add(review)
    db.session.commit()
    
    return jsonify({
        'id': review.id,
        'user': current_user.username,
        'rating': review.rating,
        'comment': review.comment,
        'created_at': review.created_at.isoformat()
    }), 201

# ===== МАРШРУТЫ: БАННЕРЫ =====
@app.route('/api/banners', methods=['GET'])
def get_banners():
    banners = Banner.query.all()
    return jsonify([{
        'id': b.id,
        'image': f'/uploads/{b.image_filename}' if b.image_filename else None,
        'link_url': b.link_url or '',
        'area_x': b.area_x,
        'area_y': b.area_y,
        'area_width': b.area_width,
        'area_height': b.area_height
    } for b in banners])

@app.route('/api/banners/all', methods=['GET'])
@admin_required
def get_all_banners():
    banners = Banner.query.all()
    return jsonify([{
        'id': b.id,
        'image_filename': b.image_filename,
        'link_url': b.link_url or '',
        'area_x': b.area_x,
        'area_y': b.area_y,
        'area_width': b.area_width,
        'area_height': b.area_height
    } for b in banners])

@app.route('/api/banners', methods=['POST'])
@admin_required
def create_banner():
    try:
        image_filename = None
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename:
                allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
                if '.' in file.filename:
                    ext = file.filename.rsplit('.', 1)[1].lower()
                    if ext in allowed_extensions:
                        filename = f"{uuid.uuid4().hex}.{ext}"
                        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                        file.save(filepath)
                        image_filename = filename
        
        if not image_filename:
            return jsonify({'error': 'Изображение не загружено'}), 400
        
        # backup values для существующей структуры таблицы
        title = request.form.get('title', '')
        description = request.form.get('description', '')
        link_url = request.form.get('link_url', '')

        try:
            area_x = float(request.form.get('area_x', 0))
            area_y = float(request.form.get('area_y', 0))
            area_width = float(request.form.get('area_width', 100))
            area_height = float(request.form.get('area_height', 100))
        except ValueError:
            return jsonify({'error': 'Параметры области должны быть числами'}), 400

        area_x = max(0, min(100, area_x))
        area_y = max(0, min(100, area_y))
        area_width = max(1, min(100, area_width))
        area_height = max(1, min(100, area_height))

        banner = Banner(
            title=title,
            description=description,
            image_filename=image_filename,
            link_url=link_url,
            area_x=area_x,
            area_y=area_y,
            area_width=area_width,
            area_height=area_height
        )
        db.session.add(banner)
        db.session.commit()
        return jsonify({'id': banner.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400



@app.route('/api/banners/<int:id>', methods=['DELETE'])
@admin_required
def delete_banner(id):
    try:
        banner = Banner.query.get_or_404(id)
        db.session.delete(banner)
        db.session.commit()
        return jsonify({'message': 'Deleted'}), 204
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

# ===== МАРШРУТЫ: ЗАГРУЖЕННЫЕ ФАЙЛЫ =====
@app.route('/uploads/<path:filename>')
def download_file(filename):
    print('DOWNLOAD_FILE', filename)
    upload_dir = app.config['UPLOAD_FOLDER']
    abs_upload_dir = os.path.abspath(upload_dir)
    file_path = os.path.join(abs_upload_dir, filename)
    print('UPLOAD_DIR', upload_dir, abs_upload_dir)
    print('FILE_PATH', file_path, os.path.isfile(file_path), os.path.getsize(file_path) if os.path.isfile(file_path) else None)
    if not os.path.isfile(file_path):
        print('UPLOAD NOT FOUND', file_path)
        abort(404)

    mime = guess_type(file_path)[0] or 'application/octet-stream'
    return send_from_directory(abs_upload_dir, filename, mimetype=mime)

# ===== МАРШРУТЫ: СТАТИЧНЫЕ ФАЙЛЫ =====
@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/about')
def about():
    return send_from_directory('../frontend', 'about.html')

@app.route('/contact')
def contact():
    return send_from_directory('../frontend', 'contact.html')

@app.route('/admin/dashboard')
def admin_dashboard():
    return send_from_directory('../frontend', 'admin/dashboard.html')

@app.route('/chat')
def chat_page():
    return send_from_directory('../frontend', 'chat.html')

@app.route('/<path:path>')
def static_files(path):
    if path.startswith('uploads/'):
        return download_file(path[len('uploads/'):])
    return send_from_directory('../frontend', path)

# Переносим миграцию is_read в before_request для совместимости со старой версией Flask
_migration_checked = False

@app.before_request
def ensure_chat_message_is_read_column():
    global _migration_checked
    if _migration_checked:
        return
    _migration_checked = True

    try:
        result = db.session.execute("PRAGMA table_info(chat_message)").fetchall()
        columns = [row[1] for row in result]
        if 'is_read' not in columns:
            db.session.execute("ALTER TABLE chat_message ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0")
            db.session.commit()
            app.logger.info('Добавлена колонка is_read для chat_message')
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию chat_message.is_read: %s', e)

    # Миграция для product.drop_price
    try:
        result = db.session.execute(text("PRAGMA table_info(product)")).fetchall()
        columns = [row[1] for row in result]
        if 'drop_price' not in columns:
            db.session.execute(text("ALTER TABLE product ADD COLUMN drop_price FLOAT"))
            db.session.commit()
            app.logger.info('Добавлена колонка drop_price для product')
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию product.drop_price: %s', e)

    # Миграция для product_image.is_main
    try:
        result = db.session.execute(text("PRAGMA table_info(product_image)")).fetchall()
        columns = [row[1] for row in result]
        print(f"product_image columns: {columns}")
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию product_image.is_main: %s', e)

# ===== МАРШРУТЫ: ЗАКАЗЫ =====
@app.route('/api/orders', methods=['POST'])
@token_required
def create_order():
    """Создать заказ для зарегистрированного пользователя"""
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.json
    items_data = data.get('items_data')  # JSON string
    total_price = data.get('total_price')
    recipient_phone = data.get('recipient_phone')
    recipient_name = data.get('recipient_name')
    recipient_city = data.get('recipient_city')
    delivery_method = data.get('delivery_method')
    postal_branch_number = data.get('postal_branch_number')
    payment_method = data.get('payment_method')
    
    if not all([items_data, total_price, recipient_phone, recipient_name, recipient_city, delivery_method, payment_method]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    order = Order(
        user_id=user.id,
        items_data=items_data,
        total_price=total_price,
        recipient_phone=recipient_phone,
        recipient_name=recipient_name,
        recipient_city=recipient_city,
        delivery_method=delivery_method,
        postal_branch_number=postal_branch_number,
        payment_method=payment_method
    )
    db.session.add(order)
    db.session.commit()
    
    return jsonify({
        'id': order.id,
        'message': 'Order created successfully'
    }), 201

@app.route('/api/user/orders', methods=['GET'])
@token_required
def get_user_orders():
    """Получить все заказы пользователя"""
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    orders = Order.query.filter_by(user_id=user.id).order_by(Order.created_at.desc()).all()
    return jsonify([{
        'id': o.id,
        'items_data': o.items_data,
        'total_price': o.total_price,
        'recipient_phone': o.recipient_phone,
        'recipient_name': o.recipient_name,
        'recipient_city': o.recipient_city,
        'delivery_method': o.delivery_method,
        'postal_branch_number': o.postal_branch_number,
        'payment_method': o.payment_method,
        'status': o.status,
        'created_at': o.created_at.isoformat()
    } for o in orders]), 200

@app.route('/api/admin/orders', methods=['GET'])
@admin_required
def get_all_orders():
    """Получить все заказы (админ)"""
    orders = Order.query.order_by(Order.created_at.desc()).all()
    return jsonify([{
        'id': o.id,
        'user_id': o.user_id,
        'user_email': o.user.email if o.user else None,
        'items_data': o.items_data,
        'total_price': o.total_price,
        'recipient_phone': o.recipient_phone,
        'recipient_name': o.recipient_name,
        'recipient_city': o.recipient_city,
        'delivery_method': o.delivery_method,
        'payment_method': o.payment_method,
        'status': o.status,
        'created_at': o.created_at.isoformat()
    } for o in orders]), 200

# ===== МАРШРУТЫ: ГОСТЕВЫЕ ЗАКАЗЫ =====
@app.route('/api/guest/order', methods=['POST'])
def create_guest_order():
    """Создать заказ для незарегистрированного пользователя"""
    data = request.json
    items_data = data.get('items_data')
    total_price = data.get('total_price')
    guest_phone = data.get('guest_phone')
    guest_name = data.get('guest_name')
    guest_city = data.get('guest_city')
    delivery_method = data.get('delivery_method')
    postal_branch_number = data.get('postal_branch_number')
    payment_method = data.get('payment_method')
    guest_identifier = data.get('guest_identifier')
    
    if not all([items_data, total_price, guest_phone, guest_name, guest_city, delivery_method, payment_method, guest_identifier]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    guest_order = GuestOrder(
        guest_phone=guest_phone,
        guest_name=guest_name,
        guest_city=guest_city,
        items_data=items_data,
        total_price=total_price,
        delivery_method=delivery_method,
        postal_branch_number=postal_branch_number,
        payment_method=payment_method
    )
    db.session.add(guest_order)
    db.session.commit()
    
    # Автоматически создать приветственное сообщение в гостевом чате
    welcome_msg = GuestChatMessage(
        guest_identifier=guest_identifier,
        guest_phone=guest_phone,
        sender='admin',
        message=f'Товари замовлені на номер {guest_phone}. Менеджер звʼяжеться з вами найменше трохи часу. Дякуємо за замовлення!'
    )
    db.session.add(welcome_msg)
    db.session.commit()
    
    return jsonify({
        'id': guest_order.id,
        'message': 'Guest order created successfully'
    }), 201

@app.route('/api/admin/guest-orders', methods=['GET'])
@admin_required
def get_guest_orders():
    """Получить все гостевые заказы (админ)"""
    orders = GuestOrder.query.order_by(GuestOrder.created_at.desc()).all()
    return jsonify([{
        'id': o.id,
        'guest_phone': o.guest_phone,
        'guest_name': o.guest_name,
        'guest_city': o.guest_city,
        'items_data': o.items_data,
        'total_price': o.total_price,
        'delivery_method': o.delivery_method,
        'postal_branch_number': o.postal_branch_number,
        'payment_method': o.payment_method,
        'status': o.status,
        'created_at': o.created_at.isoformat()
    } for o in orders]), 200

# ===== МАРШРУТЫ: ГОСТЕВОЙ ЧАТ =====
@app.route('/api/guest/chat', methods=['GET'])
def get_guest_chat():
    """Получить чат гостя (по guest_identifier)"""
    guest_identifier = request.args.get('guest_identifier')
    if not guest_identifier:
        return jsonify({'error': 'guest_identifier is required'}), 400
    
    messages = GuestChatMessage.query.filter_by(guest_identifier=guest_identifier).order_by(GuestChatMessage.created_at).all()
    
    # Если чат пуст, создать приветственное сообщение
    if not messages:
        welcome_message = GuestChatMessage(
            guest_identifier=guest_identifier,
            sender='admin',
            message='Здравствуйте! Вківаємо у наш магазин. Чим ми можемо вам допомогти?'
        )
        db.session.add(welcome_message)
        db.session.commit()
        messages = [welcome_message]
    
    return jsonify([{
        'id': m.id,
        'sender': m.sender,
        'message': m.message,
        'created_at': m.created_at.replace(microsecond=0).isoformat() + 'Z'
    } for m in messages]), 200

@app.route('/api/guest/chat', methods=['POST'])
def post_guest_chat():
    """Отправить сообщение в гостевой чат"""
    guest_identifier = request.args.get('guest_identifier')
    if not guest_identifier:
        return jsonify({'error': 'guest_identifier is required'}), 400
    
    data = request.json
    message = data.get('message')
    if not message or not message.strip():
        return jsonify({'error': 'Message is required'}), 400
    
    # Получить номер телефона из последнего заказа этого гостя
    guest_phone = None
    last_order = GuestOrder.query.order_by(GuestOrder.created_at.desc()).first()
    if last_order:
        guest_phone = last_order.guest_phone
    
    chat_msg = GuestChatMessage(
        guest_identifier=guest_identifier,
        guest_phone=guest_phone,
        sender='guest',
        message=message.strip(),
        is_read=False
    )
    db.session.add(chat_msg)
    db.session.commit()
    
    return jsonify({'message': 'Message sent successfully'}), 201

@app.route('/api/admin/guest-chat', methods=['GET'])
@admin_required
def get_admin_guest_chat():
    """Получить общий чат со всеми гостями (для админа)"""
    messages = GuestChatMessage.query.order_by(GuestChatMessage.created_at).all()
    
    # Отметить все непрочитанные гостевые сообщения как прочитанные
    GuestChatMessage.query.filter_by(sender='guest', is_read=False).update({'is_read': True})
    db.session.commit()
    
    return jsonify([{
        'id': m.id,
        'guest_identifier': m.guest_identifier,
        'guest_phone': m.guest_phone,
        'sender': m.sender,
        'message': m.message,
        'created_at': m.created_at.replace(microsecond=0).isoformat() + 'Z'
    } for m in messages]), 200

@app.route('/api/admin/guest-chat', methods=['POST'])
@admin_required
def post_admin_guest_chat():
    """Отправить сообщение в общий гостевой чат"""
    data = request.json
    guest_identifier = data.get('guest_identifier')
    message = data.get('message')
    
    if not guest_identifier or not message:
        return jsonify({'error': 'guest_identifier and message are required'}), 400
    
    if not message.strip():
        return jsonify({'error': 'Message cannot be empty'}), 400
    
    chat_msg = GuestChatMessage(
        guest_identifier=guest_identifier,
        sender='admin',
        message=message.strip()
    )
    db.session.add(chat_msg)
    db.session.commit()
    
    return jsonify({'message': 'Answer sent successfully'}), 201

@app.route('/api/admin/guest-chat-users', methods=['GET'])
@admin_required
def get_guest_chat_users():
    """Получить список уникальных гостей с их последним сообщением (для админа)"""
    # Получить все уникальные guest_identifier
    all_messages = GuestChatMessage.query.all()
    guests_dict = {}
    
    for msg in all_messages:
        if msg.guest_identifier not in guests_dict:
            unread_count = 0
            last_unread_time = None
            try:
                last_unread = GuestChatMessage.query.filter_by(
                    guest_identifier=msg.guest_identifier,
                    sender='guest',
                    is_read=False
                ).order_by(GuestChatMessage.created_at.desc()).first()
                if last_unread:
                    unread_count = GuestChatMessage.query.filter_by(
                        guest_identifier=msg.guest_identifier,
                        sender='guest',
                        is_read=False
                    ).count()
                    last_unread_time = last_unread.created_at.replace(microsecond=0).isoformat() + 'Z'
            except Exception:
                pass
            guests_dict[msg.guest_identifier] = {
                'guest_identifier': msg.guest_identifier,
                'guest_phone': msg.guest_phone,
                'unread_count': unread_count,
                'last_unread_time': last_unread_time
            }
    
    return jsonify(list(guests_dict.values())), 200


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=8080, debug=True)

    # Миграция для product.supplier_info и availability_status
    try:
        result = db.session.execute(text("PRAGMA table_info(product)")).fetchall()
        columns = [row[1] for row in result]
        if 'supplier_info' not in columns:
            db.session.execute(text("ALTER TABLE product ADD COLUMN supplier_info TEXT DEFAULT ''"))
            db.session.commit()
            print('Добавлена колонка supplier_info для product')
        else:
            print('Колонка supplier_info уже есть')

        if 'availability_status' not in columns:
            db.session.execute(text("ALTER TABLE product ADD COLUMN availability_status TEXT DEFAULT 'В наявності'"))
            db.session.commit()
            print('Добавлена колонка availability_status для product')
        else:
            print('Колонка availability_status уже есть')

        if 'drop_price' not in columns:
            db.session.execute(text("ALTER TABLE product ADD COLUMN drop_price REAL"))
            db.session.commit()
            print('Добавлена колонка drop_price для product')
        else:
            print('Колонка drop_price уже есть')
    except Exception as e:
        db.session.rollback()
        print(f'Помилка міграції product.supplier_info/availability_status/drop_price: {e}')

    # Миграция для category.parent_id
    try:
        result = db.session.execute(text("PRAGMA table_info(category)")).fetchall()
        columns = [row[1] for row in result]
        if 'parent_id' not in columns:
            db.session.execute(text("ALTER TABLE category ADD COLUMN parent_id INTEGER"))
            db.session.commit()
            print('Добавлена колонка parent_id для category')
        else:
            print('Колонка parent_id уже есть')
    except Exception as e:
        db.session.rollback()
        print(f'Помилка міграції category.parent_id: {e}')

# ===== ИНИЦИАЛИЗАЦИЯ =====
if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # Создать таблицы

        # В sqlite: если добавлен новый столбец is_read, попытаться создать
        try:
            pragma_res = db.session.execute(text("PRAGMA table_info(chat_message)")).fetchall()
            column_names = [row[1] for row in pragma_res]
            if 'is_read' not in column_names:
                db.session.execute(text("ALTER TABLE chat_message ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0"))
                db.session.commit()
        except Exception as e:
            # Если что-то идет не так, продолжаем, т.к. таблица может не поддерживать изменение либо у неё уже есть колонка
            print('PRAGMA/ALTER TABLE error:', e)
            db.session.rollback()

        # В sqlite: если добавлены поля баннера, попытаться создать
        try:
            pragma_res = db.session.execute(text("PRAGMA table_info(banner)")).fetchall()
            column_names = [row[1] for row in pragma_res]
            if 'link_url' not in column_names:
                db.session.execute(text("ALTER TABLE banner ADD COLUMN link_url TEXT DEFAULT ''"))
            if 'area_x' not in column_names:
                db.session.execute(text("ALTER TABLE banner ADD COLUMN area_x REAL NOT NULL DEFAULT 0.0"))
            if 'area_y' not in column_names:
                db.session.execute(text("ALTER TABLE banner ADD COLUMN area_y REAL NOT NULL DEFAULT 0.0"))
            if 'area_width' not in column_names:
                db.session.execute(text("ALTER TABLE banner ADD COLUMN area_width REAL NOT NULL DEFAULT 100.0"))
            if 'area_height' not in column_names:
                db.session.execute(text("ALTER TABLE banner ADD COLUMN area_height REAL NOT NULL DEFAULT 100.0"))
            db.session.commit()
        except Exception as e:
            print('PRAGMA/ALTER TABLE banner error:', e)
            db.session.rollback()

        # Создать админа по умолчанию, если нет пользователей
        if not User.query.filter_by(is_admin=True).first():
            admin = User(
                username='admin',
                email='admin@example.com',
                password_hash=generate_password_hash('admin123'),
                is_admin=True
            )
            db.session.add(admin)
            db.session.commit()
            print("Админ создан: admin@example.com / admin123")
    
    app.run(debug=True, port=8080)

# ===== МАРШРУТЫ ДЛЯ ФРОНТЕНДА =====
@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/about')
def about():
    return send_from_directory('../frontend', 'about.html')

@app.route('/contact')
def contact():
    return send_from_directory('../frontend', 'contact.html')

@app.route('/product')
def product():
    return send_from_directory('../frontend', 'product.html')

@app.route('/checkout')
def checkout():
    return send_from_directory('../frontend', 'checkout.html')

@app.route('/chat')
def chat():
    return send_from_directory('../frontend', 'chat.html')

@app.route('/profile')
def profile():
    return send_from_directory('../frontend', 'profile.html')

@app.route('/admin')
def admin():
    return send_from_directory('../frontend/admin', 'dashboard.html')

@app.route('/admin/<path:filename>')
def admin_files(filename):
    return send_from_directory('../frontend/admin', filename)

@app.route('/<path:filename>')
def frontend_files(filename):
    return send_from_directory('../frontend', filename)