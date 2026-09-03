<script lang="ts">
  import {
    Background,
    Controls,
    SvelteFlow,
    addEdge,
    type Connection,
    type Edge,
    type NodeEventWithPointer
  } from '@xyflow/svelte';
  import DialogueNodeView, { type DialogueNode } from './lib/DialogueNode.svelte';
  import {
    parseDialogueText,
    serializeDialogueText,
    type ParsedScript
  } from './lib/dialogueText';

  const nodeTypes = {
    dialogue: DialogueNodeView
  };

  let nodes = $state.raw<DialogueNode[]>([
    {
      id: 'inicio',
      type: 'dialogue',
      position: { x: 180, y: 100 },
      data: {
        title: 'INICIO',
        text: 'Hola, aventurero.',
        initial: true,
        options: [
          {
            id: 'opt-inicio-1',
            text: 'Salir',
            targetId: 'final',
            targetLabel: 'FINAL'
          }
        ]
      }
    },
    {
      id: 'final',
      type: 'dialogue',
      position: { x: 520, y: 100 },
      data: {
        title: 'FINAL',
        text: 'Adiós.',
        options: []
      }
    }
  ]);

  let edges = $state.raw<Edge[]>([
    {
      id: 'inicio-salir-final',
      source: 'inicio',
      sourceHandle: 'opt-inicio-1',
      target: 'final',
      type: 'smoothstep'
    }
  ]);

  let selectedId = $state('inicio');
  let selectedEdgeId = $state('');
  let nextNodeNumber = $state(1);
  let nextOptionNumber = $state(1);
  let canvasElement = $state<HTMLElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let parsedScript = $state.raw<ParsedScript | null>(null);
  let currentFilename = $state('guion.txt');
  let sidebarMode = $state<'inspector' | 'txt'>('inspector');
  let statusMessage = $state('');

  let selectedNode = $derived(nodes.find((node) => node.id === selectedId));
  let selectedEdge = $derived(edges.find((edge) => edge.id === selectedEdgeId));
  let scriptText = $derived(
    serializeDialogueText(
      parsedScript,
      nodes.map((node) => ({
        id: node.id,
        title: node.data.title,
        text: node.data.text,
        options: node.data.options.map((option) => ({
          id: option.id,
          text: option.text,
          targetLabel: option.targetLabel
        }))
      }))
    )
  );

  function setConnectionHighlights(sourceId?: string, targetId?: string) {
    nodes = nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        connectionHighlight:
          node.id === sourceId && node.id === targetId
            ? 'both'
            : node.id === sourceId
              ? 'source'
              : node.id === targetId
                ? 'target'
                : undefined
      }
    }));
  }

  const selectNode: NodeEventWithPointer<MouseEvent | TouchEvent, DialogueNode> = ({ node }) => {
    selectedId = node.id;
    selectedEdgeId = '';
    setConnectionHighlights();
    sidebarMode = 'inspector';
  };

  function selectEdge({ edge }: { edge: Edge; event: MouseEvent }) {
    selectedEdgeId = edge.id;
    selectedId = edge.source;
    setConnectionHighlights(edge.source, edge.target);
    sidebarMode = 'inspector';
  }

  function deleteSelectedConnection() {
    const edge = selectedEdge;
    if (!edge) return;

    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    const option = sourceNode?.data.options.find((item) => item.id === edge.sourceHandle);

    edges = edges.filter((item) => item.id !== edge.id);

    nodes = nodes.map((node) => {
      if (node.id !== edge.source) return node;

      return {
        ...node,
        data: {
          ...node.data,
          options: node.data.options.map((item) =>
            item.id === edge.sourceHandle
              ? { ...item, targetId: undefined, targetLabel: undefined }
              : item
          )
        }
      };
    });

    selectedEdgeId = '';
    setConnectionHighlights();
    statusMessage = `Conexión borrada: ${option?.text ?? 'opción'} → ${targetNode?.data.title ?? 'destino'}`;
  }

  function updateSelected(field: 'title' | 'text', value: string) {
    nodes = nodes.map((node) => {
      const shouldRefreshTargetLabels = field === 'title' && node.data.options.some((option) => option.targetId === selectedId);

      if (node.id === selectedId) {
        return {
          ...node,
          data: {
            ...node.data,
            [field]: value,
            options: node.data.options.map((option) =>
              option.targetId === selectedId
                ? { ...option, targetLabel: value }
                : option
            )
          }
        };
      }

      if (shouldRefreshTargetLabels) {
        return {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((option) =>
              option.targetId === selectedId
                ? { ...option, targetLabel: value }
                : option
            )
          }
        };
      }

      return node;
    });
  }

  function createNodeAt(x: number, y: number) {
    const id = `node-${nextNodeNumber}`;
    const title = `NODO_${nextNodeNumber}`;

    const newNode: DialogueNode = {
      id,
      type: 'dialogue',
      position: { x, y },
      data: {
        title,
        text: 'Texto del PNJ.',
        options: []
      }
    };

    nodes = [...nodes, newNode];
    selectedId = id;
    sidebarMode = 'inspector';
    nextNodeNumber += 1;
  }

  function startPaletteDrag(event: DragEvent) {
    if (!event.dataTransfer) return;

    event.dataTransfer.setData('application/x-zemobida-node', 'dialogue');
    event.dataTransfer.effectAllowed = 'copy';
  }

  function allowCanvasDrop(event: DragEvent) {
    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function dropNodeOnCanvas(event: DragEvent) {
    event.preventDefault();

    if (!canvasElement || !event.dataTransfer) return;
    if (event.dataTransfer.getData('application/x-zemobida-node') !== 'dialogue') return;

    const rect = canvasElement.getBoundingClientRect();
    const x = Math.max(20, event.clientX - rect.left - 125);
    const y = Math.max(20, event.clientY - rect.top - 45);

    createNodeAt(x, y);
  }

  function addOption() {
    if (!selectedNode) return;

    const optionId = `opt-${nextOptionNumber}`;
    const optionText = `Opción ${nextOptionNumber}`;

    nodes = nodes.map((node) => {
      if (node.id !== selectedId) return node;

      return {
        ...node,
        data: {
          ...node.data,
          options: [
            ...node.data.options,
            {
              id: optionId,
              text: optionText
            }
          ]
        }
      };
    });

    nextOptionNumber += 1;
  }

  function updateOption(optionId: string, text: string) {
    nodes = nodes.map((node) => {
      if (node.id !== selectedId) return node;

      return {
        ...node,
        data: {
          ...node.data,
          options: node.data.options.map((option) =>
            option.id === optionId
              ? { ...option, text }
              : option
          )
        }
      };
    });
  }

  function removeOption(optionId: string) {
    if (!selectedNode) return;

    nodes = nodes.map((node) => {
      if (node.id !== selectedId) return node;

      return {
        ...node,
        data: {
          ...node.data,
          options: node.data.options.filter((option) => option.id !== optionId)
        }
      };
    });

    edges = edges.filter(
      (edge) => !(edge.source === selectedId && edge.sourceHandle === optionId)
    );
  }

  function rawReferenceToLoadedNode(nodeId: string) {
    if (!parsedScript) return false;

    const parsedNode = parsedScript.nodes.find((node) => node.id === nodeId);
    if (!parsedNode) return false;

    const label = parsedNode.originalTitle.toLowerCase();

    return parsedScript.nodes.some((node) =>
      node.tokens.some((token) => {
        if (token.kind !== 'raw') return false;
        const code = token.raw.split("'")[0];
        const destinations = [...code.matchAll(/>\s*([^\s\[]+)/g)];
        return destinations.some((match) => match[1].toLowerCase() === label);
      })
    );
  }

  function deleteSelectedNode() {
    const node = selectedNode;
    if (!node) return;

    if (node.data.initial) {
      statusMessage = 'El nodo inicial no se puede borrar.';
      return;
    }

    if (rawReferenceToLoadedNode(node.id)) {
      statusMessage = `No se puede borrar ${node.data.title}: hay una referencia ?/> que todavía no editamos visualmente.`;
      return;
    }

    const deletedId = node.id;
    nodes = nodes
      .filter((item) => item.id !== deletedId)
      .map((item) => ({
        ...item,
        data: {
          ...item.data,
          options: item.data.options.map((option) =>
            option.targetId === deletedId
              ? { ...option, targetId: undefined, targetLabel: undefined }
              : option
          )
        }
      }));

    edges = edges.filter((edge) => edge.source !== deletedId && edge.target !== deletedId);
    selectedId = nodes[0]?.id ?? '';
    statusMessage = `Nodo borrado: ${node.data.title}`;
  }

  function layoutDialogueNodes(items: DialogueNode[]) {
    if (items.length === 0) return items;

    const byId = new Map(items.map((node) => [node.id, node]));
    const depth = new Map<string, number>();
    const firstId = items[0].id;
    const queue: string[] = [firstId];
    depth.set(firstId, 0);

    while (queue.length > 0) {
      const id = queue.shift() as string;
      const node = byId.get(id);
      if (!node) continue;
      const nextDepth = (depth.get(id) ?? 0) + 1;

      for (const option of node.data.options) {
        const targetId = option.targetId;
        if (!targetId || targetId === firstId || depth.has(targetId)) continue;
        depth.set(targetId, nextDepth);
        queue.push(targetId);
      }
    }

    let maxDepth = Math.max(0, ...depth.values());
    for (const node of items) {
      if (!depth.has(node.id)) {
        maxDepth += 1;
        depth.set(node.id, maxDepth);
      }
    }

    const rowsByDepth = new Map<number, number>();

    return items.map((node) => {
      const column = depth.get(node.id) ?? 0;
      const row = rowsByDepth.get(column) ?? 0;
      rowsByDepth.set(column, row + 1);

      return {
        ...node,
        position: {
          x: 80 + column * 360,
          y: 80 + row * 330
        }
      };
    });
  }

  function connectOption(connection: Connection) {
    const source = connection.source;
    const target = connection.target;
    const optionId = connection.sourceHandle;

    if (!source || !target || !optionId) return;

    const targetNode = nodes.find((node) => node.id === target);
    if (!targetNode) return;

    selectedEdgeId = '';
    setConnectionHighlights();
    edges = edges.filter(
      (edge) => !(edge.source === source && edge.sourceHandle === optionId)
    );

    edges = addEdge(connection, edges).map((edge) =>
      edge.source === source && edge.sourceHandle === optionId
        ? { ...edge, type: 'smoothstep' }
        : edge
    );

    nodes = nodes.map((node) => {
      if (node.id !== source) return node;

      return {
        ...node,
        data: {
          ...node.data,
          options: node.data.options.map((option) =>
            option.id === optionId
              ? {
                  ...option,
                  targetId: target,
                  targetLabel: targetNode.data.title
                }
              : option
          )
        }
      };
    });
  }

  function openFilePicker() {
    fileInput?.click();
  }

  async function loadScriptFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = parseDialogueText(text, file.name);

    if (parsed.nodes.length === 0) {
      statusMessage = 'No he encontrado ningún nodo # en ese archivo.';
      input.value = '';
      return;
    }

    const idByLabel = new Map(
      parsed.nodes.map((node) => [node.title.toLowerCase(), node.id])
    );

    const loadedNodes = parsed.nodes.map((node, index) => ({
      id: node.id,
      type: 'dialogue' as const,
      position: { x: 0, y: 0 },
      data: {
        title: node.title,
        text: node.originalText,
        initial: index === 0,
        options: node.options.map((option) => ({
          id: option.id,
          text: option.text,
          targetId: option.targetLabel
            ? idByLabel.get(option.targetLabel.toLowerCase())
            : undefined,
          targetLabel: option.targetLabel
        }))
      }
    })) as DialogueNode[];

    nodes = layoutDialogueNodes(loadedNodes);
    edges = [];

    for (const node of nodes) {
      for (const option of node.data.options) {
        if (!option.targetId) continue;

        edges.push({
          id: `${node.id}-${option.id}-${option.targetId}`,
          source: node.id,
          sourceHandle: option.id,
          target: option.targetId,
          type: 'smoothstep'
        });
      }
    }

    parsedScript = parsed;
    selectedEdgeId = '';
    currentFilename = file.name;
    selectedId = nodes[0].id;
    nextNodeNumber = nodes.length + 1;
    nextOptionNumber = parsed.nodes.reduce((total, node) => total + node.options.length, 0) + 1;
    sidebarMode = 'txt';
    statusMessage = `Cargado: ${file.name}`;
    input.value = '';
  }

  function saveScript() {
    const blob = new Blob([scriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = currentFilename || 'guion.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    statusMessage = `Guardado: ${currentFilename || 'guion.txt'}`;
  }
</script>

<div class="app-shell">
  <header>
    <div class="brand-block">
      <strong>ZeMobida</strong>
      <span>{currentFilename}</span>
    </div>

    <div class="header-actions">
      {#if statusMessage}
        <span class="status-message">{statusMessage}</span>
      {/if}
      {#if selectedEdge}
        <button
          type="button"
          class="header-button danger"
          onclick={deleteSelectedConnection}
        >Borrar conexión</button>
      {/if}
      <button type="button" class="header-button" onclick={openFilePicker}>Abrir TXT</button>
      <button type="button" class="header-button primary" onclick={saveScript}>Guardar TXT</button>
      <input
        class="hidden-file-input"
        bind:this={fileInput}
        type="file"
        accept=".txt,text/plain"
        onchange={loadScriptFile}
      />
    </div>
  </header>

  <main>
    <section class="palette">
      <div class="palette-heading">Paleta</div>

      <div
        class="palette-node"
        draggable={true}
        ondragstart={startPaletteDrag}
      >
        <span class="palette-node-icon">▣</span>
        <div>
          <strong>Nodo</strong>
          <small>arrastrar</small>
        </div>
      </div>
    </section>

    <section
      class="canvas"
      bind:this={canvasElement}
      ondragover={allowCanvasDrop}
      ondrop={dropNodeOnCanvas}
    >
      <SvelteFlow
        bind:nodes
        bind:edges
        {nodeTypes}
        onnodeclick={selectNode}
        onedgeclick={selectEdge}
        onconnect={connectOption}
        fitView
        minZoom={0.4}
        maxZoom={1.8}
        nodesConnectable={true}
        deleteKey={null}
        connectionRadius={28}
      >
        <Background gap={20} size={1} />
        <Controls />
      </SvelteFlow>
    </section>

    <aside>
      <div class="sidebar-tabs">
        <button
          type="button"
          class:active={sidebarMode === 'inspector'}
          onclick={() => (sidebarMode = 'inspector')}
        >Inspector</button>
        <button
          type="button"
          class:active={sidebarMode === 'txt'}
          onclick={() => (sidebarMode = 'txt')}
        >TXT</button>
      </div>

      {#if sidebarMode === 'txt'}
        <div class="txt-heading">
          <div>
            <strong>Texto del guion</strong>
            <small>vista previa de lo que se guardará</small>
          </div>
        </div>
        <textarea class="script-preview" readonly value={scriptText}></textarea>
        <div class="info-box compact">
          En esta prueba, las líneas que aún no tienen editor visual —como <b>?</b>, <b>&gt;</b>, comentarios y efectos— se conservan al cargar y guardar. Todavía no se dibujan como conexiones propias.
        </div>
      {:else}
        <div class="inspector-heading">
          <span>Inspector</span>
          <small>{selectedNode?.id ?? '—'}</small>
        </div>

        {#if selectedNode}
          {#if selectedNode.data.initial}
            <div class="initial-info">▶ Nodo inicial · punto de entrada del diálogo · admite retornos</div>
          {/if}

          <div class="node-actions">
            <button
              type="button"
              class="danger-button"
              onclick={deleteSelectedNode}
              disabled={selectedNode.data.initial}
            >Borrar nodo</button>
          </div>

          <label>
            Nombre del nodo
            <input
              value={selectedNode.data.title}
              oninput={(event) => updateSelected('title', event.currentTarget.value)}
            />
          </label>

          <label>
            Texto del PNJ
            <textarea
              rows="6"
              value={selectedNode.data.text}
              oninput={(event) => updateSelected('text', event.currentTarget.value)}
            ></textarea>
          </label>

          <div class="section-heading">
            <div>
              <strong>Opciones =</strong>
              <small>cada opción tiene su propia salida</small>
            </div>
            <button type="button" class="small-button" onclick={addOption}>+ Opción</button>
          </div>

          {#if selectedNode.data.options.length === 0}
            <div class="empty-state">Este nodo todavía no tiene opciones.</div>
          {:else}
            <div class="option-editor-list">
              {#each selectedNode.data.options as option}
                <div class="option-editor">
                  <div class="option-editor-main">
                    <input
                      value={option.text}
                      oninput={(event) => updateOption(option.id, event.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="icon-danger-button"
                      title="Borrar opción"
                      aria-label="Borrar opción"
                      onclick={() => removeOption(option.id)}
                    >×</button>
                  </div>
                  <div class="option-destination">
                    {#if option.targetLabel}
                      → {option.targetLabel}
                    {:else}
                      Sin conectar
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <div class="info-box">
            Puedes borrar opciones y nodos. El nodo inicial no se borra y ahora admite conexiones de retorno. Si un nodo tiene referencias <b>?/&gt;</b> todavía no visuales, el editor evita borrarlo para no romper el TXT.
          </div>
        {/if}
      {/if}
    </aside>
  </main>
</div>
