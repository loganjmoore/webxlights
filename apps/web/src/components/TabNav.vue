<script setup lang="ts">
// The three places a show is built, reachable from all of them.
//
// Layout, Sequences and Controllers were each linked from some pages and not others - the
// sequencer had no way back to the layout at all without going through the project list - so
// moving between them meant navigating by browser history. They are one workflow, not three
// destinations.
defineProps<{ projectId: number | string; active: "layout" | "sequences" | "controllers" | "shaders" }>();
</script>

<template>
  <nav class="tab-nav">
    <router-link :to="`/projects/${projectId}/layout`" :class="{ active: active === 'layout' }">Layout</router-link>
    <router-link :to="`/projects/${projectId}/sequences`" :class="{ active: active === 'sequences' }">Sequencer</router-link>
    <router-link :to="`/projects/${projectId}/controllers`" :class="{ active: active === 'controllers' }">Network</router-link>
    <router-link :to="`/projects/${projectId}/shaders`" :class="{ active: active === 'shaders' }">Shaders</router-link>
  </nav>
</template>

<style scoped>
.tab-nav {
  display: flex;
  gap: 0.2rem;
}
.tab-nav a {
  padding: 0.2rem 0.6rem;
  border-radius: 3px;
  color: #9a9aa6;
  font-size: 0.8rem;
  text-decoration: none;
  white-space: nowrap;
}
.tab-nav a:hover {
  color: #e8e8ef;
  background: #23232b;
}
.tab-nav a.active {
  color: #111;
  background: #e8c468;
}
</style>
