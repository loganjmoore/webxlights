// M9 hardening: before this, an uncaught error in a component render/watcher or an unhandled
// promise rejection (a store action's fetch failing without a .catch, say) left the user
// staring at a silently-frozen or blank page with nothing but a console error - no way to
// tell "webXLights broke" from "my internet dropped" from "I'm just waiting". This installs
// a last-resort banner that works even if Vue's own runtime is the thing that broke, since it
// touches the DOM directly rather than going through a component.
let shown = false;

function showBanner(message: string): void {
  if (shown) return;
  shown = true;

  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:99999;background:#3a1f1f;color:#f5b7b1;" +
    "padding:0.6rem 1rem;font:13px system-ui,sans-serif;display:flex;align-items:center;gap:0.75rem;" +
    "border-bottom:1px solid #5a2f2f;";

  const text = document.createElement("span");
  text.textContent = `Something went wrong: ${message}`;
  text.style.flex = "1";

  const reload = document.createElement("button");
  reload.textContent = "Reload";
  reload.style.cssText = "padding:0.25rem 0.6rem;cursor:pointer;";
  reload.onclick = () => window.location.reload();

  banner.appendChild(text);
  banner.appendChild(reload);
  document.body.prepend(banner);
}

function messageFrom(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "unexpected error";
}

export function installErrorTriage(): (err: unknown, instance: unknown, info: string) => void {
  window.addEventListener("error", (e) => {
    console.error("[webXLights] uncaught error:", e.error ?? e.message);
    showBanner(messageFrom(e.error ?? e.message));
  });

  window.addEventListener("unhandledrejection", (e) => {
    console.error("[webXLights] unhandled promise rejection:", e.reason);
    showBanner(messageFrom(e.reason));
  });

  // Passed to app.config.errorHandler - catches errors Vue itself intercepts (render,
  // watcher, lifecycle hooks) that would otherwise only reach the console.
  return (err, _instance, info) => {
    console.error(`[webXLights] Vue error (${info}):`, err);
    showBanner(messageFrom(err));
  };
}
