<script lang="ts">
  import { onMount } from 'svelte';

  type GithubScript = {
    name: string;
    path: string;
    sha: string;
    type: string;
    download_url: string | null;
  };

  const LIST_URL = 'https://api.github.com/repos/aik3n/ZeMobida_guiones/contents?ref=main';

  let open = $state(false);
  let loadingList = $state(false);
  let openingName = $state('');
  let error = $state('');
  let scripts = $state.raw<GithubScript[]>([]);
  let triggerButton: HTMLButtonElement | null = null;

  async function fetchScripts(force = false) {
    open = true;
    error = '';

    if (scripts.length > 0 && !force) return;

    loadingList = true;
    try {
      const response = await fetch(LIST_URL, {
        headers: {
          Accept: 'application/vnd.github+json'
        }
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          throw new Error('GitHub ha limitado temporalmente las consultas. Prueba de nuevo más tarde.');
        }
        throw new Error(`No se pudo obtener la lista de guiones (${response.status}).`);
      }

      const data = await response.json() as GithubScript[];
      scripts = data
        .filter((item) => item.type === 'file' && item.name.toLowerCase().endsWith('.txt'))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'No se pudo obtener la lista de guiones.';
    } finally {
      loadingList = false;
    }
  }

  async function openScript(script: GithubScript) {
    if (!script.download_url || openingName) return;

    openingName = script.name;
    error = '';

    try {
      const response = await fetch(script.download_url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`No se pudo abrir ${script.name} (${response.status}).`);
      }

      const text = await response.text();
      const input = document.querySelector('.hidden-file-input') as HTMLInputElement | null;

      if (!input) {
        throw new Error('ZeNode no encuentra el selector interno de archivos.');
      }

      const file = new File([text], script.name, {
        type: 'text/plain;charset=utf-8'
      });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;

      sessionStorage.setItem('zenode:github-source', JSON.stringify({
        repository: 'aik3n/ZeMobida_guiones',
        branch: 'main',
        path: script.path,
        sha: script.sha
      }));

      input.dispatchEvent(new Event('change', { bubbles: true }));
      open = false;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : `No se pudo abrir ${script.name}.`;
    } finally {
      openingName = '';
    }
  }

  function close() {
    if (!openingName) open = false;
  }

  onMount(() => {
    const actions = document.querySelector('.header-actions');
    if (!actions) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'header-button';
    button.textContent = 'Abrir guiones';
    button.title = 'Abrir un guion del repositorio oficial';
    button.addEventListener('click', () => void fetchScripts());

    const localOpenButton = Array.from(actions.querySelectorAll('button'))
      .find((item) => item.textContent?.trim() === 'Abrir TXT');

    actions.insertBefore(button, localOpenButton ?? null);
    triggerButton = button;

    return () => {
      button.remove();
      triggerButton = null;
    };
  });
</script>

{#if open}
  <div
    class="github-picker-backdrop"
    role="presentation"
    onclick={(event) => {
      if (event.currentTarget === event.target) close();
    }}
  >
    <section
      class="github-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="github-picker-title"
    >
      <div class="github-picker-heading">
        <div>
          <strong id="github-picker-title">Guiones disponibles</strong>
          <small>ZeMobida</small>
        </div>
        <button
          type="button"
          class="github-picker-close"
          aria-label="Cerrar"
          title="Cerrar"
          onclick={close}
          disabled={Boolean(openingName)}
        >×</button>
      </div>

      {#if loadingList}
        <div class="github-picker-state">Cargando guiones…</div>
      {:else if error}
        <div class="github-picker-error">{error}</div>
        <button type="button" class="github-picker-retry" onclick={() => fetchScripts(true)}>
          Reintentar
        </button>
      {:else if scripts.length === 0}
        <div class="github-picker-state">No hay guiones .txt disponibles.</div>
      {:else}
        <div class="github-script-list">
          {#each scripts as script}
            <button
              type="button"
              class="github-script-row"
              onclick={() => openScript(script)}
              disabled={Boolean(openingName)}
            >
              <span>{script.name}</span>
              <small>{openingName === script.name ? 'Abriendo…' : 'Abrir'}</small>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .github-picker-backdrop {
    position: fixed;
    z-index: 10000;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(15 23 42 / 48%);
  }

  .github-picker {
    width: min(520px, 100%);
    max-height: min(680px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 24px 70px rgb(15 23 42 / 28%);
  }

  .github-picker-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px;
    border-bottom: 1px solid #e2e8f0;
  }

  .github-picker-heading strong {
    display: block;
    color: #1e293b;
    font-size: 16px;
  }

  .github-picker-heading small {
    display: block;
    margin-top: 2px;
    color: #7b8497;
    font-size: 11px;
  }

  .github-picker-close {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 7px;
    background: #f1f5f9;
    color: #475569;
    cursor: pointer;
    font-size: 21px;
    line-height: 1;
  }

  .github-picker-close:hover:not(:disabled) {
    background: #e2e8f0;
  }

  .github-picker-close:disabled {
    opacity: .45;
    cursor: default;
  }

  .github-script-list {
    max-height: min(560px, calc(100vh - 150px));
    overflow-y: auto;
  }

  .github-script-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    border: 0;
    border-bottom: 1px solid #edf0f4;
    padding: 12px 18px;
    background: #fff;
    color: #26344a;
    cursor: pointer;
    text-align: left;
  }

  .github-script-row:last-child {
    border-bottom: 0;
  }

  .github-script-row:hover:not(:disabled) {
    background: #f4f8fc;
  }

  .github-script-row:disabled {
    cursor: default;
  }

  .github-script-row span {
    font-size: 13px;
    font-weight: 700;
  }

  .github-script-row small {
    color: #64748b;
    font-size: 11px;
    font-weight: 650;
  }

  .github-picker-state,
  .github-picker-error {
    padding: 28px 18px;
    text-align: center;
    font-size: 13px;
  }

  .github-picker-state {
    color: #64748b;
  }

  .github-picker-error {
    padding-bottom: 12px;
    color: #9b3333;
  }

  .github-picker-retry {
    display: block;
    margin: 0 auto 20px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    padding: 7px 12px;
    background: #f8fafc;
    color: #334155;
    cursor: pointer;
    font-weight: 700;
  }

  .github-picker-retry:hover {
    background: #eef2f7;
  }
</style>
