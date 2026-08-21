# What the shader assistant costs to run

Numbers for anyone deciding whether to point a public instance at their own API key.

## How a generation is billed — measured, 2026-08-21

One generation is one API call. The token counts below are **measured from the provider's own
`usage` accounting** across the whole 26-description corpus in `tools/shader-check/corpus.json`
(run with `tools/shader-check/generate.mjs`; per-run files in `tools/shader-check/results/`).
They replace the character-count estimates this document used to carry.

| | Claude Haiku 4.5 | Claude Sonnet 5 (no thinking) |
| --- | --- | --- |
| input per shader (system prompt + description) | **~1,520 tokens** | ~2,260 tokens |
| output per shader (the ISF file) | **~560 tokens** | ~920 tokens |
| first-draft compile rate, both dialects | **26/26** | 25/26 |
| repair calls across the corpus | 0 | 1 |

The measurement path adds roughly 200 tokens per call of CLI framing to the input, so the
server's real input cost is slightly *lower* than the numbers above. Thinking was off, matching
the server's driver, which does not buy thinking for these models — with thinking on, the
reasoning would cost more than the shader (it bills at the output rate), which is why the
driver leaves it off for the cheap tier.

## Cost per working shader

Published prices per million tokens, **checked 2026-08-21**. Prices change often — re-check
before relying on them, and treat this table as dated rather than current.

The two Claude rows are fully measured: real tokens, real compile rate, repairs included. The
other rows are that price sheet applied to **Haiku's measured token profile** — their prices
are real but their *compile rates are unmeasured* (this environment had no keys for them), and
a model that needs repair calls eats its own discount. Cost per working shader is the metric,
and for the unmeasured rows only the numerator is known.

| Provider / model | Input | Output | Per working shader | Per $1 | Basis |
| --- | --- | --- | --- | --- | --- |
| Gemini free tier | $0 | $0 | **free** | — | see terms note |
| Ollama / local | $0 | $0 | **free** | — | unmeasured |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | ~$0.0004 | ~2,600 | price sheet only |
| DeepSeek v4-flash (off-peak) | $0.22 | $0.66 | ~$0.0007 | ~1,400 | price sheet only |
| DeepSeek v4-flash (peak) | $0.44 | $1.32 | ~$0.0014 | ~710 | price sheet only |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 | ~$0.0019 | ~540 | price sheet only |
| Grok build-0.1 | $1.00 | $2.00 | ~$0.0026 | ~380 | price sheet only |
| Grok 4.3 | $1.25 | $2.50 | ~$0.0033 | ~300 | price sheet only |
| **Claude Haiku 4.5 (default)** | $1.00 | $5.00 | **$0.0043** | **~230** | **measured, 0 repairs** |
| Claude Sonnet 5, no thinking | $3.00 | $15.00 | $0.021 | ~49 | measured, 1 repair in 26 |

Kimi (Moonshot) is supported but its per-token rates are not listed here — they were not
retrievable at the time of writing, and a guessed number is worse than an absent one.

For a sense of scale — a thousand people each generating five shaders at Haiku's measured cost:
**~$22**.

## What $100 buys, and the daily cap

At Haiku's measured $0.0043 per working shader, **$100 funds about 23,000 generations.**

`SHADER_DAILY_LIMIT` (default **20** per user per UTC day) bounds the burn rate on top of the
credit ledger and the 10-a-minute throttle. The arithmetic behind the default:

- one user maxing the cap costs at most 20 × $0.0043 ≈ **8.7 cents a day** — $100 survives
  ~1,150 maxed-out user-days
- **200 users** all maxing it: ~$17/day worst case; realistic active use (a handful of
  generations by a fraction of users) is cents to a few dollars a day
- **2,000 users** all maxing it: ~$173/day worst case — at that scale the cap alone is not the
  protection. The credit ledger is: accounts start with 10 credits, so 2,000 brand-new accounts
  can spend at most 20,000 generations ≈ **$87 total**, whatever the daily cap says

The three layers bound different things: credits bound each user's *total*, the throttle
bounds a *burst*, the daily cap bounds a *day* — and bringing your own key steps around all of
it because the spend is yours. `GET /v1/credits` reports `daily_limit`, `used_today` and
`resets_at`, and the 429 says when the cap resets.

### On free tiers

Gemini's free tier costs nothing and is rate limited. The thing to weigh is not the limit but the
terms: on the free tier Google states that content **is** used to improve their products, and on
paid plans that it is not. For a public instance that is a disclosure question about other
people's prompts, not just a billing one.

A local model through Ollama is the only genuinely free option with no such question attached —
and the only one with no rate limit — at the cost of running the hardware.

## Why Haiku is the default — now with the measurement

