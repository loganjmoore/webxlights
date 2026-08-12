import { readonly, ref } from "vue";

// App-styled confirmation, replacing window.confirm() everywhere. Native dialogs are the wrong
// tool here for three reasons that all showed up in this app: they're unstyleable (a system
// alert in the middle of a dark layout editor), they block the whole tab (so a canvas mid-drag
// freezes with the pointer captured), and Chrome suppresses them entirely after a few in a row
// - which would silently turn "confirm before deleting" into "delete without asking".
//
// One dialog instance lives in App.vue, so any component can await a confirmation without
// mounting or wiring up its own modal.

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // red confirm button for destructive actions
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

const pending = ref<PendingConfirm | null>(null);

export const activeConfirm = readonly(pending);

export function confirm(options: ConfirmOptions): Promise<boolean> {
  // A second request while one is open resolves the first as cancelled rather than losing its
  // promise - an awaited confirm() that never settles would hang the caller forever.
  pending.value?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending.value = { ...options, resolve };
  });
}

export function resolveConfirm(confirmed: boolean): void {
  const current = pending.value;
  if (!current) return;
  pending.value = null;
  current.resolve(confirmed);
}
