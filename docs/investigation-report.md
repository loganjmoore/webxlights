# webXLights — Investigation Report

Read-only audit at `6963d79` (50 commits, sole author Logan Moore). No code changed. Every claim
cites a file and line.

---

## 1. Provenance and licensing exposure

**No `LICENSE`, `COPYING`, or `NOTICE` file exists anywhere**, and no source file carries a license
header. `apps/api/composer.json:9`'s `"license": "MIT"` is the inherited Laravel skeleton manifest
(line 3), not a statement about this work. The project is currently unlicensed.

**No C++ traces of any kind.** Searches for `wxWidgets`/`wx*` identifiers, `m_` prefixes, Hungarian
notation, `nullptr`, `std::`, `#include`, manual memory management and "Sean" return zero hits in
code; the two `wxWidgets` mentions are prose explaining a *divergence*
(`packages/engine/src/effects/text.ts:20`; `DECISIONS.md:683`). No vendored archives, no submodules,
no xLights-sourced dependencies.

**Git history shows no consultation of xLights source.** Searches across all 50 commits for
clone/port/decompile/copied-from language find only unrelated uses of "clone" (a model-duplication
feature). The method is documented repeatedly — *"Written from the official xLights manual…"*
(`DECISIONS.md:170`) — and `docs/MANUAL-COVERAGE.md:1-11` records a read of all 176 manual pages.

**384 `xLights` occurrences in code**, essentially all in comments and test names. Classification:

| Class | Meaning | Found here | Evidence |
|---|---|---|---|
| A | Verbatim / near-verbatim code | **None found** | No C++, no transliteration artifacts |
| B | Structurally derived | **None confirmed; one unresolvable chain — see below** | — |
| C | Interoperability only | **Extensive and expected** | `.fseq` v2 header bytes `packages/formats/src/fseq.ts:15-56`; `<xrgb>`/`DisplayAs`/`parm1-3` XML attributes `packages/formats/src/rgbeffects.ts:240-249`, `packages/engine/src/models/fromAttrs.ts:30-49`; node-range notation `packages/engine/src/models/subModel.ts:28`; FPP HTTP endpoints `apps/web/src/lib/fppConnect.ts:36-97` |
| D | Naming / vocabulary only | **Extensive** | Effect names (`packages/engine/src/effects/*.ts`), blend-mode names (`packages/engine/src/blend.ts:110+`), UI concepts (Views, Effect Presets: `apps/api/app/Http/Controllers/SequencerViewController.php:7-19`) |

**The one thing this codebase cannot answer.** 102 comments cite `SPEC ch<N>` as the authority for
render algorithms, but `xlights-functional-spec.md` **is not committed** (`ROADMAP.md:3`). Some
detail is specific enough to matter: `packages/engine/src/effects/fire.ts:24-35` builds a 200-entry
palette LUT with a hard-coded hue step of `0.00166666`; `blend.ts:110-130` implements exact mix
formulas. Whether that came from the manual, from observation, or from source is a property of the
missing SPEC, not of this repo. **This is the single open licensing question.**

Separately, ~102 verbatim quotations of xLights *manual* prose appear in comments — documentation
copyright, a far smaller exposure than GPL code.

---

## 2. Backend inventory

All 41 routes are in `apps/api/routes/api.php`. Every one is CRUD or AUTH. **There is not a single
COMPUTE route.**

