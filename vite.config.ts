import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // ZeNode se publica como "project site":
  // https://aik3n.github.io/ZeNode/
  base: '/ZeNode/',
  plugins: [svelte()]
});
