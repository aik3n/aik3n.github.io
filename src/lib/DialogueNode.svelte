<script lang="ts">
  import {
    Handle,
    Position,
    type NodeProps,
    useUpdateNodeInternals
  } from '@xyflow/svelte';
  import type { DialogueNode, DialogueOption, NodeEditIntent } from './dialogueGraph';

  let { id, data }: NodeProps<DialogueNode> = $props();
  const updateNodeInternals = useUpdateNodeInternals();

  function dialogueLineCount(): number {
    return data.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .length;
  }

  function optionLeft(index: number) {
    const count = Math.max(1, data.options.length);
    return `calc((100% / ${count}) * (${index} + 0.5))`;
  }

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

  function deleteThisNode(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    data.onDeleteNode?.(id);
  }

  function optionEffectsSummary(option: DialogueOption) {
    return option.effects
      .filter((effect) => effect.item.trim())
      .map((effect) => `${effect.operation === 'add' ? '+' : '-'}${effect.item.trim()}`)
      .join(', ');
  }

  $effect(() => {
    data.options.length;
    data.options.reduce((total, option) => total + option.effects.length, 0);
    data.conditions.length;
    data.jumpTargetLabel;
    queueMicrotask(() => updateNodeInternals(id));
  });
</script>

<div
  class={`node-card compact-node options-node${data.initial ? ' initial-node' : ''}${data.editorSelected ? ' editor-selected' : ''}${data.connectionHighlight ? ' connection-endpoint' : ''}`}
>
  <Handle type="target" position={Position.Top} />

  <button
    type="button"
    class="node-card-delete nodrag nopan"
    onclick={deleteThisNode}
    disabled={!data.canDeleteNode?.(id)}
    title={data.canDeleteNode?.(id) ? 'Borrar nodo' : 'Este nodo no se puede borrar'}
    aria-label="Borrar nodo"
  >×</button>

  <div
    class="node-title editable-node-part"
    onclick={(event) => navigate(event, { section: 'name' })}
    ondblclick={(event) => navigateFocus(event, { section: 'name', field: 'name' })}
  >
    {#if data.initial}<span class="start-marker">▶</span>{/if}
    <span>{data.title}</span>
    <span class="node-kind-badge">OPCIONES</span>
  </div>

  <div
    class="node-text-compact editable-node-part"
    onclick={(event) => navigate(event, { section: 'dialogue' })}
    ondblclick={(event) => navigateFocus(event, { section: 'dialogue', field: 'text' })}
  >
    <div class="node-text-preview">{data.text || 'Sin texto'}</div>
    {#if dialogueLineCount() > 2}
      <div class="node-text-more">{dialogueLineCount()} líneas de diálogo</div>
    {/if}
  </div>

  {#if data.conditions.length > 0}
    <div class="node-conditions-title">{data.conditions.length} {data.conditions.length === 1 ? 'condición' : 'condiciones'}</div>

    {#each data.conditions as condition}
      <div
        class="node-condition-row embedded-condition-row editable-node-part"
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
  {/if}

  {#if data.jumpTargetLabel}
    <!-- 064: salto directo -->
    <div
      class="node-direct-jump editable-node-part"
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

  {#if data.options.length > 0}
    <div class="node-options-title">{data.options.length} {data.options.length === 1 ? 'opción' : 'opciones'}</div>

    {#each data.options as option, index}
      <div
        class="node-option compact-option editable-node-part"
        onclick={(event) => navigate(event, { section: 'options', itemId: option.id })}
        ondblclick={(event) => navigateFocus(event, { section: 'options', itemId: option.id, field: 'option' })}
      >
        <div class="node-option-copy compact-option-copy">
          <span class="option-number">{index + 1}.</span>
          <span class="option-text-ellipsis">{option.text}</span>
          <span class="option-target-inline">
            {#if option.targetLabel}→ {option.targetLabel}{:else}→ —{/if}
          </span>
        </div>
        {#if optionEffectsSummary(option)}
          <div class="option-effects-summary">[{optionEffectsSummary(option)}]</div>
        {/if}
      </div>
    {/each}

    <div class="node-output-band">
      {#each data.options as option, index}
        <div class="option-output-number" style={`left: ${optionLeft(index)};`}>{index + 1}</div>
        <Handle
          id={option.id}
          type="source"
          position={Position.Bottom}
          class="option-handle"
          style={`left: ${optionLeft(index)};`}
        />
      {/each}
    </div>
  {:else}
    <div class="node-no-options">Sin opciones</div>
  {/if}
</div>


<style>
  .node-direct-jump {
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

  .option-effects-summary {
    margin: 4px 0 0 24px;
    overflow: hidden;
    color: #5f725f;
    font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    font-size: 9px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