| Method | Path | Controller | Does | Class |
|---|---|---|---|---|
| POST | `/auth/register` `/auth/login` | AuthController:13,33 | Create user / session | AUTH |
| POST/GET | `/auth/logout` `/auth/me` | AuthController:49,61 | Session teardown / whoami | AUTH |
| GET/POST | `/v1/projects` | ProjectController:10,18 | List / create project | CRUD |
| GET | `/v1/projects/{project}` | ProjectController:30 | Show project | **DEAD** — no caller in `apps/web/src/lib/api.ts` |
| GET | `/v1/projects/{p}/layouts` | LayoutController:10 | List layouts | CRUD |
| GET/POST/PATCH/DELETE | `/v1/layouts/{l}/models[/bulk\|/{m}]` | ModelEntityController | Model rows; bulk import upsert | CRUD |
| GET/POST/DELETE | `/v1/layouts/{l}/model-groups[…]` | ModelGroupController | Group rows + membership sync | CRUD |
| GET/PUT | `/v1/layouts/{l}/views`, `/effect-presets`, `/background` | SequencerViewController | Read/replace JSON blobs in `layouts.settings` | CRUD |
| GET/POST | `/v1/layouts/{l}/view-objects[/bulk]` | ViewObjectController | Gridlines/Mesh rows | CRUD |
| GET/POST/PATCH | `/v1/projects/{p}/sequences`, `/v1/sequences/{s}` | SequenceController:13,20,36,51 | Sequence records + settings | CRUD |
| PUT | `/v1/sequences/{s}/body` | SequenceController:83 | Autosave whole body JSON; ETag optimistic lock | CRUD |
| POST/GET | `/v1/sequences/{s}/audio` | SequenceController:106,122 | Store/stream audio file | CRUD |
| GET/POST ×2 | `/v1/layouts/{l}/versions[…]`, `/v1/sequences/{s}/versions[…]` | Layout/SequenceVersionController | Snapshot + restore | CRUD |
| GET/POST/DELETE | `/v1/projects/{p}/members` | ProjectMemberController | Share by email | CRUD |
| GET/POST/PATCH/DELETE | `/v1/projects/{p}/controllers`, `/v1/controllers/{c}` | ControllerController | Controller records | CRUD |

**If every CRUD and AUTH route were deleted, what would break?** Persistence, multi-device access
and sharing — nothing else. No rendering, parsing, export or conversion capability is lost, because
none of it lives here. Deleting the backend costs *storage and identity*, not *function*.

---

## 3. Where the compute lives

**100% client-side.** Grepping `apps/api/app` for `SimpleXML`, `DOMDocument`, `pack`/`unpack`, GD or
any render call returns nothing but the word "render" inside comments.

- **Render engine**: `packages/engine/` — 3,416 lines plus 51 effect modules, DOM-free by design;
  frame assembly at `packages/engine/src/renderFrame.ts:78-92`.
- **`.fseq` generation**: TypeScript, no library — writer `packages/formats/src/fseq.ts:15` (PSEQ
  v2, uncompressed), orchestration `apps/web/src/lib/fseqExport.ts:44`.
- **Layout/model XML parsing**: `packages/formats/src/rgbeffects.ts:240` via `fast-xml-parser`,
  called from the browser at `apps/web/src/lib/import.ts:1`.
- Also client-side: `.xsq`/MIDI/Papagayo import, beat detection, show packaging, video export, and
  FPP upload (`lib/fppConnect.ts` — the browser talks to the device directly).

**Operations impractical in a browser: none observed at real show scale.** The benchmark (20k
channels × 3,600 frames) renders in **~6.2s** on the main thread (`ROADMAP.md:48`, guarded by
`packages/engine/test/perf.test.ts`), and a **588MB `.fseq`** generated client-side from a real show
opened in desktop xLights (`PARITY.md:87`). The planned >300MB OPFS spill was never needed.

---

## 4. Data model

Postgres 17 (`render.yaml:4`). No dev DB is reachable here, so **row counts are unknown**.

