# webXLights

A browser-based sequencer for holiday light shows, in the spirit of [xLights](https://xlights.org):
build your layout, sequence effects to music, preview in 3D and export `.fseq` files for your
controllers. It runs entirely in the browser plus a small API.

The hosted copy is called **pixl** and lives at [pixl.community](https://pixl.community).
webXLights is the name of the code. Licensed under the GPL-3.0, like xLights itself
(see [LICENSE](LICENSE)).

## What is in this repo

Everything: the frontend, the backend, and the shared engine. One Docker image serves it all.

| Path | What it is |
|---|---|
| `apps/web` | The Vue 3 + TypeScript single-page app (Vite). The marketing site is the static HTML in `apps/web/public/site/`. |
| `apps/api` | The Laravel API: accounts, projects, layouts, sequences, the shader library, the shader assistant. Postgres in production, SQLite for tests. |
| `packages/engine` | The render engine: models, effects, blending, frame assembly. DOM-free, shared by the app and its tests. |
| `packages/formats` | Parsers and writers for xLights files: `xlights_rgbeffects.xml`, `.xsq`, `.fseq`, plus ISF, MIDI and Papagayo. |
| `packages/shaders` | The built-in shader library: ISF fragment shaders baked into the API's seed data. |
| `tools/shader-check` | The shader assistant bake-off harness and its results. |
| `docs/` | Design notes and feature specs. |

The other top-level documents: [ROADMAP.md](ROADMAP.md) for milestones,
[DECISIONS.md](DECISIONS.md) for the locked stack and why, [DESIGN.md](DESIGN.md) for the interface
rules, [CHANGELOG.md](CHANGELOG.md) for what shipped when, and [SECURITY.md](SECURITY.md) for the
security model and how to report a vulnerability.

## Running it on your own machine

### Prerequisites

- **Node.js 22** and npm (the version CI and the Docker image use).
- **PHP 8.4** with the `pdo_pgsql`, `pdo_sqlite`, `mbstring`, `xml` and `zip` extensions, and
  [Composer](https://getcomposer.org).
- **Docker** (for the local Postgres), or your own Postgres 17 on port 5433.

### 1. Clone and install

```bash
git clone https://github.com/loganjmoore/webxlights.git
cd webxlights
npm install                          # installs apps/web and packages/* (npm workspaces)
cd apps/api && composer install && cd ../..
```

### 2. Start Postgres

```bash
docker compose up -d postgres        # Postgres 17 on localhost:5433, user/password "webxlights"
```

### 3. Configure and migrate the API

```bash
cd apps/api
cp .env.example .env                 # already points at the Docker Postgres above
php artisan key:generate
php artisan migrate
php artisan serve --port=8000
```

Leave that running. The `.env.example` defaults are enough for local development. Everything
optional is off until you set it:

| Variable | Turns on |
|---|---|
| `SHADER_API_KEY`, `SHADER_PROVIDER`, `SHADER_MODEL` | Server-funded shader generation. Leave unset and generation answers 503 while the rest of the shader library works. |
| `LYRICS_API_KEY` | Automatic lyric timing (OpenAI `whisper-1`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continue with Google". Redirect URI is `<origin>/api/auth/google/callback`. |

### 4. Start the web app

In a second terminal, from the repo root:

```bash
npm run dev                          # http://localhost:5173, proxies /api and /sanctum to :8000
```

Open http://localhost:5173, register an account, and you are in. The dev server sends the
cross-origin-isolation headers the engine needs for `SharedArrayBuffer`, so use that URL rather
than opening the built files directly.

### Running the tests

```bash
npm run lint && npm run typecheck && npm run test   # apps/web + packages/* + tools
cd apps/api && php artisan test                     # runs against in-memory SQLite
```

CI runs the same commands plus a full Docker image build on every pull request
(`.github/workflows/ci.yml`).

### Building the production image

```bash
docker build -t webxlights-web .     # apps/web + apps/api in one nginx + php-fpm image
```

`render.yaml` describes the hosted deployment: a web service, a queue worker, a Postgres
database and a persistent disk for audio. For running your own copy for other people, read the
self-hosting checklist in [SECURITY.md](SECURITY.md#self-hosting-checklist) and the
[self-hosting page](apps/web/public/site/self-hosting.html) of the site.

## Contributing

Contributions are welcome, and the process is deliberately simple.

- **Found a bug or want a feature? Open a GitHub issue.** Use
  [Issues](https://github.com/loganjmoore/webxlights/issues) for bugs, questions, feature
  requests and anything you are not sure about. Say what you did, what you expected, and what
  happened. For a bug in an import, attach the file that triggers it if you can.
- **Security problems are the exception.** Do not open a public issue; follow
  [SECURITY.md](SECURITY.md) instead.
- **Pull requests.** Anyone can open one. Fork the repo, branch from `main`, and open a pull
  request against `main`. CI must pass, and every pull request needs an approving review from
  the maintainer before it can merge; `main` only changes through merged pull requests. Please
  open an issue first for anything larger than a small fix, so the approach is agreed before
  the work is done.
- **Keep the tests green.** `npm run lint && npm run typecheck && npm run test` and
  `php artisan test` are what CI runs. Add a test when you fix a bug.
- **Read [DECISIONS.md](DECISIONS.md) before proposing a stack change.** The runtime, framework
  and hosting choices are locked there, with the reasons.
