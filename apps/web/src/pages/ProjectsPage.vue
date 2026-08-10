<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectsStore } from "../stores/projects";

const projects = useProjectsStore();
const router = useRouter();
const newName = ref("");

onMounted(() => projects.fetchAll());

async function createProject(): Promise<void> {
  if (!newName.value.trim()) return;
  const project = await projects.create(newName.value.trim());
  newName.value = "";
  router.push(`/projects/${project.id}/layout`);
}
</script>

<template>
  <main class="projects">
    <h1>Your projects</h1>
    <form @submit.prevent="createProject">
      <input v-model="newName" placeholder="New project name" required />
      <button type="submit">Create</button>
    </form>
    <ul>
      <li v-for="p in projects.projects" :key="p.id">
        <router-link :to="`/projects/${p.id}/layout`">{{ p.name }}</router-link>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.projects {
  max-width: 480px;
  margin: 4rem auto;
  font-family: system-ui, sans-serif;
}
form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
form input {
  flex: 1;
}
</style>
