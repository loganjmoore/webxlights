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

## Deviation log

- 2026-08-10: `composer create-project laravel/laravel` installs Laravel 13.x (goal prompt said "12.x-ish LTS"). Laravel 12 is not what `laravel/laravel` resolves to as of this date; using current stable 13 instead of pinning back to an EOL-adjacent 12.
- 2026-08-10: PHP 8.4, not 8.3 (goal prompt §4 locked 8.3). Laravel 13's Symfony 8.x dependency tree requires PHP >=8.4.1 (`symfony/console`, `http-kernel`, etc.) — confirmed via `composer why-not php 8.3` and a failed container boot on `php:8.3-fpm-alpine`. `composer.json` and the Dockerfile base image both bumped to 8.4.
