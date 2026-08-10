<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();
</script>

<template>
  <main class="layout-page">
    <header>
      <router-link to="/projects">&larr; Projects</router-link>
      <h1>Layout</h1>
    </header>
    <div class="canvas-placeholder">
      Project #{{ route.params.projectId }} — layout canvas lands in M1.
    </div>
  </main>
</template>

<style scoped>
.layout-page {
  font-family: system-ui, sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
}
header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #ddd;
  display: flex;
  align-items: baseline;
  gap: 1rem;
}
.canvas-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}
</style>
