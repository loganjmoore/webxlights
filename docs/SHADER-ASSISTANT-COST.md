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

Prices per million tokens, as published:

| Model | Input | Output |
| --- | --- | --- |
| Claude Opus 5 | $5.00 | $25.00 |
| Claude Sonnet 5 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |

Which works out, per generated shader:

| Setup | Cost each | Shaders per $1 | Per $20/month |
| --- | --- | --- | --- |
| Opus 5, thinking on | ~$0.053 | ~19 | ~380 |
| Sonnet 5, thinking on | ~$0.032 | ~31 | ~630 |
| Opus 5, no thinking | ~$0.015 | ~66 | ~1,300 |
| Sonnet 5, no thinking | ~$0.009 | ~110 | ~2,200 |
| **Haiku 4.5, no thinking (the default)** | **~$0.0038** | **~260** | **~5,200** |

Add roughly 30% for repair rounds — a first draft that fails to compile costs another call to
fix. Even at a pessimistic one repair in every two generations, Haiku lands near **$0.006 a
shader, or about 170 per dollar.**

For a sense of scale: a thousand people each generating five shaders is about **$19 on Haiku**,
and about **$265 on Opus with thinking**. That difference is why the default is what it is.

## Why Haiku is the default

Generating a shader is a small, tightly specified job. The system prompt already supplies the
constraints, the uniform list, and the output format; the model is not being asked to design
anything open-ended. That is the shape of task where the cheap model is closest to the expensive
one.

The compile-and-repair loop covers most of the remaining gap. The browser compiles what comes
back on a real GPU, and a failure goes back to the model with the compiler's own error attached.
A repair is only paid for when the first draft actually failed, which is a far better trade than
paying for thinking tokens on every generation to reduce how often it does.

Change it with `SHADER_MODEL` if the quality is not there:

```
SHADER_MODEL=claude-sonnet-5
```

Thinking turns on automatically for models that support it (see `ShaderGenerator`), so switching
to a frontier model changes cost by more than the per-token table alone suggests.

## Who pays

Two modes, and the endpoint picks by whether the request carried a key:

**The server's key.** Costs the operator real money, so it costs the user a credit. This is the
hosted instance. Ten credits come with a new account so the assistant can be tried before anyone
has paid for anything.

**The user's own key.** Billed to them by Anthropic, costs the operator nothing, so it costs no
credits. The key travels in the `X-Anthropic-Key` header, is used for that one call, and is never
stored — not in the database, not in a log, not cached on the service. The browser holds it.

A self-hosted copy sets no `ANTHROPIC_API_KEY` at all, so its users must bring their own. That is
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
