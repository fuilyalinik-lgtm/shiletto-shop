"""
WSGI entry point for Gunicorn.
Used for production deployment on Render.com
"""
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import app, db, ensure_admin_user_from_env, restore_bundled_backup_if_database_empty

# Create tables if they don't exist
with app.app_context():
    db.create_all()
    ensure_admin_user_from_env()
    restore_bundled_backup_if_database_empty()

if __name__ == '__main__':
    app.run()
