<script setup lang="ts">
import { ref } from "vue";

// A named, foldable group of controls.
//
// The effect settings panel is long enough that the control you want is usually off the bottom of
// it, and which controls matter depends entirely on what you are doing - somebody adjusting
// colours never touches layer blending, and vice versa. Folding the rest away is what makes a
// panel this tall usable at all.
//
// Open state is per-section and remembered for the session, not stored: it belongs to what you
// are doing right now rather than to the show.

// The default has to be declared: Vue casts a boolean prop that wasn't passed to false, so
// "open unless told otherwise" written as `defaultOpen !== false` came out closed everywhere.
const props = withDefaults(defineProps<{ title: string; defaultOpen?: boolean }>(), { defaultOpen: true });
const open = ref(props.defaultOpen);
</script>

<template>
  <section class="collapsible" :class="{ open }">
    <button type="button" class="section-head" :aria-expanded="open" @click="open = !open">
      <span class="twisty">{{ open ? "▾" : "▸" }}</span>
      <span class="section-title">{{ title }}</span>
    </button>
    <div v-if="open" class="section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.collapsible {
  border-top: 1px solid #2c2c34;
}
.section-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.45rem 0.2rem;
  background: none;
  border: none;
  color: #cfcfd8;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: left;
  cursor: pointer;
}
.section-head:hover {
  color: #e8e8ef;
}
.twisty {
  width: 0.7rem;
  color: #8a8a95;
}
.section-body {
  padding: 0 0.2rem 0.6rem;
}
</style>
