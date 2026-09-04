<script lang="ts">
  import { useSvelteFlow, type Viewport } from '@xyflow/svelte';

  let {
    requestToken = 0,
    restoreToken = 0,
    restoreViewport = null
  }: {
    requestToken?: number;
    restoreToken?: number;
    restoreViewport?: Viewport | null;
  } = $props();

  const { fitView, setViewport } = useSvelteFlow();
  let lastRequestToken = $state(0);
  let lastRestoreToken = $state(0);

  $effect(() => {
    const token = requestToken;
    if (!token || token === lastRequestToken) return;
    lastRequestToken = token;

    // 092: esperar a que los nodos estén medidos antes de centrar
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitView({ padding: 0.14, duration: 280 });
      });
    });
  });

  $effect(() => {
    const token = restoreToken;
    const viewport = restoreViewport;
    if (!token || token === lastRestoreToken || !viewport) return;
    lastRestoreToken = token;

    queueMicrotask(() => {
      setViewport(viewport, { duration: 0 });
    });
  });
</script>
