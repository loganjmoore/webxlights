# CLAUDE.md

Working notes for agents and contributors. The README covers setup; this covers the decisions
that are locked and the conventions the code follows.

## What this is

A browser-based xLights: layout editor, sequencer, 3D visualiser, shader library, `.fseq`
export. The hosted copy is **pixl** at pixl.community; webXLights is the name of the code.
GPL-3.0.

## Layout

- `apps/web`: Vue 3 + TypeScript + Vite + Pinia. Marketing site is static HTML in `public/site/`.
- `apps/api`: Laravel, Sanctum cookie sessions, Postgres in production, SQLite in tests.
- `packages/engine`: the render engine. DOM-free, CPU-first, worker pool, SharedArrayBuffer
  frame store, seeded RNG. Shared by the app and its tests.
- `packages/formats`: xLights file parsers and writers (`xlights_rgbeffects.xml`, `.xsq`,
  `.fseq`), plus ISF, MIDI and Papagayo.
- `packages/shaders/library`: the built-in ISF shaders. Not in the runtime image; baked into
  `apps/api/database/data/builtin-shaders.json` by `tools/shader-check/bake-builtins.mjs`, and
  `php artisan shaders:publish-builtins` upserts that JSON on boot. CI fails if they drift.
- `tools/shader-check`: the shader-assistant bake-off harness and its recorded results.

## Locked decisions

Do not change these without recording why in this file.

- **Runtime pins:** PHP 8.4 and Node 22. Dependabot is told to skip majors for both; PHP 8.5
  broke the image build (opcache) and took production down once.
- **One Docker image** serves the SPA and the API: nginx in front of php-fpm, the Vue build
  copied into `public/app`. `render.yaml` runs it as a web service plus a queue worker.
- **Cross-origin isolation from day one.** COOP `same-origin` and COEP `require-corp` on every
  response, because the engine needs `SharedArrayBuffer`. The Vite dev server sets them too.
- **Content-Security-Policy forbids inline and third-party scripts.** Shaders are user content
  that runs on the GPU; the page never evaluates a byte of it as JavaScript.
- **Timeline grid is a custom virtualized canvas.** No DOM grid or timeline libraries.
- **House preview is Three.js.**
- **Migrations run at container start** (`apps/api/docker/entrypoint.sh`), not by hand and not
  through `preDeployCommand`, which Render does not honour for this service.
- **Secrets only in environment variables.** `render.yaml` marks them `sync: false`. Nothing in
  the repo is a credential.
- **nginx resolves the real client IP** from the rightmost `X-Forwarded-For` entry so the
  per-IP throttles on register, login and generation are per client, not per proxy.

## Conventions

- Dark chrome, one warm accent (`--accent`), tokens in `apps/web/src/style.css`. System sans,
  fixed rem scale, tabular numerals for anything that ticks. Accent means "current" or
  "primary", never decoration.
- Effect and model names follow xLights vocabulary so a desktop user recognises them.
- Every project resource goes through `Project::authorize()` with owner, editor and viewer
  levels. A project you are not a member of is a 403; a shader you cannot see is a 404.
- Uploads are audio only, allow-listed by extension, capped at 50MB, stored outside the web
  root and served with `nosniff` after the project check.
- Add a test when fixing a bug. CI runs `npm run lint`, `npm run typecheck`, `npm run test`,
  `php artisan test` and a full Docker image build on every pull request.

## Commands

```bash
npm install && (cd apps/api && composer install)
docker compose up -d postgres
cd apps/api && cp .env.example .env && php artisan key:generate && php artisan migrate && php artisan serve --port=8000
npm run dev                                       # repo root, http://localhost:5173
npm run lint && npm run typecheck && npm run test
cd apps/api && php artisan test
```
