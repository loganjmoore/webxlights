# What the shader assistant costs to run

Numbers for anyone deciding whether to point a public instance at their own API key.

## How a generation is billed

One generation is one API call. Three things are charged:

| Part | What it is | Size |
| --- | --- | --- |
| Input | the system prompt (2,577 characters) plus the user's description | **~750 tokens** |
| Output — shader | the ISF file that comes back | **~450 tokens** (a 49-line shader is 1,334 characters) |
| Output — thinking | the model's reasoning, when thinking is on | **0, or 1,000–2,500** |

Token counts are estimated from character counts at roughly 3.5 characters per token, prose and
GLSL averaged. They have not been measured against the token-counting endpoint, so treat them as
±20%. The *ratios* between models below are exact, because they come from published per-token
prices — only the absolute figures carry that error bar.

**Thinking tokens are billed at the output rate, the same as the shader itself.** That single
fact decides the whole cost picture: with thinking on, the reasoning costs three to five times
more than the shader it produced.

## Cost per shader

Published prices per million tokens, **checked 2026-08-21**. They change often — re-check before
relying on them, and treat this table as dated rather than current.

| Provider / model | Input | Output | Per shader | Per $1 |
| --- | --- | --- | --- | --- |
| Gemini free tier | $0 | $0 | **free** | — |
| Ollama / local | $0 | $0 | **free** | — |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | ~$0.0003 | ~3,200 |
| DeepSeek v4-flash (off-peak) | $0.22 | $0.66 | ~$0.0006 | ~1,800 |
| DeepSeek v4-flash (peak) | $0.44 | $1.32 | ~$0.0011 | ~900 |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 | ~$0.0017 | ~590 |
| Grok build-0.1 | $1.00 | $2.00 | ~$0.0020 | ~510 |
| **Claude Haiku 4.5 (default)** | $1.00 | $5.00 | **~$0.0038** | **~260** |
| Grok 4.3 | $1.25 | $2.50 | ~$0.0024 | ~420 |
| Claude Sonnet 5, no thinking | $3.00 | $15.00 | ~$0.009 | ~110 |
| Claude Sonnet 5, thinking on | $3.00 | $15.00 | ~$0.032 | ~31 |
| Claude Opus 5, thinking on | $5.00 | $25.00 | ~$0.053 | ~19 |

Kimi (Moonshot) is supported but its per-token rates are not listed here — they were not
retrievable at the time of writing, and a guessed number is worse than an absent one.

Add roughly 30% for repair rounds. Even at a pessimistic one repair in every two generations,
Haiku lands near **$0.006 a shader, about 170 per dollar.**

For a sense of scale — a thousand people each generating five shaders:

| | |
| --- | --- |
| Gemini 2.5 Flash-Lite | **~$1.60** |
| DeepSeek v4-flash | ~$5.60 |
| Claude Haiku 4.5 | ~$19 |
| Claude Opus 5, thinking on | ~$265 |

### On free tiers

Gemini's free tier costs nothing and is rate limited. The thing to weigh is not the limit but the
terms: on the free tier Google states that content **is** used to improve their products, and on
paid plans that it is not. For a public instance that is a disclosure question about other
people's prompts, not just a billing one.

A local model through Ollama is the only genuinely free option with no such question attached —
and the only one with no rate limit — at the cost of running the hardware.

## Why Haiku is the default

The cheapest option is not automatically the right default. Haiku sits where it does because it
is the cheapest model this project has actually been designed around — the prompt was written and
tuned against it — and because the difference between it and the cheapest alternative is about
$17 per five thousand shaders. That is a real saving and a small amount of money, and the cost of
guessing wrong about quality is paid by every user who gets a shader that does not work.

Switch it once you have evidence. `SHADER_PROVIDER=gemini` with a key is a two-line change, and
the compile-and-repair rate is the number to watch: if first drafts fail much more often on a
cheaper model, the extra repair calls eat the saving and the wait gets longer.

Generating a shader is a small, tightly specified job. The system prompt already supplies the
constraints, the uniform list, and the output format; the model is not being asked to design
anything open-ended. That is the shape of task where the cheap model is closest to the expensive
one.

The compile-and-repair loop covers most of the remaining gap. The browser compiles what comes
back on a real GPU, and a failure goes back to the model with the compiler's own error attached.
A repair is only paid for when the first draft actually failed, which is a far better trade than
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
- **Running out is not a dead end.** Out of credits, a user can add their own key and carry on at
  their own expense, which is the pressure valve that keeps free-tier generosity affordable.
- `SHADER_ALLOW_USER_KEYS=false` turns off the proxy for an operator who would rather not
  forward other people's keys at all.
