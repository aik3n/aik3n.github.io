<script module lang="ts">
  import type { Node } from '@xyflow/svelte';

  export type DialogueOption = {
    id: string;
    text: string;
    targetId?: string;
    targetLabel?: string;
  };

  export type DialogueNodeData = {
    title: string;
    text: string;
    options: DialogueOption[];
    initial?: boolean;
    connectionHighlight?: 'source' | 'target' | 'both';
  };

  export type DialogueNode = Node<DialogueNodeData, 'dialogue'>;
</script>

<script lang="ts">
  import {
    Handle,
    Position,
    type NodeProps,
    useUpdateNodeInternals
  } from '@xyflow/svelte';

  let { id, data }: NodeProps<DialogueNode> = $props();
  const updateNodeInternals = useUpdateNodeInternals();

  function dialogueLineCount(): number {
    return data.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .length;
  }

  $effect(() => {
    data.options.length;
    queueMicrotask(() => updateNodeInternals(id));
  });
</script>

<div
  class={`node-card compact-node${data.initial ? ' initial-node' : ''}${data.connectionHighlight ? ' connection-endpoint' : ''}`}
>
  <Handle type="target" position={Position.Top} />

  <div class="node-title">
    {#if data.initial}<span class="start-marker">▶</span>{/if}
    <span>{data.title}</span>
  </div>

  <div class="node-text-compact">
    <div class="node-text-preview">{data.text || 'Sin texto'}</div>
    {#if dialogueLineCount() > 2}
      <div class="node-text-more">{dialogueLineCount()} líneas de diálogo</div>
    {/if}
  </div>

  {#if data.options.length > 0}
    <div class="node-options-title">{data.options.length} {data.options.length === 1 ? 'opción' : 'opciones'}</div>

    {#each data.options as option}
      <div class="node-option compact-option">
        <div class="node-option-copy compact-option-copy">
          <span class="equals-marker">=</span>
          <span class="option-text-ellipsis">{option.text}</span>
          <span class="option-target-inline">
            {#if option.targetLabel}
              → {option.targetLabel}
            {:else}
              → —
            {/if}
          </span>
        </div>
      </div>
    {/each}

    <div class="node-output-band">
      {#each data.options as option, index}
        <Handle
          id={option.id}
          type="source"
          position={Position.Bottom}
          class="option-handle"
          style={`left: calc((100% / ${data.options.length}) * (${index} + 0.5));`}
        />
      {/each}
    </div>
  {:else}
    <div class="node-no-options">Sin opciones</div>
  {/if}
</div>
