# Interface design

Preserve the existing pixl interface: dark surfaces, system typography and one warm yellow
accent. Shared tokens live in `apps/web/src/style.css`; product conventions live in `CLAUDE.md`.

## Sign-in and recovery

Keep email login, registration and Google sign-in in the existing centered form. Recovery
instructions belong beside the affected sign-in method, without a modal or a separate design.
Explain the next action in plain language, keep links selectable when clipboard access fails,
and announce copy results. On mobile, the entire form must fit the viewport width and remain
reachable by scrolling. Preserve visible keyboard focus and readable text contrast.
