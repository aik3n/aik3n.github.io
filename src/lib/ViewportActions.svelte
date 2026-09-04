<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';

  let { requestToken = 0 }: { requestToken?: number } = $props();
  const { fitView } = useSvelteFlow();
  let lastRequestToken = $state(0);

  $effect(() => {
    const token = requestToken;
    if (!token || token === lastRequestToken) return;
    lastRequestToken = token;

    queueMicrotask(() => {
      fitView({ padding: 0.14, duration: 280 });
    });
  });
</script>
