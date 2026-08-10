import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";
import router from "./router";
import { installErrorTriage } from "./lib/errorTriage";

const app = createApp(App);
app.config.errorHandler = installErrorTriage();
app.use(createPinia()).use(router).mount("#app");
