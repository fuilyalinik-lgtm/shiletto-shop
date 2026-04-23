from flask import Flask, jsonify, request, send_from_directory, abort, redirect, url_for, session, has_request_context
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import json
import os
import re
import random
import shutil
import smtplib
import tempfile
import zipfile
from datetime import datetime, timedelta
from email.message import EmailMessage
import jwt
from werkzeug.utils import secure_filename
import uuid
from sqlalchemy import inspect, text
from mimetypes import guess_type
import logging
from pathlib import Path
import requests
from requests_oauthlib import OAuth2Session
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

# Загружать переменные окружения и из корня проекта, и из backend/.env
load_dotenv(PROJECT_ROOT / '.env')
load_dotenv(BASE_DIR / '.env', override=True)

# Разрешить локальную OAuth2 разработку по HTTP
if os.getenv('FLASK_ENV', 'development') == 'development':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'  # only for local development

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='../frontend', static_url_path='/static')
# Разрешаем CORS для всех origins (временно для отладки)
CORS(app, resources={r"/api/*": {"origins": "*"}})

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
app.config['SMTP_HOST'] = os.getenv('SMTP_HOST', '').strip()
app.config['SMTP_PORT'] = int(os.getenv('SMTP_PORT', '587'))
app.config['SMTP_USERNAME'] = os.getenv('SMTP_USERNAME', '').strip()
app.config['SMTP_PASSWORD'] = os.getenv('SMTP_PASSWORD', '')
app.config['SMTP_FROM_EMAIL'] = os.getenv('SMTP_FROM_EMAIL', '').strip()
app.config['SMTP_USE_TLS'] = os.getenv('SMTP_USE_TLS', 'true').lower() in {'1', 'true', 'yes', 'on'}
app.config['SMTP_USE_SSL'] = os.getenv('SMTP_USE_SSL', 'false').lower() in {'1', 'true', 'yes', 'on'}
app.config['EMAIL_VERIFICATION_TTL_MINUTES'] = int(os.getenv('EMAIL_VERIFICATION_TTL_MINUTES', '15'))
app.config['EMAIL_VERIFICATION_MAX_ATTEMPTS'] = int(os.getenv('EMAIL_VERIFICATION_MAX_ATTEMPTS', '5'))

# Папка для загрузок
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
if not os.path.isabs(UPLOAD_FOLDER):
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB

# Создать папку для загрузок
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

BACKUP_FOLDER = os.getenv('BACKUP_FOLDER', os.path.join(app.instance_path, 'backups'))
if not os.path.isabs(BACKUP_FOLDER):
    BACKUP_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), BACKUP_FOLDER)
