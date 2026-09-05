# webXLights design contract

A browser-native xLights. People use it at a desk in a dim room in November, for hours, with a
yard full of pixels to fill. The interface is a tool: it should read like a desktop editor a
category-fluent xLights user can trust on sight, and then get out of the way.

Mode: **Operate**, everywhere. Brand lives in details, never in decoration.

## Palette

Dark chrome, one warm accent. Tokens live in `apps/web/src/style.css` and every page uses them.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0d0d11` | the canvas behind everything |
| `--bg-panel` | `#16161c` | headers, toolbars, dialogs, sidebars |
| `--bg-control` | `#1e1e26` | buttons, inputs, selects |
| `--bg-hover` | `#26262f` | hovered control or menu row |
| `--border` | `#2c2c34` | dividers inside a panel |
| `--border-strong` | `#3a3a44` | control edges, panel edges |
| `--text` | `#e8e8ef` | primary text |
| `--text-muted` | `#9a9aa6` | secondary text, inactive tabs |
| `--text-dim` | `#5f5f6a` | disabled, tertiary |
| `--accent` | `#e8c468` | the one accent: active tab, primary button, armed tool, focus ring |
| `--accent-ink` | `#111` | text on an accent surface |
| `--info` | `#6a9fd8` | ranges, live status, links inside prose |
| `--ok` | `#8fe0a0` | a drop that will land, connected |
| `--danger` | `#e5534b` | a drop that is blocked, destructive actions, errors |

Accent means "current" or "primary". It is never a background wash and never decoration.

## Type

System sans (`system-ui`), one family. Fixed rem scale, tight ratio:

- `0.7rem` meta and status, `0.8rem` controls and labels, `0.9rem` body, `1rem` page title.
- Weight 500 for headings and active items, 400 elsewhere. No display faces, no uppercase eyebrows
  except table headers.
- Tabular numerals wherever a number changes while you watch it (time, channels).

## Spacing and shape

- 4px base: 0.25 / 0.5 / 0.75 / 1 / 1.5rem. Groups are tight (0.25 to 0.5rem apart), sections are
  generous (1rem+).
- Controls: 4px radius, 1px `--border-strong` edge, 28px tall in toolbars, 32px in forms.
- Panels and dialogs: 6px radius, 1px edge, shadow `0 12px 40px rgba(0,0,0,.55)` (offset + blur,
  never a halo).
- Icons: inline SVG on a 24 box, `currentColor`, 1.4 to 1.8 stroke. One family (lib/effectIcons.ts).

## Navigation

One app bar on every project page: wordmark (home), the four workspaces as tabs (Layout,
Sequencer, Network, Shaders), then Docs and the account on the right. Page actions live in the
page, not in the app bar. Anything with more than six actions collapses into a labelled menu
(`MenuButton`), grouped the way a desktop menu bar would group them.

## Panels

A settings pane opens as a dialog over the page. Drag it by its title bar and it floats where you
put it; pin it and it stays open while you work on the grid underneath. Its position is
remembered per panel. Panels with a window route can be torn off into their own browser window.

## Motion

150 to 200ms, ease-out, state changes only: a menu opening, a panel settling, a drag proxy
lifting. No entrances, no page choreography.

## Drag and drop

Dragging feels like a desktop app, not a browser: the thing you grabbed lifts under the pointer
with a shadow, the target draws a snapped outline exactly where it will land (green when it fits,
red when something is in the way), Escape cancels, and release commits in one undo step.
