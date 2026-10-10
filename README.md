# Metodotsint AI

Русскоязычная веб-IDE для создания игр Godot с Android-планшета.

## Что есть
- Чат ИИ с провайдерами OpenRouter / OpenAI / Gemini / Claude
- Генерация и исправление GDScript
- Дерево файлов проекта
- Редактор кода в браузере
- Импорт / экспорт ZIP
- Сохранение, история изменений, резервные копии
- Адаптация под планшет
- Ключи хранятся на сервере в `.env`

## Публикация на планшете
1. Установите Termux.
2. Введите команды:

```bash
apt update && apt upgrade -y
pkg install -y git curl nodejs npm

cd ~
git clone https://github.com/metosint/metodotsint-ai.git
cd metodotsint-ai
```

3. Установите backend:

```bash
cd server
npm install
cp .env.example .env
```

4. Установите frontend:

```bash
cd ../client
npm install
```

5. Запустите backend и frontend в разных терминалах:

```bash
cd ~/metodotsint-ai/server
npm start
```

```bash
cd ~/metodotsint-ai/client
npm run dev
```

6. Откройте в браузере планшета URL:

```text
http://localhost:5173
```

или через IP Termux:

```bash
hostname -I
```

## Настройки AI
В приложении откройте вкладку "Настройки" и введите API Key, провайдер и модель. Ключ сохраняется на сервере, а не в браузере.

## Бесплатные решения
- OpenRouter — лучше всего для бесплатных кредитов.
- Gemini — тоже хороший вариант.
- Локально можно использовать малые модели, но это уже отдельный сценарий.

## Для публикации с планшета без ПК
- используйте Cloudflare Tunnel или Tailscale.

Пример:

```bash
curl -L https://github.com/cloudflared/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
chmod +x cloudflared
./cloudflared tunnel --url http://localhost:5173
```

## License
MIT
