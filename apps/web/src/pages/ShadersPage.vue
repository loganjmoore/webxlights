<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api, ApiError, type CreditStatus, type ShaderRecord } from "../lib/api";
import { checkDraft, defaultInputs, suggestName } from "../lib/shaderDraft";
import { forgetKey, loadKey, loadProvider, looksLikeKey, maskKey, saveKey, saveProvider } from "../lib/anthropicKey";
import { colorInputNames, type IsfShader } from "@webxlights/formats";
import ShaderPreview from "../components/ShaderPreview.vue";
import TabNav from "../components/TabNav.vue";

// The shader library: what everyone has made, and the assistant that makes another.
//
// One page rather than two, because browsing and generating are the same activity a few minutes
// apart - you look for what you want, don't find it, and describe it instead. Splitting them
// would put a navigation step exactly where the intent is strongest.

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const shaders = ref<ShaderRecord[]>([]);
const loading = ref(true);
const search = ref("");
const scope = ref<"all" | "mine">("all");
const sort = ref<"recent" | "popular">("recent");
const status = ref<CreditStatus | null>(null);

// ---- the assistant -------------------------------------------------------------------------

const prompt = ref("");
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
    const page = await api.listShaders({
      q: search.value || undefined,
      mine: scope.value === "mine",
      sort: sort.value,
    });
    shaders.value = page.data;
  } finally {
    loading.value = false;
  }
}

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
    let result = await api.generateShader({ description }, credentials.value);
    let check = checkDraft(result.source);

    if (!check.ok && check.stage !== "unavailable") {
      stage.value = "It did not compile - sending the error back…";
      result = await api.generateShader(
        { description, previous_source: result.source, compile_error: check.error },
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
    if (apiErr.status === 402) {
      failure.value = mustBringKey.value
        ? "This server has no assistant configured."
        : "You are out of credits. Add your own Anthropic API key below to keep generating - it stays in this browser.";
      showKeyPanel.value = true;
    } else if (apiErr.status === 401 || apiErr.status === 403) {
      failure.value = "That API key was refused. Check it and try again.";
      showKeyPanel.value = true;
    } else {
      failure.value = apiErr.message || "The assistant could not be reached.";
    }
    await refreshStatus();
  } finally {
    busy.value = false;
    stage.value = "";
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
    <header class="head">
      <div>
        <h1>Shaders</h1>
        <p class="sub">
          GLSL effects that run on your props. Describe one and the assistant writes it, or use
          something someone else made.
        </p>
      </div>
      <TabNav :project-id="projectId" active="shaders" />
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
        <template v-else>
          <strong>{{ status.credits }}</strong> credit{{ status.credits === 1 ? "" : "s" }} left
          ({{ status.cost_per_generation }} per shader, written by {{ status.model }}).
        </template>
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
          </div>
        </div>
      </div>
    </section>

    <!-- The gallery -->
    <section class="gallery">
      <div class="filters">
        <input v-model="search" placeholder="Search shaders…" @keydown.enter="refresh" />
        <select v-model="scope" @change="refresh">
          <option value="all">Everyone's</option>
          <option value="mine">Mine</option>
        </select>
        <select v-model="sort" @change="refresh">
          <option value="recent">Newest</option>
          <option value="popular">Most used</option>
        </select>
        <button @click="refresh">Search</button>
      </div>

      <p v-if="loading" class="empty">Loading…</p>
      <p v-else-if="shaders.length === 0" class="empty">
        {{ scope === "mine" ? "You have not made any shaders yet." : "No shaders yet — generate the first one." }}
      </p>

      <ul v-else class="grid">
        <li v-for="shader in shaders" :key="shader.id" class="card">
          <!-- Paused: thirty shaders running at once would melt a laptop. They start on hover. -->
          <ShaderPreview :source="shader.source" :running="false" :color-inputs="colorInputNames(shader.inputs ?? [])" class="thumb" />
          <div class="meta">
            <h3>{{ shader.name }}</h3>
            <p v-if="shader.description" class="desc">{{ shader.description }}</p>
            <p class="by">
              {{ shader.author?.name ?? "someone" }}
              <span v-if="shader.use_count > 0">· used {{ shader.use_count }}×</span>
              <span v-if="!shader.is_public" class="private">· private</span>
            </p>
            <div v-if="shader.user_id && status" class="owner-actions">
              <button class="link" @click="togglePublic(shader)">
                {{ shader.is_public ? "Make private" : "Share" }}
              </button>
              <button class="link danger" @click="remove(shader)">Delete</button>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.page {
  padding: 1rem 1.2rem 3rem;
  color: #e8e8ef;
  max-width: 1100px;
  margin: 0 auto;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}
h1 {
  margin: 0;
  font-size: 1.3rem;
}
.sub {
  margin: 0.25rem 0 0;
  color: #9a9aa6;
  font-size: 0.85rem;
  max-width: 52ch;
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
