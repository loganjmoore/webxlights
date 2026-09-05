<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, ApiError, type CreditStatus, type ShaderRecord, type ShaderTarget } from "../lib/api";
import { checkDraft, defaultInputs, suggestName } from "../lib/shaderDraft";
import { forgetKey, loadKey, loadProvider, looksLikeKey, maskKey, saveKey, saveProvider } from "../lib/anthropicKey";
import { colorInputNames, type IsfShader } from "@webxlights/formats";
import ShaderPreview from "../components/ShaderPreview.vue";
import AppBar from "../components/AppBar.vue";

// The shader library: what everyone has made, and the assistant that makes another.
//
// One page rather than two, because browsing and generating are the same activity a few minutes
// apart - you look for what you want, don't find it, and describe it instead. Splitting them
// would put a navigation step exactly where the intent is strongest.

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const shaders = ref<ShaderRecord[]>([]);
// A card runs while the pointer is over it. Every card running at once would melt a laptop; one
// running is how you tell what a shader does before you put it in a show.
const hoveredId = ref<number | null>(null);
// The browsing vocabulary the built-in library is baked with (tools/shader-check/bake-builtins.mjs)
// plus "Generator", which every ISF header carries.
const CATEGORIES = ["Light show", "Motion background", "Natural", "Geometric", "Seasonal", "Generator"];
const loading = ref(true);
const search = ref("");
// One control rather than two. The library ships with 50 built-ins, so "whose shaders am I
// looking at" is now a real question - and separating them matters because 50 built-ins would
// otherwise bury every new community creation under the recency sort.
const scope = ref<"all" | "builtin" | "community" | "mine" | "favourites">("all");

/**
 * Star or unstar, shown at once and confirmed after. A star is a small thing to wait for a
 * round trip on, and the server's answer is what the card ends up showing either way.
 */
async function toggleFavourite(shader: ShaderRecord): Promise<void> {
  const was = shader.favourited === true;
  shader.favourited = !was;
  try {
    const result = was ? await api.unfavouriteShader(shader.id) : await api.favouriteShader(shader.id);
    shader.favourited = result.favourited;
    if (scope.value === "favourites" && !result.favourited) shaders.value = shaders.value.filter((s) => s.id !== shader.id);
  } catch {
    shader.favourited = was;
  }
}
const category = ref("");
const sort = ref<"recent" | "popular">("recent");
const status = ref<CreditStatus | null>(null);

// ---- the assistant -------------------------------------------------------------------------

const prompt = ref("");
// Which prop the shader is for. The assistant designs for a matrix first either way; saying
// "roofline" changes what excellent means, and it is the difference between a shader that reads
// on the roof and one that collapses to a colour cycling on it.
const target = ref<ShaderTarget>("matrix");
const TARGETS: { value: ShaderTarget; label: string }[] = [
  { value: "matrix", label: "a matrix or panel" },
  { value: "line", label: "a roofline or strip" },
  { value: "tree", label: "a mega tree" },
  { value: "any", label: "any prop" },
];
// Descriptions that generate well, for someone staring at an empty box. Specific and visual,
// which is what the assistant needs: a subject, a motion, and a mood.
const EXAMPLES = [
  "big soft snowflakes drifting down over a deep blue night",
  "a bright comet with a long glowing tail chasing itself around the display",
  "bold checkerboard squares sliding steadily sideways",
  "rings expanding outward from the centre one after another",
  "curtains of aurora rippling slowly, bright at the base",
  "a radar line sweeping around and leaving a fading trail",
];
const busy = ref(false);
const stage = ref<string>("");
const draft = ref<{ source: string; shader: IsfShader } | null>(null);
const draftName = ref("");
const draftPublic = ref(true);
const failure = ref<string | null>(null);
const notice = ref<string | null>(null);

const userKey = ref(loadKey());
const keyInput = ref("");
const showKeyPanel = ref(false);
// Which provider that key belongs to. A Claude key sent to DeepSeek is not a smaller problem
// than no key at all, so the two are chosen and stored together.
const stored = loadProvider();
const keyProvider = ref(stored.provider ?? "anthropic");
const keyModel = ref(stored.model ?? "");

