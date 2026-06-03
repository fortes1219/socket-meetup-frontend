<script setup lang="ts">
import { RouterView } from 'vue-router';
import { useCoordinationBootstrap } from '@/composables/useCoordinationBootstrap';

useCoordinationBootstrap();
</script>

<template>
  <RouterView />
</template>
