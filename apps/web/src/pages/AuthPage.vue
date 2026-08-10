<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();

const mode = ref<"login" | "register">("login");
const name = ref("");
const email = ref("");
const password = ref("");
const error = ref("");

async function submit(): Promise<void> {
  error.value = "";
  try {
    if (mode.value === "register") await auth.register(name.value, email.value, password.value);
    else await auth.login(email.value, password.value);
    router.push("/projects");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Something went wrong";
  }
}
</script>

<template>
  <main class="auth">
    <h1>webXLights</h1>
    <div class="tabs">
      <button :class="{ active: mode === 'login' }" @click="mode = 'login'">Log in</button>
      <button :class="{ active: mode === 'register' }" @click="mode = 'register'">Register</button>
    </div>
    <form @submit.prevent="submit">
      <label v-if="mode === 'register'">
        Name
        <input v-model="name" required />
      </label>
      <label>
        Email
        <input v-model="email" type="email" required />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required minlength="8" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit">{{ mode === "register" ? "Create account" : "Log in" }}</button>
    </form>
  </main>
</template>

<style scoped>
.auth {
  max-width: 320px;
  margin: 4rem auto;
  font-family: system-ui, sans-serif;
}
.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.tabs button {
  flex: 1;
}
.tabs .active {
  font-weight: bold;
}
form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.error {
  color: #c0392b;
}
</style>