/** The credentials for a request: nothing at all unless the user actually has a key. */
const credentials = computed(() =>
  userKey.value ? { key: userKey.value, provider: keyProvider.value, model: keyModel.value || null } : undefined,
);

// A self-hosted copy has no server key, so its users must bring one. Discovered from the API
// rather than configured into the build, so the same bundle serves both.
const mustBringKey = computed(() => status.value !== null && !status.value.server_key_available);
const canGenerate = computed(() => userKey.value !== null || !mustBringKey.value);
const usingOwnKey = computed(() => userKey.value !== null);

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const page = await api.listShaders(listParams(1));
    shaders.value = page.data;
    lastPage.value = page.last_page;
    total.value = page.total;
  } finally {
    loading.value = false;
  }
}

// The API pages at 24 and the library alone is 50, so the gallery needs a second page.
// Appended rather than paged, because a gallery is browsed, not navigated.
const lastPage = ref(1);
const total = ref(0);
const loadingMore = ref(false);
const currentPage = computed(() => Math.ceil(shaders.value.length / 24));
const remaining = computed(() => Math.max(0, total.value - shaders.value.length));

function listParams(page: number) {
  return {
    q: search.value || undefined,
    mine: scope.value === "mine",
    favourites: scope.value === "favourites",
    kind: scope.value === "builtin" || scope.value === "community" ? scope.value : ("all" as const),
    category: category.value || undefined,
    sort: sort.value,
    page,
  };
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || currentPage.value >= lastPage.value) return;
  loadingMore.value = true;
  try {
    const page = await api.listShaders(listParams(currentPage.value + 1));
    shaders.value = [...shaders.value, ...page.data];
    lastPage.value = page.last_page;
    total.value = page.total;
  } finally {
    loadingMore.value = false;
  }
}

const emptyMessage = computed(() => {
  if (scope.value === "mine") return "You have not made any shaders yet.";
  if (scope.value === "favourites") return "Nothing starred yet. Star a shader and it collects here.";
  if (search.value || category.value) return "Nothing matches that. Try a different search or category.";
  if (scope.value === "community") return "Nobody has published a shader yet — generate the first one.";
  return "No shaders yet — generate the first one.";
});

async function refreshStatus(): Promise<void> {
  try {
    status.value = await api.creditStatus();
  } catch {
    status.value = null; // an older server without the endpoint still lists shaders
  }
}

/**
 * Asks for a shader, then makes sure it actually works before offering to keep it.
 *
 * The repair round is the point. A cheap model's first draft fails to compile often enough to
 * matter, and the compiler's own error is by far the most useful thing to hand back - so one
 * automatic retry with that error attached recovers most of them. Only one: a model that cannot
 * fix its own shader given the exact error is not going to on the third try, and each attempt
 * costs the user again.
 */
async function generate(): Promise<void> {
  const description = prompt.value.trim();
  if (description.length < 3 || busy.value) return;

  busy.value = true;
  failure.value = null;
  notice.value = null;
  draft.value = null;

  try {
    stage.value = "Writing the shader…";
    let result = await api.generateShader({ description, target: target.value }, credentials.value);
    let check = checkDraft(result.source);

    if (!check.ok && check.stage !== "unavailable") {
      stage.value = "It did not compile - sending the error back…";
      result = await api.generateShader(
        { description, target: target.value, previous_source: result.source, compile_error: check.error },
        credentials.value,
      );
      check = checkDraft(result.source);
    }

    if (status.value) status.value.credits = result.credits;

    if (!check.ok) {
      failure.value =
        check.stage === "unavailable"
          ? "This browser cannot compile shaders, so the result could not be checked. Try a browser with WebGL2."
          : `The assistant could not produce a working shader: ${check.error}`;
      return;
    }

    // The full ISF text, header and all - the header is what carries the INPUTS, and the file
    // saved to the library has to be the file xLights could open.
    draft.value = { source: result.source, shader: check.shader };
    draftName.value = suggestName(check.shader, description);
    draftPublic.value = true;
  } catch (err) {
    const apiErr = err as ApiError;
    if (apiErr.status === 402 || apiErr.status === 429) {
      failure.value = mustBringKey.value
        ? "This server has no assistant configured."
        : serverMessage(apiErr) || "You have used this month's free generations. Add your own API key below to keep going - it stays in this browser.";
      showKeyPanel.value = true;
    } else if (apiErr.status === 401 || apiErr.status === 403) {
      failure.value = "That API key was refused. Check it and try again.";
      showKeyPanel.value = true;
    } else {
      failure.value = serverMessage(apiErr) || "The assistant could not be reached.";
    }
    await refreshStatus();
  } finally {
    busy.value = false;
    stage.value = "";
  }
}

