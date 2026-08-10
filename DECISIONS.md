# DECISIONS.md

Locked technical decisions (goal prompt §4). Do not relitigate without recording a deviation here with one line of why.

| Area | Decision |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite + Pinia |
| Timeline grid | Custom canvas, virtualized rows — no DOM timeline/grid libraries |
| House preview | Three.js — THREE.Points for pixel nodes, InstancedMesh for 3D bulbs later |
| Effect engine | TypeScript, CPU-first, Web Worker pool sized by `navigator.hardwareConcurrency`, SharedArrayBuffer frame store, OPFS spill >300MB, seeded RNG (mulberry32) |
| Isolation | COOP: same-origin + COEP: require-corp from day 1 |
| Backend | PHP 8.3 + Laravel 12 in Docker on Render (nginx + php-fpm) |
| DB | Managed Postgres on Render (Basic-1GB to start), jsonb for open-ended params |
| Auth | Laravel Sanctum, email+password first |
| Object storage | Cloudflare R2 (S3-compatible), presigned direct browser upload/download |
| Queues | Laravel queue worker as separate Render Background Worker |
| Websockets | Laravel Reverb, own Render service, not before M7 |
| fseq writer | Browser-side. v2 uncompressed + zlib (native CompressionStream) first, zstd-wasm next |
| Audio | Native AudioContext.decodeAudioData; ffmpeg.wasm only as last-resort fallback, never in base bundle |
| Live lights output | None from browser/cloud in phase 1 (fseq download only). Phase 2 (M8) = direct browser→FPP HTTP upload on LAN (Chromium LNA). Bridge daemon = post-v1. |
| Hosting shape | 3 Render services (web Docker, worker Docker, Reverb later) + Postgres + R2 |

## Deployed infrastructure (M0)

- GitHub: https://github.com/loganjmoore/webxlights (private)
- Render Postgres: `webxlights-db` (Basic-1GB, Ohio)
- Render web service: `webxlights-web` → https://webxlights-web.onrender.com (Starter, Docker, autoDeploy on push to `main`)
- Render worker: `webxlights-worker` (Starter, `php artisan queue:work`)
- R2 bucket: not yet created — the only credentials on hand (brightprompt-hub's R2 token) turned out to be bucket-scoped, not account-scoped, so `CreateBucket` was denied. Not a blocker for M0 (no file uploads yet); needed by M2. Needs either a fresh R2 API token with bucket-create scope, or Logan creating the bucket by hand in the Cloudflare dashboard.
- Migrations run as one-off Render Jobs after deploy (`preDeployCommand` isn't exposed by the public Render API for docker services, only via the dashboard/Blueprint sync) — `render.yaml` still declares it for whenever the project switches to Blueprint-based deploys.

## M1 simplifications (documented ceilings, not silent gaps)

- Matrix geometry: Vertical / Top Left / zigzag-on / strandsPerString=1 only. Horizontal, other starting corners, Don't Zig Zag, Alternate Nodes, Strands/String > 1 are unimplemented — add when a real imported model needs them.
- Arches/Star/Circle: non-layered / single-ring only. Layered Arches, multi-layer Star (Layer Sizes, Inner Layer %) deferred.
- Custom model: plain `CustomModel` grid format only; the compressed `CustomModelCompressed` variant (`node,row,col[,layer];...`) is unimplemented.
- Screen placement on import uses `WorldPosX/Y` (+`ScaleX` for Boxed types) only — gives correct *relative* positions between models but not exact per-type rotation/shear (3pt Angle/Shear/Height, 2pt X2/Y2 endpoints).
- Layout canvas is read-only render for M1 — no drag-to-reposition, no background photo underlay (needs R2, deferred to M2).

## Deviation log

- 2026-08-10: `composer create-project laravel/laravel` installs Laravel 13.x (goal prompt said "12.x-ish LTS"). Laravel 12 is not what `laravel/laravel` resolves to as of this date; using current stable 13 instead of pinning back to an EOL-adjacent 12.
- 2026-08-10: `render.yaml`'s Postgres connection env var is named `DB_URL`, not `DATABASE_URL`. `config/database.php`'s pgsql connection reads `env('DB_URL')` — using Render's own `DATABASE_URL` convention there silently falls back to `DB_DATABASE` default `laravel` on `127.0.0.1:5432` and fails at migrate time with a misleading "connection refused" instead of a config error.
- 2026-08-10: PHP 8.4, not 8.3 (goal prompt §4 locked 8.3). Laravel 13's Symfony 8.x dependency tree requires PHP >=8.4.1 (`symfony/console`, `http-kernel`, etc.) — confirmed via `composer why-not php 8.3` and a failed container boot on `php:8.3-fpm-alpine`. `composer.json` and the Dockerfile base image both bumped to 8.4.
