<script lang="ts">
  type Props = {
    value?: string;
    availableNodeTitles: string[];
    focusKey: string;
    onChange: (value: string) => void;
  };

  let {
    value = '',
    availableNodeTitles,
    focusKey,
    onChange
  }: Props = $props();

  let open = $state(false);
  let input = $state<HTMLInputElement | null>(null);

  function togglePicker() {
    open = !open;
  }

  function choose(title: string) {
    onChange(title);
    open = false;
    queueMicrotask(() => {
      input?.focus();
      input?.select();
    });
  }
</script>

<div class="editable-combobox-wrap">
  <div class="editable-combobox">
    <input
      bind:this={input}
      data-focus-key={focusKey}
      {value}
      placeholder="Escribe o elige un nodo"
      autocomplete="off"
      oninput={(event) => onChange(event.currentTarget.value)}
    />
    <button
      type="button"
      class="combobox-trigger"
      class:open
      title="Mostrar todos los nodos disponibles"
      aria-label="Mostrar todos los nodos disponibles"
      onclick={togglePicker}
    >▾</button>
  </div>

  {#if open}
    <div class="destination-menu" role="listbox" aria-label="Nodos disponibles">
      {#if availableNodeTitles.length === 0}
        <div class="destination-menu-empty">No hay nodos disponibles</div>
      {:else}
        {#each availableNodeTitles as title}
          <button
            type="button"
            class:current={title === value}
            class="destination-menu-item"
            onmousedown={(event) => event.preventDefault()}
            onclick={() => choose(title)}
          >
            <span>{title}</span>
            {#if title === value}<small>actual</small>{/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>