app.config['BACKUP_FOLDER'] = BACKUP_FOLDER
os.makedirs(app.config['BACKUP_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)

ORDER_STATUS_AWAITING_CONFIRMATION = 'Замовлення очікує підтвердження менеджером'
ORDER_STATUS_AWAITING_PREPAYMENT = 'Замовлення очікує на передплату'
ORDER_STATUS_ACCEPTED = 'Замовлення прийнято, очікуйте номер ТТН'
ORDER_STATUS_PREPAYMENT_CONFIRMED = 'Передплата підтверджена та замовлення прийнято. Очікуйте номер ТТН'
ORDER_STATUS_PAYMENT_CONFIRMED = 'Оплата підтверджена та замовлення прийнято. Очікуйте номер ТТН'
ORDER_STATUS_IN_DELIVERY = 'Замовлення у процесі доставки'
ORDER_STATUS_AWAITING_AT_POST = 'Замовлення очікує Вас на пошті!'
ORDER_STATUS_RECEIVED = 'Отримано'
ORDER_STATUS_REFUSED = 'Відмова'

# ===== GOOGLE OAUTH КОНФИГУРАЦИЯ =====
GOOGLE_CLIENT_ID = (os.getenv('GOOGLE_CLIENT_ID') or '').strip()
GOOGLE_CLIENT_SECRET = (os.getenv('GOOGLE_CLIENT_SECRET') or '').strip()
GOOGLE_REDIRECT_URI = (os.getenv('GOOGLE_REDIRECT_URI') or '').strip()
GOOGLE_CLIENT_ID_PLACEHOLDERS = {
    '',
    'your-google-client-id',
    'your_google_client_id',
    'your_google_client_id_here',
}
GOOGLE_CLIENT_SECRET_PLACEHOLDERS = {
    '',
    'your-google-client-secret',
    'your_google_client_secret',
    'your_google_client_secret_here',
}
LOCAL_OAUTH_HOSTS = {'localhost', '127.0.0.1'}


def get_google_redirect_uri():
    if GOOGLE_REDIRECT_URI:
        return GOOGLE_REDIRECT_URI
    if has_request_context():
        return url_for('google_callback', _external=True)
    return 'http://localhost:5000/auth/google/callback'


def get_google_oauth_status():
    redirect_uri = get_google_redirect_uri()
    parsed_redirect_uri = urlparse(redirect_uri)
    issues = []

    if GOOGLE_CLIENT_ID in GOOGLE_CLIENT_ID_PLACEHOLDERS:
        issues.append('missing_client_id')
    if GOOGLE_CLIENT_SECRET in GOOGLE_CLIENT_SECRET_PLACEHOLDERS:
        issues.append('missing_client_secret')
    if parsed_redirect_uri.scheme not in {'http', 'https'} or not parsed_redirect_uri.netloc:
        issues.append('invalid_redirect_uri')

    if has_request_context():
        request_host = (request.host.split(':', 1)[0] or '').lower()
        redirect_host = (parsed_redirect_uri.hostname or '').lower()
        if request_host and request_host not in LOCAL_OAUTH_HOSTS and redirect_host in LOCAL_OAUTH_HOSTS:
            issues.append('redirect_uri_points_to_localhost')

    return {
        'configured': not issues,
        'issues': issues,
        'redirect_uri': redirect_uri,
        'client_id_configured': 'missing_client_id' not in issues,
        'client_secret_configured': 'missing_client_secret' not in issues,
    }

# ===== МОДЕЛИ БД =====
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    telegram_id = db.Column(db.String(100), unique=True, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class PendingEmailVerification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    verification_code_hash = db.Column(db.String(255), nullable=False)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class PendingPasswordReset(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), nullable=False, index=True)
    reset_code_hash = db.Column(db.String(255), nullable=False)
    reset_token_hash = db.Column(db.String(255), nullable=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    is_verified = db.Column(db.Boolean, nullable=False, default=False)
    expires_at = db.Column(db.DateTime, nullable=False)
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
    image_filename = db.Column(db.String(255), nullable=True)
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
    order_number = db.Column(db.String(50), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    items_data = db.Column(db.Text, nullable=False)  # JSON с товарами
    total_price = db.Column(db.Float, nullable=False)
    recipient_phone = db.Column(db.String(50), nullable=False)
    recipient_name = db.Column(db.String(200), nullable=False)
    recipient_city = db.Column(db.String(100), nullable=False)
    delivery_method = db.Column(db.String(50), nullable=False)  # 'postal', 'courier', etc.
    postal_branch_number = db.Column(db.String(20), nullable=True)
    payment_method = db.Column(db.String(50), nullable=False)  # 'cod', 'card', etc.
    status = db.Column(db.String(160), default=ORDER_STATUS_AWAITING_CONFIRMATION)
    tracking_number = db.Column(db.String(100), nullable=True)
    prepayment_received = db.Column(db.Boolean, default=False)
    prepayment_amount = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User', backref='orders')

class GuestOrder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(50), unique=True, nullable=False)
    guest_phone = db.Column(db.String(50), nullable=False)
    guest_name = db.Column(db.String(200), nullable=False)
    guest_city = db.Column(db.String(100), nullable=False)
    items_data = db.Column(db.Text, nullable=False)  # JSON с товарами
    total_price = db.Column(db.Float, nullable=False)
    delivery_method = db.Column(db.String(50), nullable=False)  # 'postal', 'courier', etc.
    postal_branch_number = db.Column(db.String(20), nullable=True)
    payment_method = db.Column(db.String(50), nullable=False)  # 'cod', 'card', etc.
    status = db.Column(db.String(160), default=ORDER_STATUS_AWAITING_CONFIRMATION)
    tracking_number = db.Column(db.String(100), nullable=True)
    prepayment_received = db.Column(db.Boolean, default=False)
    prepayment_amount = db.Column(db.Float, nullable=True)
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

EMAIL_REGEX = re.compile(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
USERNAME_REGEX = re.compile(r'^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9_.-]{3,30}$')


def normalize_email(email):
    return (email or '').strip().lower()


def find_user_by_email(email):
    normalized_email = normalize_email(email)
    if not normalized_email:
        return None
    return User.query.filter(db.func.lower(User.email) == normalized_email).first()


def ensure_admin_user_from_env():
    admin_email = normalize_email(os.getenv('ADMIN_EMAIL'))
    admin_password = os.getenv('ADMIN_PASSWORD') or ''
    admin_username = (os.getenv('ADMIN_USERNAME') or 'admin').strip() or 'admin'

    if not admin_email or not admin_password:
        logger.info('Admin bootstrap skipped: ADMIN_EMAIL and ADMIN_PASSWORD are not configured')
        return None

    existing_admin = User.query.filter_by(is_admin=True).first()
    if existing_admin:
        logger.info('Admin bootstrap skipped: admin user already exists')
        return existing_admin

    existing_user = find_user_by_email(admin_email)
    if existing_user:
        existing_user.is_admin = True
        if not existing_user.password_hash:
            existing_user.password_hash = generate_password_hash(admin_password)
        db.session.commit()
        logger.info('Promoted existing user to admin from environment bootstrap: %s', admin_email)
        return existing_user

    unique_username = admin_username
    suffix = 1
    while User.query.filter_by(username=unique_username).first():
        unique_username = f'{admin_username}_{suffix}'
        suffix += 1

    admin = User(
        username=unique_username,
        email=admin_email,
        password_hash=generate_password_hash(admin_password),
        is_admin=True
    )
    db.session.add(admin)
    db.session.commit()
    logger.info('Created bootstrap admin from environment: %s', admin_email)
    return admin


def validate_registration_payload(data):
    if not isinstance(data, dict):
        return None, None, None, 'Missing required fields: email, password, username'

    username = (data.get('username') or '').strip()
    email = normalize_email(data.get('email'))
    password = data.get('password') or ''

    if not username or not email or not password:
        return None, None, None, 'Missing required fields: email, password, username'

    if not USERNAME_REGEX.fullmatch(username):
        return None, None, None, 'Username must be 3-30 characters and contain only letters, numbers, dot, underscore or hyphen'

    if not EMAIL_REGEX.fullmatch(email):
        return None, None, None, 'Enter a valid email address'

    return username, email, password, None


def cleanup_expired_pending_verifications():
    PendingEmailVerification.query.filter(
        PendingEmailVerification.expires_at < datetime.utcnow()
    ).delete(synchronize_session=False)
    PendingPasswordReset.query.filter(
        PendingPasswordReset.expires_at < datetime.utcnow()
    ).delete(synchronize_session=False)
    db.session.commit()


def ensure_email_delivery_configured():
    if not app.config['SMTP_HOST'] or not app.config['SMTP_FROM_EMAIL']:
        raise RuntimeError('Email delivery is not configured on the server')


def get_email_delivery_status():
    smtp_username = app.config['SMTP_USERNAME']
    smtp_from_email = app.config['SMTP_FROM_EMAIL']
    return {
        'host': app.config['SMTP_HOST'],
        'port': app.config['SMTP_PORT'],
        'username_configured': bool(smtp_username),
        'from_email_configured': bool(smtp_from_email),
        'use_tls': app.config['SMTP_USE_TLS'],
        'use_ssl': app.config['SMTP_USE_SSL'],
    }


def generate_email_verification_code():
    return f'{random.randint(0, 999999):06d}'


def generate_password_reset_token():
    return uuid.uuid4().hex


def create_or_update_pending_verification(username, email, password):
    verification_code = generate_email_verification_code()
    expires_at = datetime.utcnow() + timedelta(minutes=app.config['EMAIL_VERIFICATION_TTL_MINUTES'])
    pending = PendingEmailVerification.query.filter_by(email=email).first()

    if pending:
        pending.username = username
        pending.password_hash = generate_password_hash(password)
        pending.verification_code_hash = generate_password_hash(verification_code)
        pending.attempts = 0
        pending.expires_at = expires_at
        pending.created_at = datetime.utcnow()
    else:
        pending = PendingEmailVerification(
            username=username,
            email=email,
            password_hash=generate_password_hash(password),
            verification_code_hash=generate_password_hash(verification_code),
            expires_at=expires_at
        )
        db.session.add(pending)

    return pending, verification_code


def create_or_update_password_reset(email):
    reset_code = generate_email_verification_code()
    expires_at = datetime.utcnow() + timedelta(minutes=app.config['EMAIL_VERIFICATION_TTL_MINUTES'])
    pending = PendingPasswordReset.query.filter_by(email=email).first()

    if pending:
        pending.reset_code_hash = generate_password_hash(reset_code)
        pending.reset_token_hash = None
        pending.attempts = 0
        pending.is_verified = False
        pending.expires_at = expires_at
        pending.created_at = datetime.utcnow()
    else:
        pending = PendingPasswordReset(
            email=email,
            reset_code_hash=generate_password_hash(reset_code),
            expires_at=expires_at
        )
        db.session.add(pending)

    return pending, reset_code


def send_email_verification_code(recipient_email, code):
    ensure_email_delivery_configured()

    message = EmailMessage()
    message['Subject'] = 'Email verification code'
    message['From'] = app.config['SMTP_FROM_EMAIL']
    message['To'] = recipient_email
    ttl_minutes = app.config['EMAIL_VERIFICATION_TTL_MINUTES']
    message.set_content(
        f'Your verification code is: {code}\n\n'
        f'The code is valid for {ttl_minutes} minutes.\n'
        'If you did not request registration, just ignore this email.'
    )

    smtp_host = app.config['SMTP_HOST']
    smtp_port = app.config['SMTP_PORT']
    smtp_username = app.config['SMTP_USERNAME']
    smtp_password = app.config['SMTP_PASSWORD']

    if app.config['SMTP_USE_SSL']:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20) as server:
            if smtp_username:
                server.login(smtp_username, smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.ehlo()
        if app.config['SMTP_USE_TLS']:
            server.starttls()
            server.ehlo()
        if smtp_username:
            server.login(smtp_username, smtp_password)
        server.send_message(message)


def send_password_reset_code(recipient_email, code):
    ensure_email_delivery_configured()

    message = EmailMessage()
    message['Subject'] = 'Password reset code'
    message['From'] = app.config['SMTP_FROM_EMAIL']
    message['To'] = recipient_email
    ttl_minutes = app.config['EMAIL_VERIFICATION_TTL_MINUTES']
    message.set_content(
        f'Your password reset code is: {code}\n\n'
        f'The code is valid for {ttl_minutes} minutes.\n'
        'If you did not request a password reset, ignore this email.'
    )

    smtp_host = app.config['SMTP_HOST']
    smtp_port = app.config['SMTP_PORT']
    smtp_username = app.config['SMTP_USERNAME']
    smtp_password = app.config['SMTP_PASSWORD']

    if app.config['SMTP_USE_SSL']:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20) as server:
            if smtp_username:
                server.login(smtp_username, smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.ehlo()
        if app.config['SMTP_USE_TLS']:
            server.starttls()
            server.ehlo()
        if smtp_username:
            server.login(smtp_username, smtp_password)
        server.send_message(message)

ALLOWED_ORDER_STATUSES = {
    'Замовлення очікує підтвердження менеджером',
    'Замовлення прийнято, очікуйте номер ТТН',
    'Замовлення у процесі доставки',
    'Отримано',
    'Відмова'
}

DELIVERY_STATUS = 'Замовлення у процесі доставки'
ALLOWED_CHAT_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'heic', 'heif'}

ALLOWED_ORDER_STATUSES = {
    ORDER_STATUS_AWAITING_CONFIRMATION,
    ORDER_STATUS_AWAITING_PREPAYMENT,
    ORDER_STATUS_ACCEPTED,
    ORDER_STATUS_PREPAYMENT_CONFIRMED,
    ORDER_STATUS_PAYMENT_CONFIRMED,
    ORDER_STATUS_IN_DELIVERY,
    ORDER_STATUS_AWAITING_AT_POST,
    ORDER_STATUS_RECEIVED,
    ORDER_STATUS_REFUSED
}

DELIVERY_STATUS = ORDER_STATUS_IN_DELIVERY
LEGACY_ORDER_STATUS_MAP = {
    'pending': ORDER_STATUS_AWAITING_CONFIRMATION,
    'замовлення очікує підтвердження менеджером': ORDER_STATUS_AWAITING_CONFIRMATION,
    'замовлення очікує на передплату': ORDER_STATUS_AWAITING_PREPAYMENT,
    'confirmed': ORDER_STATUS_ACCEPTED,
    'замовлення прийнято, очікуйте номер ттн': ORDER_STATUS_ACCEPTED,
    'передплата підтверджена та замовлення прийнято. очікуйте номер ттн': ORDER_STATUS_PREPAYMENT_CONFIRMED,
    'оплата підтверджена та замовлення прийнято. очікуйте номер ттн': ORDER_STATUS_PAYMENT_CONFIRMED,
    'shipped': ORDER_STATUS_IN_DELIVERY,
    'замовлення у процесі доставки': ORDER_STATUS_IN_DELIVERY,
    'замовлення очікує вас на пошті!': ORDER_STATUS_AWAITING_AT_POST,
    'delivered': ORDER_STATUS_RECEIVED,
    'отримано': ORDER_STATUS_RECEIVED,
    'cancelled': ORDER_STATUS_REFUSED,
    'відмова': ORDER_STATUS_REFUSED,
}

def generate_order_number(prefix='ORD'):
    """Генерирует уникальный номер заказа"""
    prefix_alias = {
        'ORD': 'OR',
        'GUEST': 'GU'
    }.get(prefix, (prefix or 'OR')[:2].upper())

    while True:
        order_number = f"{prefix_alias}-{datetime.utcnow().strftime('%y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
        if not Order.query.filter_by(order_number=order_number).first() and not GuestOrder.query.filter_by(order_number=order_number).first():
            return order_number


def normalize_order_status(status):
    normalized = (status or '').strip()
    if not normalized:
        return ORDER_STATUS_AWAITING_CONFIRMATION

    return LEGACY_ORDER_STATUS_MAP.get(normalized.lower(), normalized)


def normalize_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 'yes', 'on'}
    return False


def normalize_money_value(value):
    if value in (None, ''):
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def serialize_utc_datetime(value):
    if not value:
        return None
    return value.replace(microsecond=0).isoformat() + 'Z'


def get_amount_due(total_price, prepayment_amount):
    total = normalize_money_value(total_price) or 0.0
    prepayment = normalize_money_value(prepayment_amount) or 0.0
    return round(max(total - prepayment, 0.0), 2)


def format_receipt_money(amount):
    normalized = normalize_money_value(amount) or 0.0
    if float(normalized).is_integer():
        return f'{int(normalized)} грн'
    return f'{normalized:.2f} грн'


def build_receipt_total_html(total_price, prepayment_amount=None):
    total_text = format_receipt_money(total_price)
    due_text = format_receipt_money(get_amount_due(total_price, prepayment_amount))
    prepayment_value = normalize_money_value(prepayment_amount)
    prepayment_html = ''
    if prepayment_value and prepayment_value > 0:
        prepayment_html = (
            f'<span class="order-receipt-summary-row">'
            f'<span>Передплата:</span><strong>{format_receipt_money(prepayment_value)}</strong>'
            f'</span>'
        )

    return (
        '<div class="order-receipt-total">'
        f'<span class="order-receipt-summary-row"><span>Загальна сума:</span><strong>{total_text}</strong></span>'
        f'{prepayment_html}'
        f'<span class="order-receipt-summary-row"><span>До сплати:</span><strong>{due_text}</strong></span>'
        '</div>'
    )


def get_receipt_status_class(status):
    normalized = (status or '').strip().lower()
    status_map = {
        'pending': 'awaiting-confirmation',
        'замовлення очікує підтвердження менеджером': 'awaiting-confirmation',
        'confirmed': 'accepted',
        'замовлення прийнято, очікуйте номер ттн': 'accepted',
        'shipped': 'in-delivery',
        'замовлення у процесі доставки': 'in-delivery',
        'delivered': 'received',
        'отримано': 'received',
        'cancelled': 'refused',
        'відмова': 'refused',
    }
    return status_map.get(normalized, 'awaiting-confirmation')


def append_tracking_to_receipt_html(message, tracking_number):
    if not message or 'order-receipt' not in message or not tracking_number:
        return message

    if 'ТТН:' in message:
        return re.sub(
            r'(<div class="order-receipt-note"><strong>ТТН:</strong>\s*)(.*?)(</div>)',
            rf'\1{tracking_number}\3',
            message,
            count=1,
            flags=re.IGNORECASE | re.DOTALL
        )

    tracking_html = f'<div class="order-receipt-note"><strong>ТТН:</strong> {tracking_number}</div>'
    if '<div class="order-receipt-total">' in message:
        return message.replace('<div class="order-receipt-total">', f'{tracking_html}<div class="order-receipt-total">', 1)

    return f'{message}{tracking_html}'


def append_status_to_receipt_html(message, status):
    if not message or 'order-receipt' not in message or not status:
        return message

    status_class = get_receipt_status_class(status)
    status_html = (
        f'<div class="order-receipt-status-row">'
        f'<span class="order-receipt-status-label">Статус замовлення:</span>'
        f'<span class="order-status-badge {status_class}">{status}</span>'
        f'</div>'
    )

    if 'Статус замовлення:' in message:
        return re.sub(
            r'<div class="order-receipt-status-row">.*?</div>',
            status_html,
            message,
            count=1,
            flags=re.DOTALL
        )

    if '<div class="order-receipt-total">' in message:
        return message.replace('<div class="order-receipt-total">', f'{status_html}<div class="order-receipt-total">', 1)

    return f'{message}{status_html}'


def get_receipt_status_class(status):
    normalized = normalize_order_status(status).strip().lower()
    status_map = {
        'замовлення очікує підтвердження менеджером': 'awaiting-confirmation',
        'замовлення очікує на передплату': 'awaiting-confirmation',
        'замовлення прийнято, очікуйте номер ттн': 'accepted',
        'передплата підтверджена та замовлення прийнято. очікуйте номер ттн': 'accepted',
        'оплата підтверджена та замовлення прийнято. очікуйте номер ттн': 'accepted',
        'замовлення у процесі доставки': 'in-delivery',
        'замовлення очікує вас на пошті!': 'in-delivery',
        'отримано': 'received',
        'відмова': 'refused',
    }
    return status_map.get(normalized, 'awaiting-confirmation')


def append_status_to_receipt_html(message, status):
    if not message or 'order-receipt' not in message or not status:
        return message

    normalized_status = normalize_order_status(status)
    status_class = get_receipt_status_class(normalized_status)
    status_html = (
        f'<div class="order-receipt-status-row">'
        f'<span class="order-receipt-status-label">Статус замовлення:</span>'
        f'<span class="order-status-badge {status_class}">{normalized_status}</span>'
        f'</div>'
    )

    if 'Статус замовлення:' in message:
        return re.sub(
            r'<div class="order-receipt-status-row">.*?</div>',
            status_html,
            message,
            count=1,
            flags=re.DOTALL
        )

    if '<div class="order-receipt-total">' in message:
        return message.replace('<div class="order-receipt-total">', f'{status_html}<div class="order-receipt-total">', 1)

    return f'{message}{status_html}'


def append_prepayment_to_receipt_html(message, total_price, prepayment_amount=None):
    if not message or 'order-receipt' not in message:
        return message

    total_html = build_receipt_total_html(total_price, prepayment_amount)
    if '<div class="order-receipt-total">' not in message:
        return f'{message}{total_html}'

    return re.sub(
        r'<div class="order-receipt-total">.*?</div>',
        total_html,
        message,
        count=1,
        flags=re.DOTALL
    )


def inject_order_fields_into_receipt(message, order):
    if not message or 'order-receipt' not in message or not order:
        return message

    updated_message = append_prepayment_to_receipt_html(
        message,
        order.total_price,
        order.prepayment_amount if getattr(order, 'prepayment_received', False) else None
    )
    updated_message = append_status_to_receipt_html(updated_message, getattr(order, 'status', None))
    return append_tracking_to_receipt_html(updated_message, getattr(order, 'tracking_number', None))


def inject_tracking_into_order_message(message, user_id=None):
    if not message or 'order-receipt' not in message:
        return message

    match = re.search(r'Чек замовлення(?:\s*№)?\s*([^<]+)', message)
    if not match:
        return message

    order_number = match.group(1).strip()
    order_query = Order.query.filter_by(order_number=order_number)
    if user_id is not None:
        order_query = order_query.filter_by(user_id=user_id)

    order = order_query.first()
    if not order:
        return message

    return inject_order_fields_into_receipt(message, order)


def inject_guest_order_fields_into_message(message):
    if not message or 'order-receipt' not in message:
        return message

    match = re.search(r'Чек замовлення(?:\s*№)?\s*([^<]+)', message)
    if not match:
        return message

    order_number = match.group(1).strip()
    order = GuestOrder.query.filter_by(order_number=order_number).first()
    if not order:
        return message

    return inject_order_fields_into_receipt(message, order)


def is_allowed_chat_image(filename):
    if not filename or '.' not in filename:
        return False
    return filename.rsplit('.', 1)[1].lower() in ALLOWED_CHAT_IMAGE_EXTENSIONS


def save_chat_image(file_storage):
    if not file_storage or not file_storage.filename:
        return None

    original_name = secure_filename(file_storage.filename)
    if not original_name or not is_allowed_chat_image(original_name):
        raise ValueError('Дозволені лише зображення формату PNG, JPG, WEBP, GIF, AVIF або HEIC.')

    mime_type = (file_storage.mimetype or '').lower()
    if mime_type and not mime_type.startswith('image/'):
        raise ValueError('Можна завантажувати лише файли зображень.')

    extension = os.path.splitext(original_name)[1].lower()
    filename = f'chat_{uuid.uuid4().hex}{extension}'
    file_storage.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
    return filename


def remove_uploaded_file(filename):
    if not filename:
        return

    upload_dir = os.path.abspath(app.config['UPLOAD_FOLDER'])
    file_path = os.path.abspath(os.path.join(upload_dir, filename))
    if not file_path.startswith(upload_dir + os.sep) and file_path != upload_dir:
        return

    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError as error:
        app.logger.warning('Не вдалося видалити файл %s: %s', filename, error)


def get_chat_submission_payload():
    text = ''
    image_file = None

    if request.files:
        image_file = request.files.get('image')
        text = request.form.get('message', '')
    else:
        data = request.get_json(silent=True) or {}
        text = data.get('message', '')

    return (text or '').strip(), image_file


def is_sqlite_database():
    return db.engine.url.drivername.startswith('sqlite')


def get_database_file_path():
    database_path = db.engine.url.database
    if not database_path or database_path == ':memory:':
        return None
    return os.path.abspath(database_path)


def read_backup_manifest(archive_path):
    try:
        with zipfile.ZipFile(archive_path, 'r') as archive:
            if 'backup_manifest.json' not in archive.namelist():
                return None
            with archive.open('backup_manifest.json') as manifest_file:
                return json.load(manifest_file)
    except (OSError, zipfile.BadZipFile, json.JSONDecodeError):
        return None


def collect_backup_stats():
    return {
        'users': User.query.count(),
        'user_profiles': UserProfile.query.count(),
        'contact_messages': ContactMessage.query.count(),
        'chat_messages': ChatMessage.query.count(),
        'guest_chat_messages': GuestChatMessage.query.count(),
        'categories': Category.query.count(),
        'products': Product.query.count(),
        'product_images': ProductImage.query.count(),
        'banners': Banner.query.count(),
        'reviews': Review.query.count(),
        'orders': Order.query.count(),
        'guest_orders': GuestOrder.query.count()
    }


def build_backup_manifest(source='manual'):
    database_path = get_database_file_path()
    upload_dir = os.path.abspath(app.config['UPLOAD_FOLDER'])
    uploads_count = 0

    if os.path.isdir(upload_dir):
        uploads_count = sum(1 for item in Path(upload_dir).rglob('*') if item.is_file())

    return {
        'backup_version': 1,
        'created_at': datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
        'source': source,
        'environment': ENV,
        'database': {
            'driver': db.engine.url.drivername,
            'filename': os.path.basename(database_path) if database_path else None
        },
        'uploads': {
            'folder_name': os.path.basename(upload_dir),
            'files_count': uploads_count
        },
        'entities': collect_backup_stats()
    }


def build_backup_response(archive_path):
    stats = os.stat(archive_path)
    manifest = read_backup_manifest(archive_path) or {}
    filename = os.path.basename(archive_path)

    return {
        'filename': filename,
        'size_bytes': stats.st_size,
        'created_at': datetime.utcfromtimestamp(stats.st_mtime).replace(microsecond=0).isoformat() + 'Z',
        'manifest': manifest,
        'download_url': f'/api/admin/backups/{filename}/download'
    }


def create_backup_archive(source='manual', prefix='backup'):
    if not is_sqlite_database():
        raise ValueError('Automatic backups are currently supported only for SQLite.')

    database_path = get_database_file_path()
    if not database_path or not os.path.exists(database_path):
        raise ValueError('Database file not found for backup.')

    timestamp = datetime.utcnow().strftime('%Y%m%d-%H%M%S')
    archive_filename = f'{prefix}-{timestamp}-{uuid.uuid4().hex[:6]}.zip'
    archive_path = os.path.join(app.config['BACKUP_FOLDER'], archive_filename)
    manifest = build_backup_manifest(source=source)

    db.session.remove()
    db.engine.dispose()

    with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            'backup_manifest.json',
            json.dumps(manifest, ensure_ascii=False, indent=2)
        )
        archive.write(database_path, arcname=f"database/{os.path.basename(database_path)}")

        upload_dir = os.path.abspath(app.config['UPLOAD_FOLDER'])
        if os.path.isdir(upload_dir):
            for file_path in Path(upload_dir).rglob('*'):
                if file_path.is_file():
                    relative_path = file_path.relative_to(upload_dir).as_posix()
                    archive.write(str(file_path), arcname=f'uploads/{relative_path}')

    return archive_path


def extract_backup_archive(archive_path, destination_dir):
    destination_dir = os.path.abspath(destination_dir)
    with zipfile.ZipFile(archive_path, 'r') as archive:
        for member in archive.infolist():
            target_path = os.path.abspath(os.path.join(destination_dir, member.filename))
            if not target_path.startswith(destination_dir + os.sep) and target_path != destination_dir:
                raise ValueError('Backup archive contains unsafe paths.')
        archive.extractall(destination_dir)


def restore_backup_archive(archive_path):
    if not is_sqlite_database():
        raise ValueError('Automatic restore is currently supported only for SQLite.')

    database_path = get_database_file_path()
    if not database_path:
        raise ValueError('Database file path is not available.')

    restore_point_path = create_backup_archive(source='pre_restore', prefix='pre-restore')

    with tempfile.TemporaryDirectory(prefix='backup-restore-') as temp_dir:
        extract_backup_archive(archive_path, temp_dir)

        manifest = {}
        manifest_path = os.path.join(temp_dir, 'backup_manifest.json')
        if os.path.exists(manifest_path):
            with open(manifest_path, 'r', encoding='utf-8') as manifest_file:
                manifest = json.load(manifest_file)

        extracted_database_path = None
        extracted_database_dir = os.path.join(temp_dir, 'database')
        if os.path.isdir(extracted_database_dir):
            for item in Path(extracted_database_dir).iterdir():
                if item.is_file():
                    extracted_database_path = str(item)
                    break

        if not extracted_database_path or not os.path.exists(extracted_database_path):
            raise ValueError('Backup archive does not contain a database file.')

        extracted_uploads_dir = os.path.join(temp_dir, 'uploads')
        upload_dir = os.path.abspath(app.config['UPLOAD_FOLDER'])

        db.session.remove()
        db.engine.dispose()

        os.makedirs(os.path.dirname(database_path), exist_ok=True)
        shutil.copy2(extracted_database_path, database_path)

        if os.path.isdir(extracted_uploads_dir):
            if os.path.isdir(upload_dir):
                shutil.rmtree(upload_dir)
            shutil.copytree(extracted_uploads_dir, upload_dir)
        else:
            os.makedirs(upload_dir, exist_ok=True)

    db.session.remove()
    db.engine.dispose()

    return manifest, restore_point_path


def get_bootstrap_archive_path():
    configured_path = (os.getenv('BOOTSTRAP_ARCHIVE_PATH') or '').strip()
    if configured_path:
        archive_path = Path(configured_path)
        if not archive_path.is_absolute():
            archive_path = PROJECT_ROOT / archive_path
        return archive_path

    return PROJECT_ROOT / 'bootstrap' / 'render-seed.zip'


def restore_bundled_backup_if_database_empty():
    archive_path = get_bootstrap_archive_path()
    if not archive_path.exists():
        logger.info('Bootstrap restore skipped: archive not found at %s', archive_path)
        return False

    try:
        if Category.query.count() or Product.query.count() or Banner.query.count():
            logger.info('Bootstrap restore skipped: database already contains catalog data')
            return False

        logger.info('Bootstrap restore started from %s', archive_path)
        manifest, _ = restore_backup_archive(str(archive_path))
        logger.info('Bootstrap restore finished successfully: %s', manifest)
        return True
    except Exception as error:
        db.session.rollback()
        logger.exception('Bootstrap restore failed: %s', error)
        return False


def serialize_chat_message(message, viewer_user_id=None):
    raw_message = message.message or ''
    prepared_message = inject_tracking_into_order_message(raw_message, viewer_user_id) if raw_message else ''
    image_filename = getattr(message, 'image_filename', None)

    return {
        'id': message.id,
        'user_id': message.user_id,
        'sender': message.sender,
        'message': prepared_message,
        'image_url': f'/uploads/{image_filename}' if image_filename else None,
        'created_at': message.created_at.replace(microsecond=0).isoformat() + 'Z'
    }


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
    try:
        data = request.json
        logger.info(f"Register data: {data}")

        username, email, password, validation_error = validate_registration_payload(data)
        if validation_error:
            logger.error("Registration validation failed: %s", validation_error)
            return jsonify({'error': validation_error}), 400

        cleanup_expired_pending_verifications()

        if find_user_by_email(email):
            logger.info(f"Email {email} already registered")
            return jsonify({'error': 'Email already registered'}), 400

        if User.query.filter_by(username=username).first():
            logger.info(f"Username {username} already registered")
            return jsonify({'error': 'Username already taken'}), 400

        username_in_pending = PendingEmailVerification.query.filter(
            PendingEmailVerification.username == username,
            PendingEmailVerification.email != email,
            PendingEmailVerification.expires_at >= datetime.utcnow()
        ).first()
        if username_in_pending:
            return jsonify({'error': 'Username already reserved by another pending registration'}), 400

        pending, verification_code = create_or_update_pending_verification(username, email, password)

        send_email_verification_code(email, verification_code)
        db.session.commit()

        logger.info("Verification code sent to %s", email)
        return jsonify({
            'message': 'Verification code sent to email',
            'email': email,
            'expires_in_minutes': app.config['EMAIL_VERIFICATION_TTL_MINUTES']
        }), 200
    except Exception as e:
        logger.error(f"Register error: {str(e)}", exc_info=True)
        db.session.rollback()
        return jsonify({'error': f'Registration failed: {str(e)}'}), 500


@app.route('/api/auth/register/resend', methods=['POST'])
def resend_registration_code():
    logger.info("=== REGISTER RESEND ENDPOINT CALLED ===")
    try:
        data = request.json or {}
        username, email, password, validation_error = validate_registration_payload(data)
        if validation_error:
            return jsonify({'error': validation_error}), 400

        cleanup_expired_pending_verifications()

        if find_user_by_email(email):
            return jsonify({'error': 'Email already registered'}), 400

        if User.query.filter_by(username=username).first():
            return jsonify({'error': 'Username already taken'}), 400

        username_in_pending = PendingEmailVerification.query.filter(
            PendingEmailVerification.username == username,
            PendingEmailVerification.email != email,
            PendingEmailVerification.expires_at >= datetime.utcnow()
        ).first()
        if username_in_pending:
            return jsonify({'error': 'Username already reserved by another pending registration'}), 400

        _, verification_code = create_or_update_pending_verification(username, email, password)
        send_email_verification_code(email, verification_code)
        db.session.commit()

        return jsonify({
            'message': 'Verification code resent to email',
            'email': email,
            'expires_in_minutes': app.config['EMAIL_VERIFICATION_TTL_MINUTES']
        }), 200
    except Exception as e:
        logger.error(f"Register resend error: {str(e)}", exc_info=True)
        db.session.rollback()
        return jsonify({'error': f'Resending verification code failed: {str(e)}'}), 500


@app.route('/api/auth/register/verify', methods=['POST'])
def verify_registration():
    logger.info("=== REGISTER VERIFY ENDPOINT CALLED ===")
    try:
        data = request.json or {}
        email = normalize_email(data.get('email'))
        code = (data.get('code') or '').strip()

        if not email or not code:
            return jsonify({'error': 'Email and verification code are required'}), 400

        cleanup_expired_pending_verifications()

        pending = PendingEmailVerification.query.filter_by(email=email).first()
        if not pending:
            return jsonify({'error': 'Verification request not found or expired'}), 404

        if pending.expires_at < datetime.utcnow():
            db.session.delete(pending)
            db.session.commit()
            return jsonify({'error': 'Verification code expired. Request a new one'}), 400

        if pending.attempts >= app.config['EMAIL_VERIFICATION_MAX_ATTEMPTS']:
            db.session.delete(pending)
            db.session.commit()
            return jsonify({'error': 'Too many invalid attempts. Request a new verification code'}), 400

        if not check_password_hash(pending.verification_code_hash, code):
            pending.attempts += 1
            db.session.commit()
            return jsonify({'error': 'Invalid verification code'}), 400

        if find_user_by_email(email):
            db.session.delete(pending)
            db.session.commit()
            return jsonify({'error': 'Email already registered'}), 400

        if User.query.filter_by(username=pending.username).first():
            db.session.delete(pending)
            db.session.commit()
            return jsonify({'error': 'Username already taken'}), 400

        user = User(
            username=pending.username,
            email=pending.email,
            password_hash=pending.password_hash
        )
        db.session.add(user)
        db.session.flush()

        PendingEmailVerification.query.filter_by(email=email).delete(synchronize_session=False)
        db.session.commit()

        token = create_token(user.id)
        logger.info("User verified and registered successfully, id: %s", user.id)
        return jsonify({'token': token, 'user_id': user.id, 'is_admin': user.is_admin}), 201
    except Exception as e:
        logger.error(f"Register verify error: {str(e)}", exc_info=True)
        db.session.rollback()
        return jsonify({'error': f'Email verification failed: {str(e)}'}), 500


@app.route('/api/auth/password-reset/request', methods=['POST'])
def request_password_reset():
    logger.info("=== PASSWORD RESET REQUEST ENDPOINT CALLED ===")
    try:
        data = request.json or {}
        email = normalize_email(data.get('email'))
        if not email:
            return jsonify({'error': 'Email is required'}), 400

        if not EMAIL_REGEX.fullmatch(email):
            return jsonify({'error': 'Enter a valid email address'}), 400

        cleanup_expired_pending_verifications()

        user = find_user_by_email(email)
        if not user:
            return jsonify({'error': 'User with this email was not found'}), 404

        _, reset_code = create_or_update_password_reset(email)
        send_password_reset_code(email, reset_code)
        db.session.commit()

        return jsonify({
            'message': 'Password reset code sent to email',
            'email': email,
            'expires_in_minutes': app.config['EMAIL_VERIFICATION_TTL_MINUTES']
        }), 200
    except Exception as e:
        logger.error(f"Password reset request error: {str(e)}", exc_info=True)
        db.session.rollback()
        return jsonify({'error': f'Password reset request failed: {str(e)}'}), 500


@app.route('/api/auth/password-reset/verify', methods=['POST'])
def verify_password_reset_code():
    logger.info("=== PASSWORD RESET VERIFY ENDPOINT CALLED ===")
    try:
        data = request.json or {}
        email = normalize_email(data.get('email'))
        code = (data.get('code') or '').strip()

        if not email or not code:
            return jsonify({'error': 'Email and reset code are required'}), 400

        cleanup_expired_pending_verifications()

        pending = PendingPasswordReset.query.filter_by(email=email).first()
        if not pending:
            return jsonify({'error': 'Password reset request not found or expired'}), 404

        if pending.expires_at < datetime.utcnow():
            db.session.delete(pending)
            db.session.commit()
            return jsonify({'error': 'Reset code expired. Request a new one'}), 400

        if pending.attempts >= app.config['EMAIL_VERIFICATION_MAX_ATTEMPTS']:
            db.session.delete(pending)
            db.session.commit()
            return jsonify({'error': 'Too many invalid attempts. Request a new reset code'}), 400

        if not check_password_hash(pending.reset_code_hash, code):
            pending.attempts += 1
            db.session.commit()
            return jsonify({'error': 'Invalid reset code'}), 400

        reset_token = generate_password_reset_token()
        pending.reset_token_hash = generate_password_hash(reset_token)
        pending.is_verified = True
        pending.attempts = 0
        db.session.commit()

        return jsonify({
            'message': 'Reset code confirmed',
            'reset_token': reset_token,
            'email': email
        }), 200
    except Exception as e:
        logger.error(f"Password reset verify error: {str(e)}", exc_info=True)
        db.session.rollback()
        return jsonify({'error': f'Password reset verification failed: {str(e)}'}), 500


@app.route('/api/auth/password-reset/confirm', methods=['POST'])
def confirm_password_reset():
    logger.info("=== PASSWORD RESET CONFIRM ENDPOINT CALLED ===")
    try:
        data = request.json or {}
        email = normalize_email(data.get('email'))
        reset_token = (data.get('reset_token') or '').strip()
        new_password = data.get('new_password') or ''

        if not email or not reset_token or not new_password:
            return jsonify({'error': 'Email, reset token and new password are required'}), 400

        cleanup_expired_pending_verifications()

        pending = PendingPasswordReset.query.filter_by(email=email).first()
        if not pending or pending.expires_at < datetime.utcnow():
            if pending:
                db.session.delete(pending)
                db.session.commit()
            return jsonify({'error': 'Password reset request not found or expired'}), 404

        if not pending.is_verified or not pending.reset_token_hash:
            return jsonify({'error': 'Reset code must be confirmed first'}), 400

        if not check_password_hash(pending.reset_token_hash, reset_token):
            return jsonify({'error': 'Invalid password reset session'}), 400

        user = find_user_by_email(email)
        if not user:
            db.session.delete(pending)
            db.session.commit()
            return jsonify({'error': 'User with this email was not found'}), 404

        user.password_hash = generate_password_hash(new_password)
        db.session.delete(pending)
        db.session.commit()

        return jsonify({'message': 'Password updated successfully'}), 200
    except Exception as e:
        logger.error(f"Password reset confirm error: {str(e)}", exc_info=True)
        db.session.rollback()
        return jsonify({'error': f'Password reset failed: {str(e)}'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    logger.info("=== LOGIN ENDPOINT CALLED ===")
    try:
        data = request.json
        logger.info(f"Login attempt for email: {data.get('email') if data else 'None'}")
        
        if not data or 'email' not in data or 'password' not in data:
            logger.error("Missing email or password")
            return jsonify({'error': 'Missing email or password'}), 400

        email = normalize_email(data['email'])
        user = find_user_by_email(email)
        
        if not user:
            logger.warning(f"User not found: {email}")
            return jsonify({'error': 'Invalid credentials'}), 401
        
        if not check_password_hash(user.password_hash, data['password']):
            logger.warning(f"Wrong password for user: {email}")
            return jsonify({'error': 'Invalid credentials'}), 401
        
        token = create_token(user.id)
        logger.info(f"User logged in: {user.email}, is_admin: {user.is_admin}")
        return jsonify({'token': token, 'is_admin': user.is_admin, 'user_id': user.id}), 200
    except Exception as e:
        logger.error(f"Login error: {str(e)}", exc_info=True)
        return jsonify({'error': f'Login failed: {str(e)}'}), 500
    
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
        raw_message = msg.message or ''
        is_html = '<div' in raw_message or '<span' in raw_message or 'order-receipt' in raw_message
        logger.info(f"Message {i+1}: sender={msg.sender}, length={len(raw_message)}, is_html={is_html}, has_image={bool(getattr(msg, 'image_filename', None))}")
        if is_html:
            logger.info(f"  HTML message preview: {raw_message[:200]}...")

    try:
        ChatMessage.query.filter_by(user_id=user.id, sender='admin', is_read=False).update({'is_read': True})
        db.session.commit()
    except Exception:
        db.session.rollback()
    
    return jsonify([serialize_chat_message(m, user.id) for m in messages]), 200

@app.route('/api/user/chat', methods=['POST'])
@token_required
def post_user_chat():
    logger.info("=== POST USER CHAT ENDPOINT CALLED ===")
    logger.info(f"POST /api/user/chat for user_id: {request.user_id}")
    user = User.query.get(request.user_id)
    if not user:
        logger.info(f"User not found: {request.user_id}")
        return jsonify({'error': 'User not found'}), 404

    text, image_file = get_chat_submission_payload()
    logger.info(
        "Received chat payload: text_length=%s has_image=%s filename=%s",
        len(text),
        bool(image_file and image_file.filename),
        image_file.filename if image_file else ''
    )

    if not text and not (image_file and image_file.filename):
        logger.info("Message payload is empty")
        return jsonify({'error': 'Message or image is required'}), 400

    is_html = '<div' in text or '<span' in text or 'order-receipt' in text
    logger.info(f"Message contains HTML: {is_html}")

    try:
        image_filename = save_chat_image(image_file) if image_file and image_file.filename else None
    except ValueError as error:
        return jsonify({'error': str(error)}), 400

    chat_msg = ChatMessage(
        user_id=user.id,
        sender='user',
        message=text,
        image_filename=image_filename,
        is_read=False
    )
    db.session.add(chat_msg)

    # Сохраняем также как контактное сообщение, чтобы админ мог увидеть исходящие запросы пользователей
    if text:
        contact_msg = ContactMessage(user_id=user.id, message=text)
        db.session.add(contact_msg)

    try:
        db.session.commit()
        logger.info(f"Message saved successfully, chat_msg.id: {chat_msg.id}")
        return jsonify(serialize_chat_message(chat_msg, user.id)), 201
    except Exception as e:
        logger.error(f"Error saving message: {e}")
        db.session.rollback()
        remove_uploaded_file(image_filename)
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
        return jsonify([serialize_chat_message(m, target.id) for m in messages]), 200
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
        'message': inject_tracking_into_order_message(m.message or '', m.user_id) if (m.message or '') else '',
        'image_url': f'/uploads/{m.image_filename}' if getattr(m, 'image_filename', None) else None,
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
        last_message_time = None
        try:
            last_unread = ChatMessage.query.filter_by(user_id=u.id, sender='user', is_read=False).order_by(ChatMessage.created_at.desc()).first()
            if last_unread:
                unread_count = ChatMessage.query.filter_by(user_id=u.id, sender='user', is_read=False).count()
                last_unread_time = last_unread.created_at.replace(microsecond=0).isoformat() + 'Z'
        except Exception:
            # в случае отсутствия колонки is_read или иной ошибки - игнорируем
            unread_count = 0

        last_message = ChatMessage.query.filter_by(user_id=u.id).order_by(ChatMessage.created_at.desc()).first()
        if last_message:
            last_message_time = last_message.created_at.replace(microsecond=0).isoformat() + 'Z'

        data.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'full_name': u.profile.full_name if getattr(u, 'profile', None) else None,
            'display_name': (u.profile.full_name.strip() if getattr(u, 'profile', None) and u.profile.full_name and u.profile.full_name.strip() else f'User #{u.id}'),
            'unread_count': unread_count,
            'last_unread_time': last_unread_time,
            'last_message_time': last_message_time
        })

    return jsonify(data), 200


@app.route('/api/chat/unread-summary', methods=['GET'])
@token_required
def get_chat_unread_summary():
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if user.is_admin:
        try:
            user_unread_count = ChatMessage.query.filter_by(sender='user', is_read=False).count()
        except Exception:
            user_unread_count = 0

        try:
            guest_unread_count = GuestChatMessage.query.filter_by(sender='guest', is_read=False).count()
        except Exception:
            guest_unread_count = 0

        return jsonify({
            'count': user_unread_count + guest_unread_count,
            'user_unread_count': user_unread_count,
            'guest_unread_count': guest_unread_count
        }), 200

    try:
        admin_unread_count = ChatMessage.query.filter_by(
            user_id=user.id,
            sender='admin',
            is_read=False
        ).count()
    except Exception:
        admin_unread_count = 0

    return jsonify({
        'count': admin_unread_count,
        'admin_unread_count': admin_unread_count
    }), 200


@app.route('/api/admin/chat/<int:user_id>', methods=['POST'])
@admin_required
def post_admin_chat(user_id):
    target = User.query.get(user_id)
    if not target:
        return jsonify({'error': 'User not found'}), 404

    text, image_file = get_chat_submission_payload()
    if not text and not (image_file and image_file.filename):
        return jsonify({'error': 'Message or image is required'}), 400

    try:
        image_filename = save_chat_image(image_file) if image_file and image_file.filename else None
    except ValueError as error:
        return jsonify({'error': str(error)}), 400

    chat_msg = ChatMessage(
        user_id=target.id,
        sender='admin',
        message=text,
        image_filename=image_filename
    )
    db.session.add(chat_msg)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        remove_uploaded_file(image_filename)
        return jsonify({'error': 'Failed to save message'}), 500

    return jsonify(serialize_chat_message(chat_msg, target.id)), 201

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

    image_filename = getattr(message, 'image_filename', None)
    db.session.delete(message)
    db.session.commit()
    remove_uploaded_file(image_filename)

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
        if getattr(message, 'image_filename', None):
            message.message = ''
            db.session.commit()
            return jsonify({'message': 'Message updated'}), 200
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
@app.route('/api/admin/backups', methods=['GET'])
@admin_required
def list_backups():
    backups = []

    for archive_path in Path(app.config['BACKUP_FOLDER']).glob('*.zip'):
        if archive_path.is_file():
            backups.append(build_backup_response(str(archive_path)))

    backups.sort(key=lambda item: item['created_at'], reverse=True)
    return jsonify(backups), 200


@app.route('/api/admin/backups', methods=['POST'])
@admin_required
def create_backup():
    try:
        archive_path = create_backup_archive(source='manual', prefix='backup')
        return jsonify(build_backup_response(archive_path)), 201
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    except Exception as error:
        logger.exception('Backup creation failed')
        return jsonify({'error': f'Backup creation failed: {error}'}), 500


@app.route('/api/admin/backups/<path:filename>/download', methods=['GET'])
@admin_required
def download_backup(filename):
    safe_filename = secure_filename(filename)
    if safe_filename != filename:
        return jsonify({'error': 'Invalid backup filename'}), 400

    backup_path = os.path.join(app.config['BACKUP_FOLDER'], safe_filename)
    if not os.path.isfile(backup_path):
        return jsonify({'error': 'Backup not found'}), 404

    return send_from_directory(
        app.config['BACKUP_FOLDER'],
        safe_filename,
        as_attachment=True,
        download_name=safe_filename
    )


@app.route('/api/admin/backups/restore', methods=['POST'])
@admin_required
def restore_backup():
    temp_archive_path = None

    try:
        if 'backup' in request.files:
            uploaded_file = request.files['backup']
            if not uploaded_file or not uploaded_file.filename:
                return jsonify({'error': 'Backup file was not provided'}), 400
            if not uploaded_file.filename.lower().endswith('.zip'):
                return jsonify({'error': 'Backup file must be a ZIP archive'}), 400

            temp_dir = tempfile.mkdtemp(prefix='uploaded-backup-')
            temp_archive_path = os.path.join(temp_dir, secure_filename(uploaded_file.filename))
            uploaded_file.save(temp_archive_path)
            archive_path = temp_archive_path
        else:
            data = request.get_json(silent=True) or request.form or {}
            filename = secure_filename(data.get('filename', ''))
            if not filename:
                return jsonify({'error': 'Backup filename is required'}), 400

            archive_path = os.path.join(app.config['BACKUP_FOLDER'], filename)
            if not os.path.isfile(archive_path):
                return jsonify({'error': 'Backup not found'}), 404

        manifest, restore_point_path = restore_backup_archive(archive_path)
        return jsonify({
            'message': 'Backup restored successfully',
            'restored_manifest': manifest,
            'restore_point': build_backup_response(restore_point_path)
        }), 200
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    except zipfile.BadZipFile:
        return jsonify({'error': 'Backup archive is corrupted or invalid'}), 400
    except Exception as error:
        logger.exception('Backup restore failed')
        return jsonify({'error': f'Backup restore failed: {error}'}), 500
    finally:
        if temp_archive_path:
            temp_root = os.path.dirname(temp_archive_path)
            if os.path.isdir(temp_root):
                shutil.rmtree(temp_root, ignore_errors=True)


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

# ===== GOOGLE OAUTH МАРШРУТЫ =====
@app.route('/test')
def test_route():
    status = get_google_oauth_status()
    client_id_preview = GOOGLE_CLIENT_ID[:12] if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID not in GOOGLE_CLIENT_ID_PLACEHOLDERS else 'not-configured'
    return (
        f"GOOGLE_CLIENT_ID: {client_id_preview}..., "
        f"configured: {status['configured']}, "
        f"issues: {','.join(status['issues']) or 'none'}, "
        f"redirect_uri: {status['redirect_uri']}"
    )


@app.route('/api/auth/google/status', methods=['GET'])
def google_oauth_status():
    status = get_google_oauth_status()
    return jsonify(status), 200

@app.route('/routes')
def list_routes():
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append(f"{rule.rule} -> {rule.endpoint}")
    return "<br>".join(routes)

@app.route('/auth/google')
def google_login():
    """Инициировать OAuth вход через Google"""
    try:
        oauth_status = get_google_oauth_status()
        if not oauth_status['configured']:
            logger.error('Google OAuth configuration is invalid: %s', ', '.join(oauth_status['issues']))
            error_code = (
                'google_oauth_redirect_invalid'
                if 'redirect_uri_points_to_localhost' in oauth_status['issues'] or 'invalid_redirect_uri' in oauth_status['issues']
                else 'google_oauth_not_configured'
            )
            return redirect(f'/?error={error_code}')

        next_url = request.args.get('next', '/') or '/'
        if not next_url.startswith('/'):
            next_url = '/'
        session['oauth_next'] = next_url

        google = OAuth2Session(
            GOOGLE_CLIENT_ID,
            scope=['openid', 'email', 'profile'],
            redirect_uri=oauth_status['redirect_uri']
        )
        authorization_url, state = google.authorization_url(
            'https://accounts.google.com/o/oauth2/auth',
            access_type='offline',
            prompt='consent'
        )
        session['oauth_state'] = state
        return redirect(authorization_url)
    except Exception as e:
        logger.error(f'Google OAuth error: {e}')
        return f"Error: {e}", 500

@app.route('/auth/google/callback')
def google_callback():
    """Обработать callback от Google OAuth"""
    print("GOOGLE CALLBACK CALLED")  # Отладка
    print(f"Request args: {request.args}")  # Отладка
    print(f"Request url: {request.url}")  # Отладка
    
    try:
        app.logger.info("Google callback started")
        
        # Проверить, есть ли error в параметрах
        if 'error' in request.args:
            error = request.args.get('error')
            print(f"Google OAuth error from Google: {error}")
            return redirect('/?error=oauth_failed')
        
        # Проверить, есть ли code
        if 'code' not in request.args:
            print("No code parameter in callback")
            return redirect('/?error=oauth_failed')
        
        google = OAuth2Session(
            GOOGLE_CLIENT_ID,
            state=session.get('oauth_state'),
            redirect_uri=get_google_redirect_uri()
        )
        
        print(f"Session state: {session.get('oauth_state')}")  # Отладка
        print(f"Request state: {request.args.get('state')}")  # Отладка
        
        # Получить токен
        token = google.fetch_token(
            'https://oauth2.googleapis.com/token',
            client_secret=GOOGLE_CLIENT_SECRET,
            authorization_response=request.url
        )
        
        print(f"Token received: {token}")  # Отладка
        
        # Получить информацию о пользователе
        google_request = google_requests.Request()
        id_info = id_token.verify_oauth2_token(
            token['id_token'],
            google_request,
            GOOGLE_CLIENT_ID
        )
        
        print(f"ID info: {id_info}")  # Отладка
        
        email = id_info['email']
        name = id_info.get('name', email.split('@')[0])
        google_id = id_info['sub']

        # Проверить, существует ли пользователь
        user = find_user_by_email(email)

        if not user:
            # Создать нового пользователя
            username = name.replace(' ', '_').lower()
            # Убедиться, что username уникален
            base_username = username
            counter = 1
            while User.query.filter_by(username=username).first():
                username = f"{base_username}_{counter}"
                counter += 1

            user = User(
                username=username,
                email=email,
                password_hash='',  # Пустой пароль для OAuth пользователей
                is_admin=False
            )
            db.session.add(user)
            db.session.commit()

        # Создать JWT токен
        token_payload = {
            'user_id': user.id,
            'username': user.username,
            'email': user.email,
            'is_admin': user.is_admin,
            'exp': datetime.utcnow() + timedelta(days=7)
        }
        auth_token = jwt.encode(token_payload, app.config['SECRET_KEY'], algorithm='HS256')

        next_url = session.pop('oauth_next', '/') or '/'
        if not next_url.startswith('/'):
            next_url = '/'

        url_parts = list(urlparse(next_url))
        query = dict(parse_qsl(url_parts[4]))
        query['token'] = auth_token
        url_parts[4] = urlencode(query)
        return redirect(urlunparse(url_parts))

    except Exception as e:
        import traceback
        error_message = str(e)
        traceback_text = traceback.format_exc()
        print(f"GOOGLE CALLBACK ERROR: {error_message}")  # Отладка
        print(f"Traceback: {traceback_text}")  # Отладка
        logger.error(f'Google OAuth error: {error_message}')
        return f"<h1>Google OAuth Error</h1><pre>{error_message}</pre><pre>{traceback_text}</pre>", 500

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
        result = db.session.execute(text("PRAGMA table_info(chat_message)")).fetchall()
        columns = [row[1] for row in result]
        chat_message_migration_changed = False
        if 'is_read' not in columns:
            db.session.execute(text("ALTER TABLE chat_message ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0"))
            chat_message_migration_changed = True
            app.logger.info('Добавлена колонка is_read для chat_message')
        if 'image_filename' not in columns:
            db.session.execute(text("ALTER TABLE chat_message ADD COLUMN image_filename TEXT"))
            chat_message_migration_changed = True
            app.logger.info('Добавлена колонка image_filename для chat_message')
        if chat_message_migration_changed:
            db.session.commit()
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

    # Миграция для заказа: order_number
    try:
        result = db.session.execute(text("PRAGMA table_info('order')")).fetchall()
        columns = [row[1] for row in result]
        if 'order_number' not in columns:
            db.session.execute(text("ALTER TABLE 'order' ADD COLUMN order_number TEXT DEFAULT ''"))
            db.session.commit()
            app.logger.info('Добавлена колонка order_number для order')
            orders = Order.query.filter((Order.order_number == '') | (Order.order_number == None)).all()
            for order in orders:
                order.order_number = generate_order_number('ORD')
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию order.order_number: %s', e)

    # Миграция для гостевого заказа: order_number
    try:
        result = db.session.execute(text("PRAGMA table_info(guest_order)")).fetchall()
        columns = [row[1] for row in result]
        if 'order_number' not in columns:
            db.session.execute(text("ALTER TABLE guest_order ADD COLUMN order_number TEXT DEFAULT ''"))
            db.session.commit()
            app.logger.info('Добавлена колонка order_number для guest_order')
            guest_orders = GuestOrder.query.filter((GuestOrder.order_number == '') | (GuestOrder.order_number == None)).all()
            for guest_order in guest_orders:
                guest_order.order_number = generate_order_number('GUEST')
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию guest_order.order_number: %s', e)

    # Миграция для заказов: tracking_number
    try:
        result = db.session.execute(text("PRAGMA table_info('order')")).fetchall()
        columns = [row[1] for row in result]
        if 'tracking_number' not in columns:
            db.session.execute(text("ALTER TABLE 'order' ADD COLUMN tracking_number TEXT"))
            db.session.commit()
            app.logger.info('Добавлена колонка tracking_number для order')
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию order.tracking_number: %s', e)

    try:
        result = db.session.execute(text("PRAGMA table_info(guest_order)")).fetchall()
        columns = [row[1] for row in result]
        if 'tracking_number' not in columns:
            db.session.execute(text("ALTER TABLE guest_order ADD COLUMN tracking_number TEXT"))
            db.session.commit()
            app.logger.info('Добавлена колонка tracking_number для guest_order')
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию guest_order.tracking_number: %s', e)

    try:
        result = db.session.execute(text("PRAGMA table_info('order')")).fetchall()
        columns = [row[1] for row in result]
        if 'prepayment_received' not in columns:
            db.session.execute(text("ALTER TABLE 'order' ADD COLUMN prepayment_received BOOLEAN DEFAULT 0"))
            db.session.commit()
            app.logger.info('Добавлена колонка prepayment_received для order')
        if 'prepayment_amount' not in columns:
            db.session.execute(text("ALTER TABLE 'order' ADD COLUMN prepayment_amount REAL"))
            db.session.commit()
            app.logger.info('Добавлена колонка prepayment_amount для order')
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию предоплаты для order: %s', e)

    try:
        result = db.session.execute(text("PRAGMA table_info(guest_order)")).fetchall()
        columns = [row[1] for row in result]
        if 'prepayment_received' not in columns:
            db.session.execute(text("ALTER TABLE guest_order ADD COLUMN prepayment_received BOOLEAN DEFAULT 0"))
            db.session.commit()
            app.logger.info('Добавлена колонка prepayment_received для guest_order')
        if 'prepayment_amount' not in columns:
            db.session.execute(text("ALTER TABLE guest_order ADD COLUMN prepayment_amount REAL"))
            db.session.commit()
            app.logger.info('Добавлена колонка prepayment_amount для guest_order')
    except Exception as e:
        db.session.rollback()
        app.logger.warning('Не удалось применить миграцию предоплаты для guest_order: %s', e)

# ===== МАРШРУТЫ: ЗАКАЗЫ =====
with app.app_context():
    try:
        inspector = inspect(db.engine)
        if not inspector.has_table('order') or not inspector.has_table('guest_order'):
            raise RuntimeError('Order tables are not available yet')

        legacy_statuses = tuple(status for status in LEGACY_ORDER_STATUS_MAP.keys() if status not in ALLOWED_ORDER_STATUSES)
        orders = Order.query.filter(Order.status.in_(legacy_statuses)).all() if legacy_statuses else []
        guest_orders = GuestOrder.query.filter(GuestOrder.status.in_(legacy_statuses)).all() if legacy_statuses else []
        has_status_updates = False

        for order in orders:
            normalized_status = normalize_order_status(order.status)
            if order.status != normalized_status:
                order.status = normalized_status
                has_status_updates = True

        for guest_order in guest_orders:
            normalized_status = normalize_order_status(guest_order.status)
            if guest_order.status != normalized_status:
                guest_order.status = normalized_status
                has_status_updates = True

        if has_status_updates:
            db.session.commit()
            app.logger.info('Updated legacy order statuses to display labels')
    except Exception as e:
        db.session.rollback()
        if str(e) != 'Order tables are not available yet':
            app.logger.warning('Failed to update legacy order statuses: %s', e)

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
        order_number=generate_order_number('ORD'),
        user_id=user.id,
        items_data=items_data,
        total_price=total_price,
        recipient_phone=recipient_phone,
        recipient_name=recipient_name,
        recipient_city=recipient_city,
        delivery_method=delivery_method,
        postal_branch_number=postal_branch_number,
        payment_method=payment_method,
        status=ORDER_STATUS_AWAITING_CONFIRMATION
    )
    db.session.add(order)
    db.session.commit()
    
    return jsonify({
        'id': order.id,
        'order_number': order.order_number,
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
        'order_number': o.order_number,
        'items_data': o.items_data,
        'total_price': o.total_price,
        'recipient_phone': o.recipient_phone,
        'recipient_name': o.recipient_name,
        'recipient_city': o.recipient_city,
        'delivery_method': o.delivery_method,
        'postal_branch_number': o.postal_branch_number,
        'payment_method': o.payment_method,
        'status': normalize_order_status(o.status),
        'tracking_number': o.tracking_number,
        'prepayment_received': bool(o.prepayment_received),
        'prepayment_amount': o.prepayment_amount,
        'created_at': serialize_utc_datetime(o.created_at)
    } for o in orders]), 200

