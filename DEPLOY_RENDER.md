# Деплой на Render.com

Это пошаговая инструкция для деплоя сайта SHILETTO SHOP на бесплатный хостинг Render.com.

## Шаг 1: Подготовка репозитория

### 1.1. Инициализируем Git репозиторий локально

```bash
cd c:\Users\user\Desktop\site
git init
git add .
git commit -m "Initial commit: SHILETTO SHOP"
```

### 1.2. Создаём репозиторий на GitHub

1. Перейдите на https://github.com/new
2. Назовите репозиторий (например: `shiletto-shop`)
3. Выберите "Public" (для бесплатного деплоя на Render)
4. Нажмите "Create repository"
5. Следуйте инструкциям для push существующего репозитория:

```bash
git remote add origin https://github.com/YOUR_USERNAME/shiletto-shop.git
git branch -M main
git push -u origin main
```

## Шаг 2: Создание аккаунта на Render

1. Перейдите на https://render.com
2. Нажмите "Sign up"
3. Выберите "Sign up with GitHub"
4. Авторизуйте Render на доступ к вашим репозиториям

## Шаг 3: Создание Web Service на Render

1. На дашборде Render нажмите "New +" → "Web Service"
2. Выберите ваш репозиторий `shiletto-shop`
3. Заполните параметры:
   - **Name**: shiletto-shop (или любое другое имя)
   - **Runtime**: Python 3.11
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn -w 4 -b 0.0.0.0:$PORT wsgi:app`
4. Прокрутите вниз и нажмите "Advanced" (если видно)
5. В разделе "Environment Variables" добавьте:
   - Key: `FLASK_ENV` | Value: `production`
   - Key: `SECRET_KEY` | Value: `your-super-secret-key-generate-a-random-string-12345-CHANGE-THIS`

6. Нажмите "Create Web Service"

## Шаг 4: Ожидание деплоя

- Render начнёт автоматический деплой
- Вы увидите логи в реальном времени
- Это займёт ~5-10 минут
- После завершения вы получите URL вида: `https://shiletto-shop.onrender.com`

## Шаг 5: Проверка работоспособности

1. Откройте URL вашего приложения
2. Проверьте основные функции:
   - Главная страница загружается
   - Регистрация/логин работают
   - Каталог товаров видно

## Решение проблем

### Приложение не запускается
- Проверьте логи в Render dashboard
- Убедитесь, что все зависимости в `requirements.txt`
- Проверьте переменные окружения

### БД не инициализируется
- Первый запуск может занять время
- Проверьте папку `instance/` в логах

### Статические файлы не загружаются
- Убедитесь, что путь `frontend/` правильный
- Может понадобиться собрать статические файлы для продакшена

## Дополнительная конфигурация

### Использование собственного домена
1. На Render перейдите в Settings → Custom Domains
2. Добавьте ваш домен (нужно иметь регистратор)
3. Следуйте инструкциям по добавлению DNS записей

### Переменные окружения для продакшена
```
FLASK_ENV=production
SECRET_KEY=ваш-очень-длинный-случайный-ключ
DATABASE_URL=sqlite:///instance/database.db
```

## Локальное тестирование перед деплоем

Для проверки, что всё работает локально:

```bash
pip install -r requirements.txt
python wsgi.py
# или
gunicorn -w 4 -b 0.0.0.0:8080 wsgi:app
```

Затем откройте http://localhost:8080

## Альтернативные бесплатные хостинги

Если Render не подходит:
- **Railway.app** - $5/месяц бесплатных credit
- **PythonAnywhere** - бесплатный уровень для простых приложений
- **Replit** - можно запустить код прямо в браузере
