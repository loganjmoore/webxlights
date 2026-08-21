import { createRouter, createWebHistory } from "vue-router";
import AuthPage from "../pages/AuthPage.vue";
import ProjectsPage from "../pages/ProjectsPage.vue";
import LayoutPage from "../pages/LayoutPage.vue";
import ControllersPage from "../pages/ControllersPage.vue";
import SequencesListPage from "../pages/SequencesListPage.vue";
import SequencerPage from "../pages/SequencerPage.vue";
import DocsPage from "../pages/DocsPage.vue";
import ShadersPage from "../pages/ShadersPage.vue";
import PreviewPage from "../pages/PreviewPage.vue";
import PanelWindowPage from "../pages/PanelWindowPage.vue";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/projects" },
    { path: "/auth", component: AuthPage },
    { path: "/docs", component: DocsPage },
    { path: "/projects", component: ProjectsPage, meta: { requiresAuth: true } },
    { path: "/projects/:projectId/layout", component: LayoutPage, meta: { requiresAuth: true } },
    { path: "/projects/:projectId/controllers", component: ControllersPage, meta: { requiresAuth: true } },
    { path: "/projects/:projectId/sequences", component: SequencesListPage, meta: { requiresAuth: true } },
    { path: "/projects/:projectId/shaders", component: ShadersPage, meta: { requiresAuth: true } },
    {
      path: "/projects/:projectId/sequences/:sequenceId",
      name: "sequencer",
      component: SequencerPage,
      meta: { requiresAuth: true },
    },
    {
      // The pop-out house preview (lib/previewChannel.ts). A real route rather than a
      // detached component, so it survives a reload and can be bookmarked onto a second screen.
      path: "/projects/:projectId/sequences/:sequenceId/preview",
      name: "sequence-preview",
      component: PreviewPage,
      meta: { requiresAuth: true },
    },
    {
      // A panel torn off into its own window (lib/previewChannel.ts' openPanelWindow). Same
      // reasoning as the preview route: a real route survives a reload and can be bookmarked
      // onto the screen it belongs on.
      path: "/projects/:projectId/sequences/:sequenceId/panel/:panel",
      name: "sequence-panel",
      component: PanelWindowPage,
      meta: { requiresAuth: true },
    },
    ...(import.meta.env.DEV
      ? [{ path: "/dev/bench", component: () => import("../pages/DevBenchPage.vue") }]
      : []),
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