Haiku 4.5 is the recommended default, and this time the claim has numbers behind it rather
than design intent: with the shipped prompt it compiled **26 of 26** corpus shaders on the
first draft, in *both* dialects (the browser's GLSL ES 3.00 and xLights' desktop 330), with
zero repair calls — the same rate as Sonnet 5 at a fifth of the price. Subjective quality at
real prop sizes averaged 3.9/5 on a 32×32 matrix and 3.6/5 on a one-pixel roofline
(`tools/shader-check/results/README.md` has the per-shader scores); its weak spots are
too-dark defaults on a handful of moody effects, not broken shaders. The runner-up is
**Sonnet 5 (no thinking)** at ~5× the cost for no measured compile advantage — the switch to
make if quality complaints arrive that Haiku cannot fix, not before.

The cheaper unmeasured rows (Gemini Flash-Lite, DeepSeek) may well clear the bar too — on
paper they are 6–10× cheaper — but "cost per *working* shader" needs their compile rate, and
nobody has measured it. Anyone with a key can:
`node tools/shader-check/generate.mjs --backend openai --base-url ... --key-env ...` produces
the same results file, and the cheapest model that holds a high-90s first-draft rate at
acceptable quality should take the default. Until that run exists, choosing one on price alone
would be guessing, and the cost of guessing wrong about quality is paid by every user who gets
a shader that does not work.

Generating a shader is a small, tightly specified job. The system prompt already supplies the
constraints, the uniform list, and the output format; the model is not being asked to design
anything open-ended. That is the shape of task where the cheap model is closest to the
expensive one — and the measured numbers above bear that out.

The compile-and-repair loop covers the remaining gap. The browser compiles what comes back on
a real GPU, and a failure goes back to the model with the compiler's own error attached. A
repair is only paid for when the first draft actually failed, which is a far better trade than
paying for thinking tokens on every generation to reduce how often it does.

## Pointing it somewhere else

Almost every provider speaks OpenAI's `/chat/completions`, so supporting a dozen of them is one
driver and a base URL rather than a dozen integrations. Set a provider name and a key:

```
SHADER_PROVIDER=deepseek        # anthropic | openai | deepseek | gemini | xai
SHADER_API_KEY=sk-...           # whichever provider you chose
SHADER_MODEL=deepseek-v4-flash  # optional; each provider has a sensible default
```

Also supported: `moonshot` (Kimi), `groq`, `openrouter`, `ollama` for a model on your own machine,
and `custom` with `SHADER_BASE_URL` for anything else that speaks the same format. A local
runtime needs no key — set `SHADER_LOCAL=true` so the key check does not reject it.

Users can bring their own key **and their own provider**: the browser sends both, and a
generation paid for that way costs no credits. A provider named in a request header is honoured
only when a key comes with it — otherwise the operator's own spending could be redirected
somewhere the operator did not choose.

Thinking turns on automatically for models that support it (see `ShaderGenerator`), so switching
to a frontier model changes cost by more than the per-token table alone suggests.

## Who pays

Two modes, and the endpoint picks by whether the request carried a key:

**The server's key.** Costs the operator real money, so it costs the user a credit. This is the
hosted instance. Ten credits come with a new account so the assistant can be tried before anyone
has paid for anything.

**The user's own key.** Billed to them by their own provider, costs the operator nothing, so it
costs no credits. The key travels in the `X-Shader-Key` header — with `X-Shader-Provider` and
`X-Shader-Model` beside it, so they can use whichever account they already have — is used for
that one call, and is never stored. Not in the database, not in a log, not cached on the service.
The browser holds it.

A self-hosted copy sets no `SHADER_API_KEY` at all, so its users must bring their own. That is
the arrangement that lets this be open source without the maintainer funding everybody else's
generations: run it yourself and you pay for yourself.

`GET /v1/credits` reports `server_key_available` and `accepts_user_keys`, so the UI works out
which kind of server it is talking to rather than being configured to know.

## Keeping the hosted bill bounded

- **Credits are the cap.** A user cannot spend more than they have, so the worst case per user is
  known in advance rather than discovered on a bill.
- **Rate limiting sits on top** — 10 generations a minute per user. Credits stop someone spending
  more than they have; the throttle stops a script spending a whole balance in a second.
- **A daily cap sits between them** — `SHADER_DAILY_LIMIT` (default 20, 0 turns it off) bounds
  each user's server-funded generations per UTC day, counted from the credit ledger so the cap
  and the bill cannot disagree. The arithmetic is in "What $100 buys" above.
- **Running out is not a dead end.** Out of credits, a user can add their own key and carry on at
  their own expense, which is the pressure valve that keeps free-tier generosity affordable.
- `SHADER_ALLOW_USER_KEYS=false` turns off the proxy for an operator who would rather not
  forward other people's keys at all.
