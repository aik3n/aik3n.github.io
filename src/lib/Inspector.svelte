<script lang="ts">
  import type { DialogueNode, InspectorRequest } from './dialogueGraph';

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
    if (current.section === 'options' && current.itemId) return `option:${current.itemId}`;
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

  let openDestinationConditionId = $state('');

  function toggleDestinationPicker(conditionId: string) {
    openDestinationConditionId = openDestinationConditionId === conditionId ? '' : conditionId;
  }

  function chooseDestination(conditionId: string, title: string) {
    onUpdateConditionTarget(conditionId, title);
    openDestinationConditionId = '';
    focusKey(`condition:${conditionId}:target`);
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
                  <div class="editable-combobox-wrap">
                    <div class="editable-combobox">
                      <input
                        data-focus-key={`condition:${condition.id}:target`}
                        value={condition.targetLabel ?? ''}
                        placeholder="Escribe o elige un nodo"
                        autocomplete="off"
                        oninput={(event) => onUpdateConditionTarget(condition.id, event.currentTarget.value)}
                      />
                      <button
                        type="button"
                        class="combobox-trigger"
                        class:open={openDestinationConditionId === condition.id}
                        title="Mostrar todos los nodos disponibles"
                        aria-label="Mostrar todos los nodos disponibles"
                        onclick={() => toggleDestinationPicker(condition.id)}
                      >▾</button>
                    </div>

                    {#if openDestinationConditionId === condition.id}
                      <div class="destination-menu" role="listbox" aria-label="Nodos disponibles">
                        {#if availableNodeTitles.length === 0}
                          <div class="destination-menu-empty">No hay nodos disponibles</div>
                        {:else}
                          {#each availableNodeTitles as title}
                            <button
                              type="button"
                              class:current={title === condition.targetLabel}
                              class="destination-menu-item"
                              onmousedown={(event) => event.preventDefault()}
                              onclick={() => chooseDestination(condition.id, title)}
                            >
                              <span>{title}</span>
                              {#if title === condition.targetLabel}<small>actual</small>{/if}
                            </button>
                          {/each}
                        {/if}
                      </div>
                    {/if}
                  </div>
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
                <div class="option-destination">
                  {#if option.targetLabel}→ {option.targetLabel}{:else}Sin conectar{/if}
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
