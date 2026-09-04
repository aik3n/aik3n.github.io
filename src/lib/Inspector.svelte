<script lang="ts">
  import type { DialogueNode, InspectorRequest, InventoryEffectOperation } from './dialogueGraph';
  import DestinationPicker from './DestinationPicker.svelte';

  type Props = {
    node?: DialogueNode;
    request?: InspectorRequest | null;
    availableNodeTitles: string[];
    onUpdateNode: (field: 'title' | 'text', value: string) => void;
    // 064: salto directo
    onUpdateJumpTarget: (value: string) => void;
    // 063: inventario al entrar
    onAddNodeEffect: () => string | undefined;
    onUpdateNodeEffect: (effectId: string, field: 'operation' | 'item', value: string) => void;
    onRemoveNodeEffect: (effectId: string) => void;
    onAddCondition: () => string | undefined;
    onUpdateConditionItems: (conditionId: string, value: string) => void;
    onUpdateConditionTarget: (conditionId: string, value: string) => void;
    onRemoveCondition: (conditionId: string) => void;
    onAddOption: () => string | undefined;
    onUpdateOption: (optionId: string, value: string) => void;
    onUpdateOptionTarget: (optionId: string, value: string) => void;
    onAddOptionEffect: (optionId: string) => string | undefined;
    onUpdateOptionEffect: (optionId: string, effectId: string, field: 'operation' | 'item', value: string) => void;
    onRemoveOptionEffect: (optionId: string, effectId: string) => void;
    onRemoveOption: (optionId: string) => void;
  };

  let {
    node,
    request = null,
    availableNodeTitles,
    onUpdateNode,
    onUpdateJumpTarget,
    onAddNodeEffect,
    onUpdateNodeEffect,
    onRemoveNodeEffect,
    onAddCondition,
    onUpdateConditionItems,
    onUpdateConditionTarget,
    onRemoveCondition,
    onAddOption,
    onUpdateOption,
    onUpdateOptionTarget,
    onAddOptionEffect,
    onUpdateOptionEffect,
    onRemoveOptionEffect,
    onRemoveOption
  }: Props = $props();

  let root = $state<HTMLElement | null>(null);
  let nameOpen = $state(true);
  let dialogueOpen = $state(true);
  let nodeInventoryOpen = $state(false);
  let jumpOpen = $state(false);
  let conditionsOpen = $state(false);
  let optionsOpen = $state(true);
  let lastNodeId = $state('');
  let lastRequestToken = $state(-1);
  let nodeEffects = $derived(node?.data.effects ?? []);

  function focusKey(key: string) {
    queueMicrotask(() => {
      const element = root?.querySelector(`[data-focus-key="${key}"]`) as HTMLElement | null;
      element?.focus();
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.select();
      }
    });
  }

  function openSection(section: InspectorRequest['section']) {
    if (section === 'name') nameOpen = true;
    if (section === 'dialogue') dialogueOpen = true;
    if (section === 'jump') jumpOpen = true;
    if (section === 'conditions') conditionsOpen = true;
    if (section === 'options') optionsOpen = true;
  }

  function requestFocusKey(current: InspectorRequest) {
    if (current.section === 'name') return 'name';
    if (current.section === 'dialogue') return 'dialogue';
    if (current.section === 'jump') return 'jump:target';
    if (current.section === 'conditions' && current.itemId) {
      return current.field === 'target'
        ? `condition:${current.itemId}:target`
        : `condition:${current.itemId}:items`;
    }
    if (current.section === 'options' && current.itemId) {
      return current.field === 'target'
        ? `option:${current.itemId}:target`
        : `option:${current.itemId}`;
    }
    return '';
  }

  $effect(() => {
    const nodeId = node?.id ?? '';
    if (nodeId && nodeId !== lastNodeId) {
      lastNodeId = nodeId;
      nameOpen = true;
      dialogueOpen = node?.type === 'options';
      nodeInventoryOpen = (node?.data.effects?.length ?? 0) > 0;
      jumpOpen = Boolean(node?.data.jumpTargetLabel);
      conditionsOpen = node?.type === 'conditions';
      optionsOpen = node?.type === 'options';
    }
  });

  $effect(() => {
    const current = request;
    if (!current || current.nodeId !== node?.id || current.token === lastRequestToken) return;
    lastRequestToken = current.token;
    openSection(current.section);
    if (current.focus) {
      const key = requestFocusKey(current);
      if (key) focusKey(key);
    }
  });

  function addNodeEffectAndFocus() {
    nodeInventoryOpen = true;
    const effectId = onAddNodeEffect();
    if (effectId) focusKey(`node:effect:${effectId}:item`);
  }

  function addConditionAndFocus() {
    conditionsOpen = true;
    const id = onAddCondition();
    if (id) focusKey(`condition:${id}:items`);
  }

  function addOptionAndFocus() {
    optionsOpen = true;
    const id = onAddOption();
    if (id) focusKey(`option:${id}`);
  }

  function addOptionEffectAndFocus(optionId: string) {
    const effectId = onAddOptionEffect(optionId);
    if (effectId) focusKey(`option:${optionId}:effect:${effectId}:item`);
  }

  function startNewNodeDrag(event: DragEvent) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('application/x-zemobida-node', 'options');
    event.dataTransfer.effectAllowed = 'copy';
  }

