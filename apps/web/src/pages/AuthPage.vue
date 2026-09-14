<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

// "Continue with Google" is a link, not a fetch: the browser has to leave for Google's page and
// come back to the server's callback, which sets the session and sends it on to /projects.
// Offered only when the server has a client configured, so a self-hosted copy without one
// doesn't show a button that goes nowhere.
const googleEnabled = ref(false);
const googleRequiresBrowser = ref(route.query.error === "google_browser");
// Start a fresh sign-in in the external browser; never copy an OAuth URL or session state.
const browserLoginUrl = new URL("/auth", window.location.origin).href;
const copyMessage = ref("");
const browserLink = ref<HTMLInputElement | null>(null);

async function copyBrowserLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(browserLoginUrl);
    copyMessage.value = "Link copied. Paste it into Chrome or Safari to sign in.";
  } catch {
    browserLink.value?.focus();
    browserLink.value?.select();
    copyMessage.value = "Select and copy the link above, then paste it into Chrome or Safari.";
  }
}

onMounted(async () => {
  if (route.query.error === "google") error.value = "Google sign-in didn't complete. Try again, or use your email and password.";
  try {
    const providers = await api.authProviders();
    googleEnabled.value = providers.google;
    googleRequiresBrowser.value = googleRequiresBrowser.value || providers.google_requires_browser === true;
  } catch {
    googleEnabled.value = false;
  }
});

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
      <h1>pixl</h1>
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
      <template v-if="googleEnabled || googleRequiresBrowser">
        <div class="or"><span>or</span></div>
        <a v-if="googleEnabled && !googleRequiresBrowser" class="google-btn" :href="api.googleRedirectUrl">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.95l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
          Continue with Google
        </a>
        <details class="browser-help" :open="googleRequiresBrowser">
          <summary>{{ googleRequiresBrowser ? 'Open in your browser to use Google' : 'Trouble signing in with Google?' }}</summary>
          <p>Google sign-in may not work inside Facebook, Instagram or other apps.</p>
          <p>Open this page in Chrome or Safari using the app’s menu, or copy the link below and paste it into your browser. Then choose Continue with Google.</p>
          <label>
            Login link
            <input ref="browserLink" :value="browserLoginUrl" readonly @focus="browserLink?.select()" />
          </label>
          <button class="google-btn" type="button" @click="copyBrowserLink">Copy login link</button>
          <p v-if="copyMessage" role="status">{{ copyMessage }}</p>
          <p>You can also use email and password above, or choose Register to create an account.</p>
        </details>
      </template>
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  min-height: 100svh;
  box-sizing: border-box;
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d0d11;
  font-family: system-ui, sans-serif;
}
.auth {
  box-sizing: border-box;
  width: 100%;
  max-width: 420px;
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
.or {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.1rem 0 0.9rem;
  font-size: 0.75rem;
  color: #5f5f6a;
}
.or::before,
.or::after {
  content: "";
  flex: 1;
  border-top: 1px solid #2a2a33;
}
.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.55rem 0;
  font-size: 0.9rem;
  font-weight: 500;
  border: 1px solid #3a3a44;
  border-radius: 5px;
  background: #1e1e26;
  color: #e8e8ef;
  text-decoration: none;
}
.google-btn:hover {
  border-color: #e8c468;
  background: #26262f;
}
.browser-help {
  margin-top: 1rem;
  text-align: left;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.browser-help summary {
  color: var(--text);
  cursor: pointer;
}
.browser-help p,
.browser-help label,
.browser-help button {
  margin-top: 0.85rem;
}
.browser-help input {
  min-width: 0;
}
.browser-help button {
  width: 100%;
  min-height: 44px;
  cursor: pointer;
}
@media (max-width: 480px) {
  .auth {
    padding: 1.5rem 1.25rem;
  }
  label input {
    font-size: 1rem;
  }
}
</style>