| Table | Migration | Key columns | Scope | Metadata / Payload |
|---|---|---|---|---|
| `users` | `0001_01_01_000000` | name, email, password | global | metadata |
| `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `password_reset_tokens`, `personal_access_tokens` | Laravel defaults | — | infra | metadata |
| `projects` | `..._061116` | owner_id → users, settings jsonb | per-user | metadata |
| `layouts` | `..._065701` | project_id, **settings jsonb** | per-project | **payload** — holds views, effect presets, and a background image data-URL up to 8MB |
| `models` | `..._065702` + 4 alters | params, raw_attrs, screen, sub_models, states, **faces** jsonb | per-project | **payload** — `faces` carries base64 matrix images |
| `model_groups`, `model_group_members` | `..._065703/4` | membership join | per-project | metadata |
| `view_objects` | `2026_08_12_010000` | raw_attrs jsonb | per-project | metadata |
| `sequences` | `..._071821` + 3 alters | **body jsonb**, frame_ms, audio_path, metadata | per-project | **payload** — every effect on every row |
| `sequence_versions` | `..._082635` | body jsonb ×N | per-project | **payload** |
| `layout_versions` | `2026_08_15_003000` | snapshot jsonb (20 auto retained) | per-project | **payload** |
| `project_members` | `..._082636` | project_id, user_id, role | **cross-user** | metadata |
| `controllers` | `..._160000` | ip, start_channel, channel_count | per-project | metadata |

**Row Level Security: not enabled anywhere** — no `CREATE POLICY`, no `ROW LEVEL SECURITY` in any
migration. Authorization is entirely application-level: `Project::authorize()`
(`apps/api/app/Models/Project.php:56-63`), called at the top of every controller action.

**Cross-user surface — the only thing a Drive-backed model cannot replicate:** the
`project_members` join, and `ProjectMemberController.php:26-27` looking up a stranger by email.
Everything else is strictly owner-scoped through cascading FKs.

---

## 5. Auth and identity

Yes — Laravel Sanctum 4.3 in **session-cookie (stateful) mode**, guard `web`
(`apps/api/config/sanctum.php:40`); register/login at `AuthController.php:13-47`, CSRF primed via
`/sanctum/csrf-cookie` (`api.ts:296`).

- **Passwords**: stored in `users.password`, bcrypt (`Hash::make`, `AuthController.php:24`;
  `'password' => 'hashed'`, `User.php:44`; `BCRYPT_ROUNDS=12`). Minimum 8 chars, no breach check.
- **Google OAuth**: none. No Socialite, no OAuth client, no scopes anywhere.
- **Unauthenticated routes touching user data**: none — only `register`/`login` sit outside
  `auth:sanctum` (`routes/api.php:17-20`). `personal_access_tokens` exists but no code issues a
  token; Sanctum guards sessions only.

---

## 6. File handling

| Format | Direction | Where |
|---|---|---|
| `xlights_rgbeffects.xml` | read | `packages/formats/src/rgbeffects.ts:240` |
| `.xsq` | read (+ convert to fseq) | `packages/formats/src/xsq.ts`, `apps/web/src/lib/xsqConvert.ts` |
| `.fseq` (PSEQ v2, uncompressed) | **write** + header read | `packages/formats/src/fseq.ts:15,66` |
| `.mid`, `.pgo` | read | `midi.ts`, `papagayo.ts` |
| audio (any browser-decodable) | read + upload | `apps/web/src/lib/audio.ts`, `SequenceController.php:106` |
| images (backdrop, faces, Pictures effect) | read → base64 into DB | `SequencerViewController.php:76`, `ModelEntityController.php:110` |
| `.zip` show package, `.xpreset`, `.json` | read/write | `lib/packageShow.ts`, `SequencerPage.vue:2187` |

**Sizes observed**: 588MB `.fseq` export (`PARITY.md:87`); 1.25MB rgbeffects import
(`CHANGELOG.md:1641`); autosave <500KB typical (`ROADMAP.md:46`).

**Limits conflict.** nginx allows 100M (`docker/nginx.conf:8`); Laravel validates audio at 50MB
(`SequenceController.php:110`) and backdrop data-URLs at 8,000,000 chars
(`SequencerViewController.php:76`). But **no `php.ini` is installed** — `apps/api/docker/` holds only
nginx/supervisord/entrypoint files and the `Dockerfile` copies no ini, so `php:8.4-fpm-alpine`'s
compiled-in defaults (`upload_max_filesize=2M`, `post_max_size=8M`) should apply, putting the 50MB
limit and large body autosaves out of reach in production. *Inferred, not observed.*

**Validation**: uploads are **trusted, not verified** — the audio route checks only `file` and size,
no MIME allowlist or sniffing; backdrops get `starts_with:data:image/`, a prefix match on
attacker-controlled input. Files land on **local disk**: the `audio` disk
(`config/filesystems.php:52-54`) rooted at `AUDIO_STORAGE_PATH`, a 5GB Render persistent disk. No S3,
no R2 (abandoned, `DECISIONS.md:29`), no DB blobs beyond the base64 images above. Audio is never
public — `SequenceController::audio:122` re-checks access before streaming.

---

## 7. Frontend/backend coupling

**Very low, and already funnelled.** Plain `fetch` behind one wrapper — `request<T>()` at
`apps/web/src/lib/api.ts:14` — and one flat `api` object of ~45 methods (`api.ts:295-397`). No axios,
no Inertia, no Livewire.

- **Files calling `api.*`: 14** (3 Pinia stores, 6 pages, 1 component, 4 lib modules).
- 23 further files import from `api.ts` **for types only** — they would not change.
- **`fetch` outside `api.ts` never touches this backend**: 5 calls to an FPP device
  (`lib/fppConnect.ts:36-97`) and one at `SequencerPage.vue:688` using a URL `api` produced.

**Estimate to swap the storage layer behind `list`/`read`/`write`/`delete`: 1 file rewritten
(`api.ts`), 1 touched (`SequencerPage.vue:688`), 14 call-site files unchanged if method signatures
hold.** Coupling is to *method names*, not HTTP — a Drive or File System Access adapter is a day's
work, not a rewrite.

---

## 8. Secrets and hygiene

- `.env` **is** gitignored (`apps/api/.gitignore:3-5`, plus `.env.backup`, `.env.production`).
- **It was never committed.** `git log --all --diff-filter=A` over `*.env` returns nothing;
  `git ls-files | grep -i env` returns only `apps/api/.env.example`. **Nothing requires rotation.**
- `.env.example` exists, with every secret value blank.
- **No credentials in tracked files.** Sweeps for `sk-…`, `AKIA…`, `ghp_…`, `postgres://…@`, and
  generic `key/secret/token/password = "…"` (excluding lockfiles) return zero hits. The only DB
  credentials are the local-only `webxlights/webxlights` pair in `docker-compose.yml:5-7`.
