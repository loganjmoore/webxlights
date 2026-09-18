# Interface design

Preserve the existing pixl interface: dark surfaces, system typography and one warm yellow
accent. Shared tokens live in `apps/web/src/style.css`; product conventions live in `CLAUDE.md`.

## Navigation

Project pages share a 44px icon rail on the left edge (`AppBar.vue`), not a bar across the top:
an editor runs out of height long before width. The rail holds the pixl mark, one icon per
workspace (Layout, Sequencer, Network, Shaders, Files, Library), then Docs and Log out at the
bottom. The current workspace is the accent tile. Every icon has an `aria-label` and a text label
that appears on hover and on keyboard focus. The project's name sits in the page toolbar, in front
of the page's name. The page toolbar is the topmost row of every page.

## Sequencer

Height belongs to the grid. Above it sit only the page toolbar and a single 40px effect strip:
icon tiles on one row with a filter, names as tooltips (and beside the icon once filtered), and
the armed-effect hint beside the tiles so arming never moves the grid. The house preview and
Effect settings share one column on the right; the waveform and grid fill everything else.

## Sign-in and recovery

Keep email login, registration and Google sign-in in the existing centered form. Recovery
instructions belong beside the affected sign-in method, without a modal or a separate design.
Explain the next action in plain language, keep links selectable when clipboard access fails,
and announce copy results. On mobile, the entire form must fit the viewport width and remain
reachable by scrolling. Preserve visible keyboard focus and readable text contrast.
