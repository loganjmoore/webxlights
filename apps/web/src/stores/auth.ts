import { defineStore } from "pinia";
import { ref } from "vue";
import { api, ApiError, type User } from "../lib/api";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const loaded = ref(false);

  async function fetchMe(): Promise<void> {
    try {
      user.value = await api.me();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) user.value = null;
      else throw e;
    } finally {
      loaded.value = true;
    }
  }

  async function register(name: string, email: string, password: string): Promise<void> {
    await api.csrf();
    await api.register(name, email, password, password);
    await fetchMe();
  }

  async function login(email: string, password: string): Promise<void> {
    await api.csrf();
    await api.login(email, password);
    await fetchMe();
  }

  async function logout(): Promise<void> {
    await api.logout();
    user.value = null;
  }

  return { user, loaded, fetchMe, register, login, logout };
});