/**
 * The human sentence inside an API error.
 *
 * ApiError carries the raw response body; for this endpoint that is JSON whose `message` is
 * written to be shown to a person - the scope refusal says what the assistant is for, the
 * daily-limit message says when it resets. Showing the raw JSON would bury exactly the part
 * that answers "so what do I do now".
 */
function serverMessage(err: ApiError): string {
  try {
    const parsed = JSON.parse(err.message) as { message?: string };
    return typeof parsed.message === "string" ? parsed.message : err.message;
  } catch {
    return err.message;
  }
}

async function publish(): Promise<void> {
  const current = draft.value;
  if (!current || busy.value) return;
  busy.value = true;
  try {
    await api.createShader({
      name: draftName.value.trim() || "Untitled shader",
      description: current.shader.description ?? null,
      source: current.source,
      inputs: current.shader.inputs,
      categories: current.shader.categories,
      is_public: draftPublic.value,
      prompt: prompt.value.trim(),
      ai_generated: true,
    });
    notice.value = draftPublic.value ? "Published to the gallery." : "Saved to your shaders.";
    draft.value = null;
    prompt.value = "";
    scope.value = draftPublic.value ? "all" : "mine";
    await refresh();
  } catch (err) {
    failure.value = (err as ApiError).message || "Could not save that shader.";
  } finally {
    busy.value = false;
  }
}

function storeKey(): void {
  const value = keyInput.value.trim();
  if (value === "") return;
  saveKey(value);
  saveProvider(keyProvider.value, keyModel.value);
  userKey.value = value;
  keyInput.value = "";
  const label = status.value?.providers.find((p) => p.name === keyProvider.value)?.label ?? keyProvider.value;
  notice.value = `Key saved in this browser. Generations go to ${label} and are billed to your own account.`;
}

function dropKey(): void {
  forgetKey();
  userKey.value = null;
  notice.value = "Key removed from this browser.";
}

/**
 * The shader as an ISF `.fs` file, which is the format xLights' Shader effect loads: drop it in
 * the show folder's Shaders directory and pick it in the effect. The source already carries
 * the ISF header and is checked against xLights' dialect, so the file is the source as is.
 */
