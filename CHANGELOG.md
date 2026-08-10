# Changelog

## M0 — Skeleton + deploy

Live at https://webxlights-web.onrender.com.

- Monorepo scaffold: `apps/web` (Vue 3 + TS + Vite + Pinia), `apps/api` (Laravel 13 + Sanctum), `packages/engine` (TS render engine), `packages/formats` (stub).
- `packages/engine`: RenderBuffer, Matrix model geometry (Vertical/Top Left/zigzag), On effect — golden-frame Vitest suite proves the harness.
- `apps/api`: Sanctum SPA cookie auth (register/login/logout/me), project CRUD scoped to owner, Postgres + jsonb, PHPUnit feature tests.
- `apps/web`: auth + projects + empty layout page, Pinia stores, COOP/COEP headers verified (`crossOriginIsolated === true`) in local dev.
- Verified end-to-end locally: register → create project → land on empty layout page, survives reload (session + DB persistence).
- CI: GitHub Actions (lint/typecheck/vitest for Node workspaces, PHPUnit + a real-Postgres migration check for the API).
- Docker: multi-stage Dockerfile (Vue build + Laravel, nginx+php-fpm via supervisord) builds locally; `render.yaml` blueprint written (web + worker + Postgres).
- Smoke-tested the built image directly (register → create project → list projects → SPA static serve, all through nginx+php-fpm) — full request path works outside of `php artisan serve`/Vite dev.
- Deployed: GitHub repo pushed, Render Postgres + web service + worker provisioned via the Render API, migrations run as a one-off job. Verified the full loop live in-browser on the Render URL: register → create project → land on empty layout page, `crossOriginIsolated === true`.
- R2 bucket not yet created (credentials on hand were bucket-scoped, not account-scoped) — deferred to M2, the first milestone that needs file upload.
