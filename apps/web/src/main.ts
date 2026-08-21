import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";
import router from "./router";
import { installErrorTriage } from "./lib/errorTriage";
import { setShaderHost } from "@webxlights/engine";
import { createWebglShaderHost } from "./lib/webglShaderHost";

// GLSL needs a GPU, which the engine has no way to reach on its own (engine/shaderRuntime.ts).
// Installed once here; a browser without WebGL2 gets null and shader layers render blank while
// every other effect carries on.
setShaderHost(createWebglShaderHost());

const app = createApp(App);
app.config.errorHandler = installErrorTriage();
app.use(createPinia()).use(router).mount("#app");
