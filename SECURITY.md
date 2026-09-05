# Security

webXLights is a hosted web app and a self-hostable one, so it has to be safe to run for strangers.
This is what the app does about that, and how to tell us when it gets something wrong.

## Reporting a vulnerability

Email **loganjmoore@gmail.com** with "webXLights security" in the subject. Say what you found,
how to reproduce it, and what you think it lets an attacker do. You will get a reply within a few
days. Please do not open a public issue for a vulnerability until a fix has shipped.

## The model

- **Accounts and sessions.** Laravel Sanctum, cookie sessions, CSRF-checked on every write.
  Passwords are bcrypt-hashed, never logged. Register and login are throttled per IP.
- **Authorization.** Every project resource goes through one gate (`Project::authorize()`),
  which knows three levels: owner, editor, viewer. Nothing is reachable by guessing an id: a
  request for a project you are not a member of is a 403, and a shader you cannot see is a 404.
- **Shaders run on the GPU, never as script.** The library is user content. A shader is GLSL
  compiled by WebGL in the browser's own sandbox; the page never evaluates a byte of it as
  JavaScript. The Content-Security-Policy (`apps/api/docker/nginx.conf`) forbids inline and
  third-party scripts entirely, so a shader's text, description or name cannot become code.
- **The shader assistant.** A user's own API key is sent as a header, used for that one call,
  and never stored, logged or cached. The description is screened for prompt injection before
  any money is spent, the model is told the description is data, and whatever comes back must
  parse as ISF and compile before anyone is offered the chance to publish it. Server-funded
  calls are credit-limited, per-minute throttled and daily-capped.
- **Uploads.** Audio only, by extension allow-list, 50MB, stored outside the web root and
  served back with `nosniff` after the project check. Layout and sequence imports are parsed
  in the browser.
- **Headers.** COOP/COEP (for SharedArrayBuffer), CSP, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS. Session cookies are `Secure` and `SameSite=Lax`
  in production.
- **Secrets.** Only in environment variables. `APP_DEBUG` is off in production. Nothing in the
  repo is a credential; `.env` is ignored.

## Self-hosting checklist

- Set `APP_KEY`, `APP_URL`, `SANCTUM_STATEFUL_DOMAINS` and `SESSION_SECURE_COOKIE=true`.
- Leave `SHADER_API_KEY` unset unless you want to fund generations for your users; with
  `SHADER_ALLOW_USER_KEYS` on, people bring their own.
- Keep the app behind TLS. The cookie settings assume it.
- Dependabot (`.github/dependabot.yml`) opens pull requests for dependency updates; merge them.
