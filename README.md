# webXLights

Browser-based clone of xLights. See [ROADMAP.md](ROADMAP.md) for milestones and [DECISIONS.md](DECISIONS.md) for the locked stack.

## Local dev

```bash
docker compose up -d postgres        # Postgres on localhost:5433
cd apps/api && cp .env.example .env && php artisan key:generate && php artisan migrate
php artisan serve --port=8000        # apps/api
```

In another shell:

```bash
npm install                          # repo root, installs all workspaces
npm run dev                          # apps/web on localhost:5173, proxies /api + /sanctum to :8000
```

## Tests

```bash
npm run lint && npm run typecheck && npm run test   # apps/web + packages/*
cd apps/api && php artisan test
```

## Docker image

```bash
docker build -t webxlights-web .     # builds apps/web + apps/api into one nginx+php-fpm image
```
