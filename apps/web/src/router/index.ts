import { createRouter, createWebHistory } from "vue-router";
import AuthPage from "../pages/AuthPage.vue";
import ProjectsPage from "../pages/ProjectsPage.vue";
import LayoutPage from "../pages/LayoutPage.vue";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/projects" },
    { path: "/auth", component: AuthPage },
    { path: "/projects", component: ProjectsPage, meta: { requiresAuth: true } },
    { path: "/projects/:projectId/layout", component: LayoutPage, meta: { requiresAuth: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) await auth.fetchMe();
  if (to.meta.requiresAuth && !auth.user) return "/auth";
  if (to.path === "/auth" && auth.user) return "/projects";
  return true;
});

export default router;