@app.route('/api/admin/orders', methods=['GET'])
@admin_required
def get_all_orders():
    """Получить все заказы (админ)"""
    orders = Order.query.order_by(Order.created_at.desc()).all()
    return jsonify([{
        'id': o.id,
        'order_number': o.order_number,
        'user_id': o.user_id,
        'user_email': o.user.email if o.user else None,
        'items_data': o.items_data,
        'total_price': o.total_price,
        'recipient_phone': o.recipient_phone,
        'recipient_name': o.recipient_name,
        'recipient_city': o.recipient_city,
        'delivery_method': o.delivery_method,
        'payment_method': o.payment_method,
        'status': normalize_order_status(o.status),
        'tracking_number': o.tracking_number,
        'prepayment_received': bool(o.prepayment_received),
        'prepayment_amount': o.prepayment_amount,
        'created_at': serialize_utc_datetime(o.created_at)
    } for o in orders]), 200

@app.route('/api/admin/orders/<int:order_id>/status', methods=['PUT'])
@admin_required
def update_admin_order_status(order_id):
    order = Order.query.get_or_404(order_id)
    data = request.json or {}
    status = (data.get('status') or '').strip()
    incoming_tracking_number = (data.get('tracking_number') or '').strip() or None
    tracking_number = incoming_tracking_number or order.tracking_number
    prepayment_received_supplied = 'prepayment_received' in data
    prepayment_amount_supplied = 'prepayment_amount' in data

    if status not in ALLOWED_ORDER_STATUSES:
        return jsonify({'error': 'Invalid order status'}), 400

    if status == DELIVERY_STATUS and not tracking_number:
        return jsonify({'error': 'Tracking number is required for delivery status'}), 400

    next_prepayment_received = bool(order.prepayment_received)
    next_prepayment_amount = order.prepayment_amount

    if prepayment_received_supplied or prepayment_amount_supplied:
        if prepayment_received_supplied:
            next_prepayment_received = normalize_bool(data.get('prepayment_received'))
        if prepayment_amount_supplied:
            next_prepayment_amount = normalize_money_value(data.get('prepayment_amount'))

        if next_prepayment_received:
            if next_prepayment_amount is None or next_prepayment_amount <= 0:
                return jsonify({'error': 'Prepayment amount is required when prepayment is received'}), 400
            if next_prepayment_amount > float(order.total_price or 0):
                return jsonify({'error': 'Prepayment amount cannot exceed total price'}), 400
        else:
            next_prepayment_amount = None

    previous_status = order.status
    previous_tracking_number = order.tracking_number

    order.status = status
    order.tracking_number = tracking_number
    if prepayment_received_supplied or prepayment_amount_supplied:
        order.prepayment_received = next_prepayment_received
        order.prepayment_amount = next_prepayment_amount if next_prepayment_received else None
    if status == DELIVERY_STATUS and tracking_number and (
        previous_status != DELIVERY_STATUS or previous_tracking_number != tracking_number
    ):
        db.session.add(ChatMessage(
            user_id=order.user_id,
            sender='admin',
            message=f'Ваш № ТТН {tracking_number} до замовлення {order.order_number}. Дякуємо за покупку!'
        ))
    db.session.commit()

    return jsonify({
        'id': order.id,
        'status': order.status,
        'tracking_number': order.tracking_number,
        'prepayment_received': bool(order.prepayment_received),
        'prepayment_amount': order.prepayment_amount,
        'message': 'Order status updated'
    }), 200

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
        order_number=generate_order_number('GUEST'),
        guest_phone=guest_phone,
        guest_name=guest_name,
        guest_city=guest_city,
        items_data=items_data,
        total_price=total_price,
        delivery_method=delivery_method,
        postal_branch_number=postal_branch_number,
        payment_method=payment_method,
        status=ORDER_STATUS_AWAITING_CONFIRMATION
    )
    db.session.add(guest_order)
    db.session.commit()
    
    # Автоматически создать приветственное сообщение в гостевом чате
    welcome_msg = GuestChatMessage(
        guest_identifier=guest_identifier,
        guest_phone=guest_phone,
        sender='admin',
        message=f'Ваше замовлення {guest_order.order_number} прийнято. Менеджер звʼяжеться з вами найближчим часом. Дякуємо за замовлення!'
    )
    db.session.add(welcome_msg)
    db.session.commit()
    
    return jsonify({
        'id': guest_order.id,
        'order_number': guest_order.order_number,
        'message': 'Guest order created successfully'
    }), 201