- **Dependency audit — clean on both sides.**

| Audit | Critical | High | Moderate | Low | Total deps |
|---|---|---|---|---|---|
| `npm audit --package-lock-only` | 0 | 0 | 0 | 0 | 330 |
| `composer audit --locked` | 0 | 0 | 0 | 0 | "No security vulnerability advisories found" |

---

## 9. Deployment reality

Deployed to **Render**, autoDeploy on push to `main`, at `https://webxlights-web.onrender.com`
(`DECISIONS.md:25-30`).

| Component | Config | Notes |
|---|---|---|
| `webxlights-web` | `render.yaml:7-46`, Docker, Starter, health `/up` | One container: nginx serves the Vue SPA build **and** proxies `/api\|/sanctum\|/up` to php-fpm (`nginx.conf:15-26`) |
| `webxlights-worker` | `render.yaml:48-60`, `php artisan queue:work` | **`apps/api/app/Jobs/` does not exist.** Nothing in the codebase dispatches a job. This service processes an always-empty queue |
| `webxlights-db` | `render.yaml:1-4`, Postgres 17, Basic-1GB | |
| `webxlights-audio` disk | `render.yaml:15-18`, 5GB at `/var/data` | Pins the web service to one instance — a local disk cannot be shared across replicas |
| CI | `.github/workflows/ci.yml` | Node: lint + typecheck + 103 vitest files. PHP: composer install, migrate against real Postgres, `artisan test` (9 feature test files) |

The `Dockerfile` builds three stages: Node 22 → `apps/web/dist`, composer → vendor,
`php:8.4-fpm-alpine` combining both. `entrypoint.sh:20-40` migrates on every boot with 5 retries and
deliberately fails the boot on error, because `preDeployCommand` is not honored for API-created
Docker services (`DECISIONS.md:559`).

**Runtime env vars**: `APP_KEY`, `APP_URL`, `DB_CONNECTION=pgsql`, `DB_URL` (*not* `DATABASE_URL` —
`DECISIONS.md:855`), `SESSION_DRIVER`, `QUEUE_CONNECTION`, `AUDIO_STORAGE_PATH`,
`SANCTUM_STATEFUL_DOMAINS` (set by hand, `render.yaml:44`), optional `RUN_MIGRATIONS`.

