<script setup lang="ts">
// Mounted once at the root so any component can `await confirm(...)` (lib/confirm.ts) without
// wiring up a modal of its own.
import ConfirmDialog from "./components/ConfirmDialog.vue";
</script>

<template>
  <router-view />
  <ConfirmDialog />
</template>
