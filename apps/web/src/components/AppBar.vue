<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useProjectsStore } from "../stores/projects";

// The one bar every project page shares: where you are, where else you can go, who you are.
//
// It replaced a tab strip whose position changed from page to page (left on the sequencer, right
// on the shaders page, beside a separate "← Projects" link on the layout page) and a log-out
// button that only existed on the project list. Navigation that moves around is navigation you
// have to look for; this stays put, and page actions live in the page below it.

const props = defineProps<{
  projectId?: number | string;
  active?: "layout" | "sequences" | "controllers" | "shaders" | "library";
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
    <router-link to="/projects" class="wordmark" title="All projects">webX<span>Lights</span></router-link>
    <router-link v-if="projectId !== undefined" :to="`/projects/${projectId}/sequences`" class="crumb" title="This project">
      <span class="sep" aria-hidden="true">/</span>{{ project?.name ?? "…" }}
    </router-link>
    <nav v-if="projectId !== undefined" class="tabs" aria-label="Workspaces">
      <router-link :to="`/projects/${projectId}/layout`" :class="{ active: active === 'layout' }">Layout</router-link>
      <router-link :to="`/projects/${projectId}/sequences`" :class="{ active: active === 'sequences' }">Sequencer</router-link>
      <router-link :to="`/projects/${projectId}/controllers`" :class="{ active: active === 'controllers' }">Network</router-link>
      <router-link :to="`/projects/${projectId}/shaders`" :class="{ active: active === 'shaders' }">Shaders</router-link>
      <router-link :to="`/projects/${projectId}/library`" :class="{ active: active === 'library' }">Library</router-link>
    </nav>
    <div class="right">
      <slot />
      <router-link to="/docs">Docs</router-link>
      <button v-if="auth.user" type="button" class="logout" @click="logout">Log out<span class="who"> · {{ auth.user.name }}</span></button>
    </div>
  </header>
</template>

<style scoped>
.app-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 40px;
  padding: 0 0.75rem;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  font-family: var(--sans);
  font-size: 0.8rem;
  text-align: left;
  flex: none;
}
.wordmark {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.wordmark span {
  color: var(--accent);
}
.crumb {
  color: var(--text);
  text-decoration: none;
  white-space: nowrap;
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: -0.5rem;
}
.crumb:hover {
  color: var(--accent);
}
.sep {
  color: var(--text-dim);
  margin-right: 0.5rem;
}
.tabs {
  display: flex;
  gap: 0.15rem;
}
.tabs a {
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius);
  color: var(--text-muted);
  text-decoration: none;
  white-space: nowrap;
  transition: background 150ms ease-out, color 150ms ease-out;
}
.tabs a:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.tabs a.active {
  color: var(--accent-ink);
  background: var(--accent);
}
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.9rem;
}
.right a,
.logout {
  color: var(--text-muted);
  text-decoration: none;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.right a:hover,
.logout:hover {
  color: var(--text);
}
.who {
  color: var(--text-dim);
}
</style>
