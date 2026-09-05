import { computed, onBeforeUnmount, ref } from "vue";

// Tearing a piece of the page off into a browser window of its own.
//
// Not a copy rendered from a second route: the very same DOM nodes, teleported into a blank
// same-origin window, so whatever moved keeps its state and its reactivity - the store it reads,
// the inputs half-typed - without any of its code knowing it moved. Close that window and the
// nodes come home. Shared by the dialogs (ModalPanel.vue) and the docked effect settings.
//
// Shift-click opens a tab instead of a window. A blocked popup is reported, not swallowed.

export function useTearOff(title: () => string) {
  const popup = ref<Window | null>(null);
  const popped = computed(() => popup.value !== null);
  /** Where a `<Teleport>` should send the nodes: the popup's body while torn off, else the page. */
  const teleportTo = ref<string | HTMLElement>("body");
  const blocked = ref(false);

  function popOut(e?: MouseEvent, size = { width: 640, height: 760 }): void {
    if (popup.value) {
      popup.value.focus();
      return;
    }
    const name = `webxlights-panel-${title()}`;
    const features = e?.shiftKey ? "" : `width=${size.width},height=${size.height},popup=yes`;
    const w = window.open("", name, features);
    if (!w) {
      blocked.value = true;
      return;
    }
    blocked.value = false;
    const doc = w.document;
    doc.title = `${title()} · pixl`;
    doc.documentElement.style.colorScheme = "dark";
    // The new document starts blank; it gets the app's stylesheets, cloned, so a scoped style or
    // a dev-server-injected one comes along.
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) {
      const clone = node.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
      // A relative href resolved against about:blank goes nowhere; the property is absolute.
      if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
      doc.head.appendChild(clone);
    }
    doc.body.style.margin = "0";
    doc.body.style.background = "var(--bg-panel, #16161c)";
    doc.body.style.color = "var(--text, #e8e8ef)";
    doc.body.style.font = "0.9rem system-ui, sans-serif";
    // Closing the window is the way back: pagehide fires and the nodes return to the page.
    w.addEventListener("pagehide", rejoin);
    popup.value = w;
    teleportTo.value = doc.body;
  }

  function rejoin(): void {
    const w = popup.value;
    if (!w) return;
    w.removeEventListener("pagehide", rejoin);
    popup.value = null;
    teleportTo.value = "body";
  }

  function closePopup(): void {
    const w = popup.value;
    rejoin();
    if (w && !w.closed) w.close();
  }

  // The page is going away: its window goes too.
  onBeforeUnmount(closePopup);

  return { popup, popped, teleportTo, blocked, popOut, closePopup };
}
