<script lang="ts">
  import {
    BaseEdge,
    Position,
    getSmoothStepPath,
    type EdgeProps
  } from '@xyflow/svelte';

  let {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
    markerStart,
    markerEnd,
    interactionWidth
  }: EdgeProps = $props();

  let lane = $derived(Number((data as { lane?: number } | undefined)?.lane ?? 0));
  let isReturn = $derived(targetY <= sourceY);
  let laneOffset = $derived(28 + lane * 12);
  let stepPosition = $derived(
    isReturn
      ? Math.max(0.12, 0.34 - (lane % 4) * 0.045)
      : Math.min(0.82, 0.42 + (lane % 5) * 0.07)
  );

  let [edgePath] = $derived(
    getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Bottom,
      targetX,
      targetY,
      targetPosition: Position.Top,
      borderRadius: 8,
      offset: laneOffset,
      stepPosition
    })
  );
</script>

<BaseEdge
  {id}
  path={edgePath}
  {markerStart}
  {markerEnd}
  {interactionWidth}
/>
