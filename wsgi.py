"""
WSGI entry point for Gunicorn.
Used for production deployment on Render.com
"""
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import app, db, User
from werkzeug.security import generate_password_hash

# Create tables if they don't exist
with app.app_context():
    db.create_all()
    
    # Create default admin if no admin exists
    if not User.query.filter_by(is_admin=True).first():
        admin = User(
            username='admin',
            email='admin@example.com',
            password_hash=generate_password_hash('admin123'),
            is_admin=True
        )
        db.create_all()  # Ensure tables exist
        db.session.add(admin)
        db.session.commit()
        print("Админ создан: admin@example.com / admin123")

if __name__ == '__main__':
    app.run()
