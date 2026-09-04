<script lang="ts">
  import type { DialogueNode, InspectorRequest, InventoryEffectOperation } from './dialogueGraph';
  import DestinationPicker from './DestinationPicker.svelte';

  type Props = {
    node?: DialogueNode;
    request?: InspectorRequest | null;
    availableNodeTitles: string[];
    onUpdateNode: (field: 'title' | 'text', value: string) => void;
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
  let conditionsOpen = $state(false);
  let optionsOpen = $state(true);
  let lastNodeId = $state('');
  let lastRequestToken = $state(-1);

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
    if (section === 'conditions') conditionsOpen = true;
    if (section === 'options') optionsOpen = true;
  }

  function requestFocusKey(current: InspectorRequest) {
    if (current.section === 'name') return 'name';
    if (current.section === 'dialogue') return 'dialogue';
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

</script>

<div class="inspector-component" bind:this={root}>
  <div class="inspector-heading">
    <span>Inspector</span>
    <small>{node?.id ?? '—'}</small>
  </div>

  {#if node}
    <div class={`node-type-pill ${node.type}`}>
      {node.type === 'conditions' ? '? Nodo de Condiciones' : '▣ Nodo de Opciones'}
    </div>

    {#if node.data.initial}
      <div class="initial-info">▶ Nodo inicial · punto de entrada del diálogo · admite retornos</div>
    {/if}

    <details class="inspector-section" bind:open={nameOpen}>
      <summary>
        <span>Nombre</span>
        <small>{node.data.title}</small>
      </summary>
      <div class="inspector-section-body">
        <label class="inspector-field-label">
          Nombre del nodo
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

    <div class="info-box">
      El tipo no se guarda aparte: se deriva del guion. <b>Con opciones = Opciones.</b> Sin opciones pero con condiciones = <b>Condiciones</b>.
    </div>
  {/if}
</div>


<style>
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
