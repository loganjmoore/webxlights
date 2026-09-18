<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useProjectsStore } from "../stores/projects";

// The one rail every project page shares: where you are, where else you can go, who you are.
//
// It replaced a tab strip whose position changed from page to page (left on the sequencer, right
// on the shaders page, beside a separate "← Projects" link on the layout page) and a log-out
// button that only existed on the project list. Navigation that moves around is navigation you
// have to look for; this stays put, and page actions live in the page below it.

const props = defineProps<{
  projectId?: number | string;
  active?: "layout" | "sequences" | "controllers" | "shaders" | "library" | "files";
}>();

const auth = useAuthStore();
const router = useRouter();
const projects = useProjectsStore();

// Which project you are in, said in words. The four tabs say where in the project you are; the
// name says which one, and it is the way back to its sequences and to the list of all of them.
const project = computed(() => (props.projectId === undefined ? null : projects.projects.find((p) => p.id === Number(props.projectId)) ?? null));
onMounted(() => {
  if (props.projectId !== undefined && projects.projects.length === 0) void projects.fetchAll();
});

async function logout(): Promise<void> {
  await auth.logout();
  router.push("/auth");
}
</script>

<template>
  <header class="app-bar">
    <router-link to="/projects" class="wordmark" aria-label="All projects" data-label="All projects">pixl</router-link>
    <nav v-if="projectId !== undefined" class="tabs" aria-label="Workspaces">
      <router-link :to="`/projects/${projectId}/layout`" :class="{ active: active === 'layout' }" aria-label="Layout" data-label="Layout">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5" /></svg>
      </router-link>
      <router-link :to="`/projects/${projectId}/sequences`" :class="{ active: active === 'sequences' }" aria-label="Sequencer" data-label="Sequencer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M9 12h11M6 17h8" stroke-width="2.4" /></svg>
      </router-link>
      <router-link :to="`/projects/${projectId}/controllers`" :class="{ active: active === 'controllers' }" aria-label="Network" data-label="Network">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v8H5zM8 12v4M12 12v8M16 12v4M8.5 8h.01M12 8h.01" /></svg>
      </router-link>
      <router-link :to="`/projects/${projectId}/shaders`" :class="{ active: active === 'shaders' }" aria-label="Shaders" data-label="Shaders">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" /></svg>
      </router-link>
      <router-link :to="`/projects/${projectId}/files`" :class="{ active: active === 'files' }" aria-label="Files" data-label="Files">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></svg>
      </router-link>
      <router-link :to="`/projects/${projectId}/library`" :class="{ active: active === 'library' }" aria-label="Library" data-label="Library">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h3v16H4zM9 4h3v16H9zM14.5 6.2l2.9-.8 3.6 13.6-2.9.8z" /></svg>
      </router-link>
    </nav>
    <div class="foot">
      <router-link to="/docs" aria-label="Docs" data-label="Docs">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></svg>
      </router-link>
      <button v-if="auth.user" type="button" :aria-label="`Log out ${auth.user.name}`" :data-label="`Log out · ${auth.user.name}`" @click="logout">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9" /></svg>
      </button>
    </div>
    <!-- Which project you are in lives in the page toolbar now, in front of the page's name. The
         rail has no room for words; `defer` because the toolbar is a later sibling. -->
    <Teleport v-if="projectId !== undefined" defer to=".page-toolbar">
      <router-link :to="`/projects/${projectId}/sequences`" class="project-crumb" title="This project">
        {{ project?.name ?? "…" }}<span aria-hidden="true">/</span>
      </router-link>
    </Teleport>
  </header>
</template>

<style scoped>
/* A rail down the left edge, not a bar across the top: an editor is short of height long before
   it is short of width, and the bar cost every page 40px of rows. Fixed, so no page has to know
   about it; style.css pads #app by --rail-w whenever one is mounted. */
.app-bar {
  position: fixed;
  z-index: 40;
  inset: 0 auto 0 0;
  width: var(--rail-w);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0;
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
  font-family: var(--sans);
  font-size: 0.7rem;
}
.tabs,
.foot {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.tabs {
  padding-top: 0.4rem;
  border-top: 1px solid var(--border);
}
.foot {
  margin-top: auto;
}
.app-bar a,
.app-bar button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: none;
  color: var(--text-muted);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: background 150ms ease-out, color 150ms ease-out;
}
.app-bar a:hover,
.app-bar button:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.app-bar a.active {
  color: var(--accent-ink);
  background: var(--accent);
}
.app-bar .wordmark {
  color: var(--text);
  font-weight: 600;
  letter-spacing: -0.01em;
}
.app-bar svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* An icon with no name is a guess. The name shows on hover and on keyboard focus, at once, which
   `title` does for neither. */
.app-bar [data-label]::after {
  content: attr(data-label);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-control);
  box-shadow: var(--shadow-lift);
  color: var(--text);
  font-size: 0.7rem;
  font-weight: 400;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
}
.app-bar [data-label]:hover::after,
.app-bar [data-label]:focus-visible::after {
  opacity: 1;
}
</style>