**Monthly cost**: plan *tiers* are determinable (2 × Starter, Basic-1GB Postgres, 5GB disk); dollar
amounts are not in the repo. At Render's list rates, roughly **$35–45/month**, of which the worker
(~$7) does nothing.

---

## 10. Verdict

**1. Licensing — no Class A/B material found, but one link is unverifiable.** Every provenance test
this repo can run is clean: no C++, no wx types, no vendored code, no submodules, no history of
consulting source, and a documented method of building from the published manual
(`DECISIONS.md:170`, `docs/MANUAL-COVERAGE.md:1-11`). What is present is Class C interop constants
— `.fseq` bytes, `<xrgb>` attributes, node-range notation, FPP endpoints — exactly what those
formats require, plus Class D vocabulary. GPLv3 therefore looks like a **choice, not an
obligation**. But 102 comments defer to `xlights-functional-spec.md`, absent from the repo
(`ROADMAP.md:3`), and its provenance decides the answer: **read that document before concluding**,
because if it was written from source, the effect implementations become Class B.

**2. Can the backend be deleted? — Functionally yes, in practice partially.** All 41 routes are CRUD
or AUTH; there is no COMPUTE route. Rendering, `.fseq` writing, XML parsing, MIDI/Papagayo import,
beat detection, video export and FPP upload run in the browser at real scale (588MB exported
client-side; 20k channels in 6.2s). Two things force a server to stay: **identity** (bcrypt
passwords, sessions) and **cross-user sharing** via `project_members` and the share-by-email lookup
(`ProjectMemberController.php:26`) — both replaceable by a third-party identity provider and its own
sharing primitive.

**3. Static + Google Drive viability — no compute blocker; the work is sharing semantics.** The swap
is cheap: one `request()` wrapper (`api.ts:14`), one `api` object, 14 calling files. Drive replaces
file storage and, with Google sign-in, both identity and `project_members`. Three things need
handling, none fatal: the ETag optimistic lock (`SequenceController.php:83-99`) must map onto Drive
revisions or accept last-writer-wins; the auto-pruned 20-snapshot layout history
(`LayoutVersionController.php:20,139`) becomes Drive revisions; and the base64 images in
`layouts.settings` and `models.faces` should become real Drive files.

**4. If a database is kept — metadata, plus payload that has nowhere else to go today.** Metadata:
users, projects, layouts, model geometry, groups, controllers, members. Payload: `sequences.body`
(every effect on every row — the actual creative work), the two version tables snapshotting it, and
the embedded base64 images. Metadata-only works once bodies and images move to object storage, and
nothing in the schema resists that: no query reads inside those JSON blobs.

**5. Cheapest correct architecture — static SPA + hosted identity/storage, ~$0–7/month.** The server
computes nothing, so today's three services pay for a PHP runtime that proxies JSON to Postgres.
Cheapest correct shape: serve `apps/web/dist` from any static host ($0), keep sequence bodies and
audio in Drive or object storage, take identity and sharing from Google sign-in. Two savings apply
regardless: **delete `webxlights-worker`** (`render.yaml:48` — no `app/Jobs/` exists and nothing
dispatches a job, so it drains an empty queue forever, ~$7/month), and drop the 5GB disk once audio
moves off local storage, which also unpins the web service from one instance. A conservative middle
path — static frontend, small Postgres, thin auth — lands near **$7–20/month**.

---

### What this report could not determine

| Question | Why | What would answer it |
|---|---|---|
| Whether the effect algorithms are Class B | `xlights-functional-spec.md` is not committed (`ROADMAP.md:3`) | Read that document's own provenance |
| Row counts per table | No dev DB reachable in this environment | `\dt+` / `SELECT count(*)` against `webxlights-db` |
| Effective PHP upload limits in production | No `php.ini` in the image; defaults inferred from the base image | `php -i \| grep -E 'post_max_size\|upload_max_filesize'` in the running container |
| Exact monthly spend | Only plan tiers are in `render.yaml`, no prices | The Render billing dashboard |
