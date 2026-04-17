#!/bin/bash

echo "Запуск дропшиппинг сайта..."
echo

# Проверить наличие Python
if ! command -v python3 &> /dev/null; then
    echo "ОШИБКА: Python3 не найден!"
    echo "Установите Python3"
    exit 1
fi

echo "[OK] Python3 найден"
echo

cd backend

# Проверить и создать виртуальное окружение
if [ ! -d ".venv" ]; then
    echo "Создание виртуального окружения..."
    python3 -m venv .venv
    if [ $? -ne 0 ]; then
        echo "ОШИБКА: Не удалось создать виртуальное окружение"
        exit 1
    fi
    echo "[OK] Виртуальное окружение создано"
else
    echo "[OK] Виртуальное окружение найдено"
fi

# Активировать виртуальное окружение
echo "Активация виртуального окружения..."
source .venv/bin/activate
if [ $? -ne 0 ]; then
    echo "ОШИБКА: Не удалось активировать виртуальное окружение"
    exit 1
fi

echo "[OK] Виртуальное окружение активировано"
echo

# Установить зависимости в виртуальном окружении
echo "Установка зависимостей (может занять некоторое время)..."
pip install -q -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ОШИБКА при установке зависимостей"
    echo "Попробуйте выполнить вручную:"
    echo "pip install -r requirements.txt"
    exit 1
fi

echo "[OK] Зависимости установлены"
echo
echo "Запуск Flask сервера..."
echo "Сайт будет доступен по адресу: http://localhost:8080"
echo
python3 app.py