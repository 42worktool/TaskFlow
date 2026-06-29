<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <nav>
    <RouterLink to="/signin">Sign In</RouterLink>
    <RouterLink to="/signup">Sign Up</RouterLink>
    <RouterLink to="/workspaces">Workspace</RouterLink>
  </nav>

  <RouterView />
</template>
