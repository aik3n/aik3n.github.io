<script lang="ts">
  import {
    Handle,
    Position,
    type NodeProps,
    useUpdateNodeInternals
  } from '@xyflow/svelte';
  import type { DialogueNode, NodeEditIntent } from './dialogueGraph';

  let { id, data }: NodeProps<DialogueNode> = $props();
  const updateNodeInternals = useUpdateNodeInternals();

  function showConditionJump(event: MouseEvent, conditionId: string) {
    event.stopPropagation();
    data.onConditionTargetClick?.(id, conditionId);
  }

  function navigate(event: MouseEvent, intent: NodeEditIntent) {
    event.stopPropagation();
    data.onInspectorNavigate?.(id, intent);
  }

  function navigateFocus(event: MouseEvent, intent: NodeEditIntent) {
    event.preventDefault();
    event.stopPropagation();
    data.onInspectorNavigate?.(id, { ...intent, focus: true });
  }

  $effect(() => {
    data.conditions.length;
    data.jumpTargetLabel;
    queueMicrotask(() => updateNodeInternals(id));
  });
</script>

<div class={`condition-card condition-only-node${data.initial ? ' initial-condition-node' : ''}${data.editorSelected ? ' editor-selected' : ''}${data.connectionHighlight ? ' connection-endpoint' : ''}`}>
  <Handle type="target" position={Position.Top} />

  <div
    class="condition-title editable-node-part"
    onclick={(event) => navigate(event, { section: 'name' })}
    ondblclick={(event) => navigateFocus(event, { section: 'name', field: 'name' })}
  >
    {#if data.initial}<span class="start-marker">▶</span>{/if}
    <span class="condition-symbol">?</span>
    <span class="condition-node-name">{data.title}</span>
    <span class="condition-kind-badge">CONDICIONES</span>
  </div>

  {#if data.text.trim()}
    <div
      class="condition-fallback-text editable-node-part"
      title={data.text}
      onclick={(event) => navigate(event, { section: 'dialogue' })}
      ondblclick={(event) => navigateFocus(event, { section: 'dialogue', field: 'text' })}
    >{data.text}</div>
  {/if}

  {#if data.jumpTargetLabel}
    <!-- 064: salto directo -->
    <div
      class="condition-direct-jump editable-node-part"
      onclick={(event) => navigate(event, { section: 'jump' })}
      ondblclick={(event) => navigateFocus(event, { section: 'jump', field: 'target' })}
    >
      <span>&gt;</span>
      <span>{data.jumpTargetLabel}</span>
      <Handle
        id="direct-jump"
        type="source"
        position={Position.Right}
        class="direct-jump-handle"
      />
    </div>
  {/if}

  {#each data.conditions as condition}
    <div
      class="condition-only-row editable-node-part"
      onclick={(event) => navigate(event, { section: 'conditions', itemId: condition.id })}
      ondblclick={(event) => navigateFocus(event, { section: 'conditions', itemId: condition.id, field: 'items' })}
    >
      <span class="condition-number">?{condition.order}.</span>
      <span class="condition-text-ellipsis">{condition.items.join(' + ') || '—'}</span>
      <button
        type="button"
        class="condition-target-button nodrag nopan"
        onclick={(event) => showConditionJump(event, condition.id)}
      >→ {condition.targetLabel || '—'}</button>
      <Handle
        id={condition.id}
        type="source"
        position={Position.Right}
        class="condition-side-handle"
        isConnectable={true}
      />
    </div>
  {/each}
</div>

<style>
  /* 064: salto directo */
  .condition-direct-jump {
    position: relative;
    display: flex;
    gap: 7px;
    align-items: center;
    padding: 7px 13px;
    border-top: 1px solid #e1e5ec;
    background: #f4f6f9;
    color: #56657a;
    font-size: 10px;
    font-weight: 800;
  }

  .direct-jump-handle {
    right: -6px;
  }
</style>
