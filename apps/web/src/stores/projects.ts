import { defineStore } from "pinia";
import { ref } from "vue";
import { api, type Project } from "../lib/api";

export const useProjectsStore = defineStore("projects", () => {
  const projects = ref<Project[]>([]);

  async function fetchAll(): Promise<void> {
    projects.value = await api.listProjects();
  }

  async function create(name: string): Promise<Project> {
    const project = await api.createProject(name);
    projects.value.push(project);
    return project;
  }

  return { projects, fetchAll, create };
});