function downloadFs(name: string, source: string): void {
  const blob = new Blob([source], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.trim().replace(/[^a-z0-9._ -]/gi, "_") || "shader"}.fs`;
  a.click();
  URL.revokeObjectURL(url);
}

async function remove(shader: ShaderRecord): Promise<void> {
  if (!window.confirm(`Delete "${shader.name}"? Sequences already using it keep their copy.`)) return;
  await api.deleteShader(shader.id);
  await refresh();
}

async function togglePublic(shader: ShaderRecord): Promise<void> {
  const updated = await api.updateShader(shader.id, { is_public: !shader.is_public });
  Object.assign(shader, updated);
}

onMounted(async () => {
  await Promise.all([refresh(), refreshStatus()]);
});
</script>

<template>
  <div class="page">
    <AppBar :project-id="projectId" active="shaders" />
    <header class="page-toolbar">
      <h1>Shaders</h1>
      <span class="sub">GLSL effects that run on your props. Describe one and the assistant writes it, or use something someone else made.</span>
    </header>

    <!-- The assistant -->
    <section class="assistant">
      <div class="ask">
        <textarea
          v-model="prompt"
          rows="2"
          placeholder="Describe an animation — &quot;slow blue and white snowfall drifting down&quot;"
          :disabled="busy"
          @keydown.ctrl.enter="generate"
          @keydown.meta.enter="generate"
        />
        <button class="primary" :disabled="busy || prompt.trim().length < 3 || !canGenerate" @click="generate">
          {{ busy ? "Working…" : "Generate" }}
        </button>
      </div>
      <div class="ask-meta">
        <label class="target">
          Designed for
          <select v-model="target" :disabled="busy">
            <option v-for="t in TARGETS" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </label>
        <div v-if="!draft && !busy" class="examples" aria-label="Example descriptions">
          <span class="examples-label">Try:</span>
          <button v-for="example in EXAMPLES" :key="example" type="button" class="chip" @click="prompt = example">
            {{ example }}
          </button>
        </div>
      </div>

      <p v-if="busy" class="stage">{{ stage }}</p>

      <p v-if="status" class="meter">
        <template v-if="usingOwnKey">
          Using your own key at
          <strong>{{ status.providers.find((p) => p.name === keyProvider)?.label ?? keyProvider }}</strong>
          — billed to your own account, no credits used.
        </template>
        <template v-else-if="mustBringKey">
          This server has no assistant key configured. Add your own to generate shaders.
        </template>
        <template v-else-if="status.monthly_limit">
          <strong>{{ Math.max(0, status.monthly_limit - (status.used_this_month ?? 0)) }}</strong> of {{ status.monthly_limit }} free shaders left this month,
          written by {{ status.model }}.
        </template>
        <template v-else>Free to generate, written by {{ status.model }}.</template>
        <button class="link" @click="showKeyPanel = !showKeyPanel">
          {{ userKey ? "Change key" : "Use your own key" }}
        </button>
      </p>

      <div v-if="showKeyPanel" class="keys">
        <p class="note">
          Your key stays in this browser. It is sent with the generation request and never stored
          on the server — so it will not follow you to another device. Pick whichever provider you
          already have an account with; generations are billed to you and use no credits.
        </p>
        <div v-if="userKey" class="current">
          <code>{{ maskKey(userKey) }}</code>
          <button class="link" @click="dropKey">Remove</button>
        </div>
        <div class="row">
          <select v-model="keyProvider">
            <option v-for="p in status?.providers ?? []" :key="p.name" :value="p.name">{{ p.label }}</option>
          </select>
          <input v-model="keyInput" type="password" placeholder="API key" autocomplete="off" spellcheck="false" />
          <button :disabled="keyInput.trim() === ''" @click="storeKey">Save</button>
        </div>
        <div class="row">
          <input v-model="keyModel" placeholder="Model (optional — the provider's default is used)" spellcheck="false" />
        </div>
        <p v-if="keyProvider === 'anthropic' && keyInput.trim() !== '' && !looksLikeKey(keyInput)" class="warn">
          That does not look like an Anthropic key, but it will be sent as typed.
        </p>
      </div>

      <p v-if="failure" class="failure">{{ failure }}</p>
      <p v-if="notice" class="notice">{{ notice }}</p>

      <!-- A draft: compiled, running, not yet saved -->
      <div v-if="draft" class="draft">
        <ShaderPreview :source="draft.source" :inputs="defaultInputs(draft.shader)" :color-inputs="colorInputNames(draft.shader.inputs)" />
        <div class="draft-form">
          <label>Name <input v-model="draftName" maxlength="120" /></label>
          <p v-if="draft.shader.description" class="desc">{{ draft.shader.description }}</p>
          <p v-if="draft.shader.inputs.length" class="inputs">
            Controls: {{ draft.shader.inputs.map((i) => i.label ?? i.name).join(", ") }}
          </p>
          <label class="check">
            <input v-model="draftPublic" type="checkbox" />
            Share in the gallery
          </label>
          <div class="actions">
            <button class="primary" :disabled="busy" @click="publish">Save</button>
            <button :disabled="busy" @click="draft = null">Discard</button>
            <button :disabled="busy" @click="generate">Try again</button>
            <button :disabled="busy" title="Save as an ISF .fs file for the Shader effect in desktop xLights" @click="downloadFs(draftName, draft.source)">Download for xLights</button>
          </div>
        </div>
      </div>
    </section>

    <!-- The gallery -->
    <section class="gallery">
      <div class="filters">
        <input v-model="search" placeholder="Search shaders…" @keydown.enter="refresh" />
        <select v-model="scope" @change="refresh">
          <option value="all">All shaders</option>
          <option value="builtin">Built-in</option>
          <option value="community">Made by people</option>
          <option value="favourites">My favourites</option>
          <option value="mine">Mine</option>
        </select>
        <select v-model="category" @change="refresh">
          <option value="">Any category</option>
          <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="sort" @change="refresh">
          <option value="recent">Newest</option>
          <option value="popular">Most used</option>
        </select>
        <button @click="refresh">Search</button>
      </div>

      <p v-if="loading" class="empty">Loading…</p>
      <p v-else-if="shaders.length === 0" class="empty">
        {{ emptyMessage }}
      </p>

      <ul v-else class="grid">
        <li
          v-for="shader in shaders"
          :key="shader.id"
          class="card"
          @pointerenter="hoveredId = shader.id"
          @pointerleave="hoveredId = null"
        >
          <!-- Paused: thirty shaders running at once would melt a laptop. They start on hover. -->
          <ShaderPreview
            :source="shader.source"
            :running="hoveredId === shader.id"
            :color-inputs="colorInputNames(shader.inputs ?? [])"
            :width="96"
            :height="64"
            class="thumb"
          />
          <button
            type="button"
            class="star"
            :class="{ on: shader.favourited }"
            :title="shader.favourited ? 'In your favourites. Click to remove.' : 'Add to your favourites'"
            :aria-pressed="shader.favourited === true"
            aria-label="Favourite"
            @click.stop="toggleFavourite(shader)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7z" /></svg>
          </button>
          <div class="meta">
            <h3>
              {{ shader.name }}
              <!-- Built-ins ship with the app and have no author, so they are marked rather than
                   attributed to "someone". -->
              <span v-if="shader.builtin_key" class="badge">Built-in</span>
            </h3>
            <p v-if="shader.description" class="desc">{{ shader.description }}</p>
            <p class="by">
              {{ shader.builtin_key ? "Ships with webXLights" : (shader.author?.name ?? "someone") }}
              <span v-if="shader.use_count > 0">· used {{ shader.use_count }}×</span>
              <span v-if="!shader.is_public" class="private">· private</span>
            </p>
            <div class="owner-actions">
              <button class="link" title="Save as an ISF .fs file. Put it in your show folder's Shaders directory and pick it in xLights' Shader effect." @click="downloadFs(shader.name, shader.source)">Download for xLights</button>
              <template v-if="shader.user_id && status">
                <button class="link" @click="togglePublic(shader)">
                  {{ shader.is_public ? "Make private" : "Share" }}
                </button>
                <button class="link danger" @click="remove(shader)">Delete</button>
              </template>
            </div>
          </div>
        </li>
      </ul>
      <button v-if="!loading && remaining > 0" type="button" class="more" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? "Loading…" : `Show ${Math.min(remaining, 24)} more of ${total}` }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.page {
  padding: 0 0 3rem;
  color: var(--text);
  text-align: left;
}
/* The app bar spans the window; everything under it sits in a reading column. */
.page > :not(:first-child):not(.page-toolbar) {
  max-width: 1100px;
  margin-left: auto;
  margin-right: auto;
  padding-left: 1.2rem;
  padding-right: 1.2rem;
}
.page > .assistant {
  margin-top: 1.25rem;
}
.sub {
  color: var(--text-muted);
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.assistant {
  background: #1a1a21;
  border: 1px solid #2a2a33;
  border-radius: 6px;
  padding: 0.9rem;
  margin-bottom: 1.5rem;
}
.ask {
  display: flex;
  gap: 0.5rem;
}
.ask-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.target {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}
.target select {
  font: inherit;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
}
.examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
}
.examples-label {
  color: var(--text-dim);
}
.chip {
  font: inherit;
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.chip:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.card {
  position: relative;
}
/* The star sits on the thumbnail's corner: off until you mean it, gold when you do. */
.star {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.star svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.star:hover {
  color: var(--accent);
}
.star.on {
  color: var(--accent);
}
.star.on svg {
  fill: currentColor;
}
.more {
  display: block;
  margin: 1rem auto 0;
  padding: 0.4rem 1rem;
  font: inherit;
  font-size: 0.8rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text);
  cursor: pointer;
}
.more:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
textarea {
  flex: 1;
  background: #111117;
  border: 1px solid #33333f;
  border-radius: 4px;
  color: #e8e8ef;
  padding: 0.5rem;
  font: inherit;
  resize: vertical;
}
button {
  background: #2a2a33;
  border: 1px solid #3a3a46;
  border-radius: 4px;
  color: #e8e8ef;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  font-size: 0.85rem;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button.primary {
  background: #e8c468;
  border-color: #e8c468;
  color: #111;
  font-weight: 600;
}
button.link {
  background: none;
  border: none;
  color: #8ab4f8;
  padding: 0 0.3rem;
  text-decoration: underline;
}
button.link.danger {
  color: #f88;
}
.stage,
.meter,
.note,
.by,
.inputs {
  color: #9a9aa6;
  font-size: 0.8rem;
}
.meter {
  margin: 0.6rem 0 0;
}
.keys {
  margin-top: 0.6rem;
  padding: 0.6rem;
  background: #111117;
  border-radius: 4px;
}
.keys .row {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.4rem;
}
.keys input {
  flex: 1;
  background: #1a1a21;
  border: 1px solid #33333f;
  border-radius: 4px;
  color: #e8e8ef;
  padding: 0.35rem 0.5rem;
  font: inherit;
}
.current {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.4rem;
}
.current code {
  background: #1a1a21;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-size: 0.8rem;
}
.failure {
  color: #ffb3b3;
  font-size: 0.85rem;
  margin: 0.6rem 0 0;
}
.notice {
  color: #a5e2b8;
  font-size: 0.85rem;
  margin: 0.6rem 0 0;
}
.warn {
  color: #e8c468;
  font-size: 0.75rem;
  margin: 0.3rem 0 0;
}
.draft {
  display: grid;
  grid-template-columns: minmax(180px, 260px) 1fr;
  gap: 1rem;
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid #2a2a33;
}
.draft-form label {
  display: block;
  font-size: 0.8rem;
  color: #9a9aa6;
  margin-bottom: 0.5rem;
}
.draft-form input[type="text"],
.draft-form label input:not([type="checkbox"]) {
  display: block;
  width: 100%;
  margin-top: 0.2rem;
  background: #111117;
  border: 1px solid #33333f;
  border-radius: 4px;
  color: #e8e8ef;
  padding: 0.35rem 0.5rem;
  font: inherit;
}
.check {
  display: flex !important;
  align-items: center;
  gap: 0.4rem;
}
.actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
  flex-wrap: wrap;
}
.filters input {
  flex: 1;
  min-width: 180px;
  background: #111117;
  border: 1px solid #33333f;
  border-radius: 4px;
  color: #e8e8ef;
  padding: 0.35rem 0.5rem;
  font: inherit;
}
.filters select {
  background: #1a1a21;
  border: 1px solid #33333f;
  border-radius: 4px;
  color: #e8e8ef;
  padding: 0.35rem;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.9rem;
}
.card {
  background: #1a1a21;
  border: 1px solid #2a2a33;
  border-radius: 6px;
  overflow: hidden;
}
.card h3 {
  margin: 0;
  font-size: 0.9rem;
}
.meta {
  padding: 0.5rem 0.6rem 0.6rem;
}
.desc {
  margin: 0.2rem 0;
  font-size: 0.78rem;
  color: #b8b8c4;
}
.by {
  margin: 0.3rem 0 0;
}
.private {
  color: #e8c468;
}
/* Quiet on purpose: it marks provenance, it is not a call to action. */
.badge {
  margin-left: 0.4rem;
  padding: 0.05rem 0.35rem;
  border: 1px solid #3a3a45;
  border-radius: 999px;
  color: #9a9aa6;
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  vertical-align: middle;
  white-space: nowrap;
}
.owner-actions {
  margin-top: 0.3rem;
}
.empty {
  color: #9a9aa6;
  font-size: 0.9rem;
}
@media (max-width: 640px) {
  .draft {
    grid-template-columns: 1fr;
  }
}
</style>
