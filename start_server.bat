@echo off
chcp 65001 >nul
echo Запуск дропшиппинг сайта...
echo.

REM Проверить наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ОШИБКА: Python не найден!
    echo Установите Python с https://www.python.org
    echo При установке отметьте "Add Python to PATH"
    pause
    exit /b 1
)

echo [OK] Python найден
echo.

cd backend

REM Проверить и создать виртуальное окружение
if not exist ".venv" (
    echo Создание виртуального окружения...
    python -m venv .venv
    if errorlevel 1 (
        echo ОШИБКА: Не удалось создать виртуальное окружение
        pause
        exit /b 1
    )
    echo [OK] Виртуальное окружение создано
) else (
    echo [OK] Виртуальное окружение найдено
)

REM Активировать виртуальное окружение
echo Активация виртуального окружения...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo ОШИБКА: Не удалось активировать виртуальное окружение
    pause
    exit /b 1
)

echo [OK] Виртуальное окружение активировано
echo.

REM Установить зависимости в виртуальном окружении
echo Установка зависимостей (может занять некоторое время)...
pip install -q -r requirements.txt
if errorlevel 1 (
    echo ОШИБКА при установке зависимостей
    echo Попробуйте выполнить вручную:
    echo pip install -r requirements.txt
    pause
    exit /b 1
)

echo [OK] Зависимости установлены
echo.
echo Запуск Flask сервера...
echo Сайт будет доступен по адресу: http://localhost:8080
echo.
python app.py
pause