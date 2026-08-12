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
  <div class="auth-shell">
    <main class="auth">
      <h1>webX<span>Lights</span></h1>
      <p class="tagline">Browser-based xLights-compatible show designer</p>
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
        <button class="submit-btn" type="submit">{{ mode === "register" ? "Create account" : "Log in" }}</button>
      </form>
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d0d11;
  font-family: system-ui, sans-serif;
}
.auth {
  width: 100%;
  max-width: 340px;
  padding: 2rem 2.25rem;
  background: #16161c;
  border: 1px solid #2a2a33;
  border-radius: 10px;
}
.auth h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #fff;
  letter-spacing: -0.01em;
}
.auth h1 span {
  color: #e8c468;
}
.tagline {
  margin: 0.35rem 0 1.5rem;
  font-size: 0.8rem;
  color: #888;
}
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  padding: 0.2rem;
  background: #0d0d11;
  border-radius: 6px;
}
.tabs button {
  flex: 1;
  padding: 0.4rem 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #999;
  cursor: pointer;
}
.tabs .active {
  background: #e8c468;
  color: #111;
  font-weight: 600;
}
form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: #aaa;
}
label input {
  padding: 0.5rem 0.6rem;
  font-size: 0.9rem;
  border: 1px solid #333;
  border-radius: 5px;
  background: #0d0d11;
  color: #eee;
}
label input:focus {
  outline: none;
  border-color: #e8c468;
}
.error {
  margin: 0;
  color: #e57373;
  font-size: 0.8rem;
}
.submit-btn {
  margin-top: 0.4rem;
  padding: 0.55rem 0;
  font-size: 0.9rem;
  font-weight: 600;
  border: none;
  border-radius: 5px;
  background: #e8c468;
  color: #111;
  cursor: pointer;
}
.submit-btn:hover {
  background: #f0d488;
}
</style>