@app.route('/api/admin/guest-orders', methods=['GET'])
@admin_required
def get_guest_orders():
    """Получить все гостевые заказы (админ)"""
    orders = GuestOrder.query.order_by(GuestOrder.created_at.desc()).all()
    return jsonify([{
        'id': o.id,
        'order_number': o.order_number,
        'guest_phone': o.guest_phone,
        'guest_name': o.guest_name,
        'guest_city': o.guest_city,
        'items_data': o.items_data,
        'total_price': o.total_price,
        'delivery_method': o.delivery_method,
        'postal_branch_number': o.postal_branch_number,
        'payment_method': o.payment_method,
        'status': normalize_order_status(o.status),
        'tracking_number': o.tracking_number,
        'prepayment_received': bool(o.prepayment_received),
        'prepayment_amount': o.prepayment_amount,
        'created_at': serialize_utc_datetime(o.created_at)
    } for o in orders]), 200

@app.route('/api/admin/guest-orders/<int:order_id>/status', methods=['PUT'])
@admin_required
def update_admin_guest_order_status(order_id):
    order = GuestOrder.query.get_or_404(order_id)
    data = request.json or {}
    status = (data.get('status') or '').strip()
    incoming_tracking_number = (data.get('tracking_number') or '').strip() or None
    tracking_number = incoming_tracking_number or order.tracking_number
    prepayment_received_supplied = 'prepayment_received' in data
    prepayment_amount_supplied = 'prepayment_amount' in data

    if status not in ALLOWED_ORDER_STATUSES:
        return jsonify({'error': 'Invalid order status'}), 400

    if status == DELIVERY_STATUS and not tracking_number:
        return jsonify({'error': 'Tracking number is required for delivery status'}), 400

    next_prepayment_received = bool(order.prepayment_received)
    next_prepayment_amount = order.prepayment_amount

    if prepayment_received_supplied or prepayment_amount_supplied:
        if prepayment_received_supplied:
            next_prepayment_received = normalize_bool(data.get('prepayment_received'))
        if prepayment_amount_supplied:
            next_prepayment_amount = normalize_money_value(data.get('prepayment_amount'))

        if next_prepayment_received:
            if next_prepayment_amount is None or next_prepayment_amount <= 0:
                return jsonify({'error': 'Prepayment amount is required when prepayment is received'}), 400
            if next_prepayment_amount > float(order.total_price or 0):
                return jsonify({'error': 'Prepayment amount cannot exceed total price'}), 400
        else:
            next_prepayment_amount = None

    order.status = status
    order.tracking_number = tracking_number
    if prepayment_received_supplied or prepayment_amount_supplied:
        order.prepayment_received = next_prepayment_received
        order.prepayment_amount = next_prepayment_amount if next_prepayment_received else None
    db.session.commit()

    return jsonify({
        'id': order.id,
        'status': order.status,
        'tracking_number': order.tracking_number,
        'prepayment_received': bool(order.prepayment_received),
        'prepayment_amount': order.prepayment_amount,
        'message': 'Guest order status updated'
    }), 200

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
        'message': inject_guest_order_fields_into_message(m.message),
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
        'message': inject_guest_order_fields_into_message(m.message),
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
            last_message_time = None
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
            last_message = GuestChatMessage.query.filter_by(
                guest_identifier=msg.guest_identifier
            ).order_by(GuestChatMessage.created_at.desc()).first()
            if last_message:
                last_message_time = last_message.created_at.replace(microsecond=0).isoformat() + 'Z'

            guests_dict[msg.guest_identifier] = {
                'guest_identifier': msg.guest_identifier,
                'guest_phone': msg.guest_phone,
                'unread_count': unread_count,
                'last_unread_time': last_unread_time,
                'last_message_time': last_message_time
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
            chat_message_columns_changed = False
            if 'is_read' not in column_names:
                db.session.execute(text("ALTER TABLE chat_message ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0"))
                chat_message_columns_changed = True
            if 'image_filename' not in column_names:
                db.session.execute(text("ALTER TABLE chat_message ADD COLUMN image_filename TEXT"))
                chat_message_columns_changed = True
            if chat_message_columns_changed:
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

        ensure_admin_user_from_env()
        restore_bundled_backup_if_database_empty()
    
    app.run(debug=True, port=8080)
