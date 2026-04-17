from app import app, db, User

with app.app_context():
    users = User.query.all()
    print(f'Users: {len(users)}')
    for u in users:
        print(f'{u.id}: {u.username}, admin: {u.is_admin}')