from app import app, db, ChatMessage, User

with app.app_context():
    messages = ChatMessage.query.all()
    print(f'Chat messages: {len(messages)}')
    for m in messages:
        user = User.query.get(m.user_id)
        print(f'User {user.username if user else "None"}: {m.sender} - {m.message[:50]}...')