</script>

<div class="inspector-component" bind:this={root}>
  <div class="inspector-heading">
    <span>Inspector</span>
    <small>{node?.id ?? '—'}</small>
  </div>

  {#if node}
    <!-- 068: un solo concepto de nodo; sin pastilla de tipo -->

    <details class="inspector-section" bind:open={nameOpen}>
      <summary>
        <span>Nombre</span>
        <small>{node.data.title}</small>
      </summary>
      <div class="inspector-section-body">
        <label class="inspector-field-label">
          <!-- 084: sin texto redundante Nombre del nodo -->
          <input
            data-focus-key="name"
            value={node.data.title}
            oninput={(event) => onUpdateNode('title', event.currentTarget.value)}
          />
        </label>
      </div>
    </details>

    <details class="inspector-section" bind:open={dialogueOpen}>
      <summary>
        <span>Diálogo</span>
        <small>{node.data.text.split('\n').filter((line) => line.trim()).length} líneas</small>
      </summary>
      <div class="inspector-section-body">
        <textarea
          data-focus-key="dialogue"
          rows="6"
          value={node.data.text}
          oninput={(event) => onUpdateNode('text', event.currentTarget.value)}
        ></textarea>
      </div>
    </details>

    <details class="inspector-section" bind:open={nodeInventoryOpen}>
      <summary>
        <span>Inventario al entrar</span>
        <small>{nodeEffects.length}</small>
      </summary>

      <div class="inspector-section-body">
        <div class="option-inventory-heading">
          <span>se ejecuta al mostrar el nodo</span>
          <button
            type="button"
            class="small-button inventory-add-button"
            onclick={addNodeEffectAndFocus}
            disabled={!node.data.text.trim()}
          >+ Efecto</button>
        </div>

        {#if !node.data.text.trim()}
          <div class="empty-state">
            Añade texto de diálogo para poder asociar efectos al nodo.
          </div>
        {:else if nodeEffects.length === 0}
          <div class="inventory-empty">Sin cambios de inventario al entrar.</div>
        {:else}
          <div class="inventory-effect-list">
            {#each nodeEffects as effect}
              <div class="inventory-effect-row">
                <select
                  aria-label="Dar o quitar objeto al entrar"
                  value={effect.operation}
                  onchange={(event) => onUpdateNodeEffect(
                    effect.id,
                    'operation',
                    event.currentTarget.value as InventoryEffectOperation
                  )}
                >
                  <option value="add">Dar +</option>
                  <option value="remove">Quitar −</option>
                </select>

                <input
                  data-focus-key={`node:effect:${effect.id}:item`}
                  value={effect.item}
                  placeholder="objeto"
                  oninput={(event) => onUpdateNodeEffect(
                    effect.id,
                    'item',
                    event.currentTarget.value
                  )}
                />

                <button
                  type="button"
                  class="icon-danger-button small-x"
                  title="Borrar efecto"
                  aria-label="Borrar efecto"
                  onclick={() => onRemoveNodeEffect(effect.id)}
                >×</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </details>

    <details class="inspector-section" bind:open={jumpOpen}>
      <summary>
        <span>Salto directo &gt;</span>
        <small>{node.data.jumpTargetLabel || '—'}</small>
      </summary>
      <div class="inspector-section-body">
        <label class="compact-label">
          Destino automático
          <DestinationPicker
            value={node.data.jumpTargetLabel ?? ''}
            {availableNodeTitles}
            focusKey="jump:target"
            onChange={onUpdateJumpTarget}
          />
        </label>
        <div class="inventory-empty">
          Vacío = sin salto. RANDOM se conserva como destino especial.
        </div>
      </div>
    </details>

    <details class="inspector-section" bind:open={conditionsOpen}>
      <summary>
        <span>Condiciones</span>
        <small>{node.data.conditions.length}</small>
      </summary>
      <div class="inspector-section-body">
        <div class="section-inline-actions">
          <span>varios objetos = AND</span>
          <button type="button" class="small-button" onclick={addConditionAndFocus}>+ Condición</button>
        </div>

        {#if node.data.conditions.length === 0}
          <div class="empty-state">Este nodo no tiene condiciones.</div>
        {:else}
          <div class="condition-editor-list">
            {#each node.data.conditions as condition}
              <div class="condition-editor">
                <div class="condition-editor-heading">
                  <strong>?{condition.order}</strong>
                  <button
                    type="button"
                    class="icon-danger-button small-x"
                    title="Borrar condición"
                    aria-label="Borrar condición"
                    onclick={() => onRemoveCondition(condition.id)}
                  >×</button>
                </div>
                <label class="compact-label">
                  Condiciones AND
                  <input
                    data-focus-key={`condition:${condition.id}:items`}
                    value={condition.items.join(', ')}
                    placeholder="avion, tren"
                    oninput={(event) => onUpdateConditionItems(condition.id, event.currentTarget.value)}
                  />
                </label>
                <label class="compact-label">
                  Destino
                  <DestinationPicker
                    value={condition.targetLabel ?? ''}
                    {availableNodeTitles}
                    focusKey={`condition:${condition.id}:target`}
                    onChange={(value) => onUpdateConditionTarget(condition.id, value)}
                  />
                </label>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </details>

    <details class="inspector-section" bind:open={optionsOpen}>
      <summary>
        <span>Opciones =</span>
        <small>{node.data.options.length}</small>
      </summary>
      <div class="inspector-section-body">
        <div class="section-inline-actions">
          <span>cada opción tiene su propia salida</span>
          <button type="button" class="small-button" onclick={addOptionAndFocus}>+ Opción</button>
        </div>

        {#if node.data.options.length === 0}
          <div class="empty-state">
            Sin opciones. Si añades una, el nodo pasa automáticamente a tipo <b>Opciones</b>.
          </div>
        {:else}
          <div class="option-editor-list">
            {#each node.data.options as option}
              <div class="option-editor">
                <div class="option-editor-main">
                  <input
                    data-focus-key={`option:${option.id}`}
                    value={option.text}
                    oninput={(event) => onUpdateOption(option.id, event.currentTarget.value)}
                  />
                  <button
                    type="button"
                    class="icon-danger-button"
                    title="Borrar opción"
                    aria-label="Borrar opción"
                    onclick={() => onRemoveOption(option.id)}
                  >×</button>
                </div>
                <label class="compact-label option-destination-editor">
                  Destino
                  <DestinationPicker
                    value={option.targetLabel ?? ''}
                    {availableNodeTitles}
                    focusKey={`option:${option.id}:target`}
                    onChange={(value) => onUpdateOptionTarget(option.id, value)}
                  />
                </label>

                <div class="option-inventory-editor">
                  <div class="option-inventory-heading">
                    <span>Inventario al elegir</span>
                    <button
                      type="button"
                      class="small-button inventory-add-button"
                      onclick={() => addOptionEffectAndFocus(option.id)}
                    >+ Efecto</button>
                  </div>

                  {#if option.effects.length === 0}
                    <div class="inventory-empty">Sin cambios de inventario.</div>
                  {:else}
                    <div class="inventory-effect-list">
                      {#each option.effects as effect}
                        <div class="inventory-effect-row">
                          <select
                            aria-label="Dar o quitar objeto"
                            value={effect.operation}
                            onchange={(event) => onUpdateOptionEffect(
                              option.id,
                              effect.id,
                              'operation',
                              event.currentTarget.value as InventoryEffectOperation
                            )}
                          >
                            <option value="add">Dar +</option>
                            <option value="remove">Quitar −</option>
                          </select>
                          <input
                            data-focus-key={`option:${option.id}:effect:${effect.id}:item`}
                            value={effect.item}
                            placeholder="objeto"
                            oninput={(event) => onUpdateOptionEffect(
                              option.id,
                              effect.id,
                              'item',
                              event.currentTarget.value
                            )}
                          />
                          <button
                            type="button"
                            class="icon-danger-button small-x"
                            title="Borrar efecto"
                            aria-label="Borrar efecto"
                            onclick={() => onRemoveOptionEffect(option.id, effect.id)}
                          >×</button>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </details>

    <!-- 083: eliminado panel explicativo de tipos -->
{:else}
    <!-- 070: estado sin selección -->
    <div class="inspector-create-state">
      <strong>Crear nodo</strong>

      <!-- 071: nodo arrastrable desde Inspector -->
      <div
        class="inspector-node-drag"
        draggable={true}
        ondragstart={startNewNodeDrag}
        title="Arrastra al lienzo para crear un nodo"
      >
        <span>▣ Nuevo nodo</span>
        <small>Arrastra al lienzo</small>
      </div>
    </div>
  {/if}
</div>


<style>
  .inspector-create-state {
    display: grid;
    gap: 7px;
    padding: 16px 14px;
    border: 1px dashed #cbd2df;
    border-radius: 9px;
    background: #f8fafc;
    color: #697386;
  }

  .inspector-create-state strong {
    color: #26344a;
    font-size: 14px;
  }

  .inspector-create-state > span {
    font-size: 11px;
    line-height: 1.45;
  }

  .inspector-node-drag {
    display: grid;
    gap: 3px;
    margin-top: 4px;
    padding: 12px 13px;
    border: 1px solid #b9c8dd;
    border-radius: 8px;
    background: #eef4fb;
    color: #35577e;
    cursor: grab;
    user-select: none;
  }

  .inspector-node-drag:active {
    cursor: grabbing;
  }

  .inspector-node-drag span {
    font-size: 12px;
    font-weight: 800;
  }

  .inspector-node-drag small {
    color: #6d7d91;
    font-size: 10px;
  }

  .option-destination-editor {
    margin-top: 8px;
  }

  .option-inventory-editor {
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid #e1e6ed;
  }

  .option-inventory-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 7px;
    color: #677388;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .inventory-add-button {
    padding: 4px 7px;
    font-size: 10px;
    text-transform: none;
  }

  .inventory-empty {
    color: #929baa;
    font-size: 10px;
  }

  .inventory-effect-list {
    display: grid;
    gap: 6px;
  }

  .inventory-effect-row {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr) 27px;
    gap: 6px;
    align-items: center;
  }

  .inventory-effect-row select,
  .inventory-effect-row input {
    min-width: 0;
    padding: 7px 8px;
    border: 1px solid #cbd2df;
    border-radius: 7px;
    background: #fff;
    color: #26344a;
    font-size: 11px;
  }
</style>
