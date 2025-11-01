# Armico CRM Monorepo

Armico — модульная CRM для управления организациями, рабочими местами и назначениями сотрудников. Репозиторий организован как pnpm-монорепозиторий с сервисами backend (NestJS + Prisma) и frontend (React + Vite + Ant Design).

## Требования

- Node.js 20+
- pnpm 8+
- Docker и Docker Compose

## Быстрый старт (dev)

```bash
pnpm install

# Поднять инфраструктуру
docker compose up -d postgres redis

# Сгенерировать Prisma клиент и выполнить первую миграцию
pnpm -C backend prisma:gen
pnpm -C backend prisma:migrate

# Запустить фронтенд и бэкенд параллельно
pnpm -r dev
```

Backend стартует на `http://localhost:3000`, frontend — на `http://localhost:5173`.

## Переменные окружения

Скопируйте примеры `.env` и настройте при необходимости:

- `backend/.env.example` → `backend/.env`
- `frontend/.env.example` → `frontend/.env`

По умолчанию backend подключается к базе `postgres` и Redis из docker-compose, а frontend обращается к API `http://localhost:3000`.

## Структура проекта

```
├── backend          # NestJS + Prisma API
│   ├── Dockerfile
│   ├── prisma/
│   └── src/
├── frontend         # React + Vite клиент
│   ├── Dockerfile
│   └── src/
├── docker-compose.yml
├── package.json     # корневые скрипты, линтеры и хуки
└── pnpm-workspace.yaml
```

### Линтинг и форматирование

- `pnpm lint` — ESLint по всему репо
- `pnpm format` — Prettier
- Husky + lint-staged выполняют проверку и автоформат при коммите

## Аккаунт по умолчанию

При первом запуске backend создаёт организацию и пользователя `admin@armico.local / admin123` — используйте его для входа на фронтенде.
