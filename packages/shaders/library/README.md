# The built-in shader library

The authored `.fs` files that ship with every install. They live here, with the tooling and the
tests, rather than under `apps/api` - but `packages/` is **not** in the runtime Docker image, so
nothing at runtime can read them from disk.

They reach production by being baked into a committed JSON that *is* in the image:

```bash
node tools/shader-check/bake-builtins.mjs          # rebuild apps/api/database/data/builtin-shaders.json
node tools/shader-check/bake-builtins.mjs --check   # fail if the two have drifted (what CI runs)
```

`php artisan shaders:publish-builtins` then upserts that JSON into the `shaders` table on every
boot, keyed on a stable `builtin_key`. See `DECISIONS.md` for why this is a boot-time command
rather than a seeder (never runs in production) or a one-shot migration (would need a new
migration for every library update).

Each file is measured before it lands here:

```bash
node tools/shader-check/check.mjs   packages/shaders/library/*.fs   # compiles in both dialects
node tools/shader-check/metrics.mjs packages/shaders/library/*.fs   # clears every gate
node tools/shader-check/render.mjs  packages/shaders/library/*.fs --out /tmp/sheets
```
