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
      type: 'default',
      data: { lane: 0 }
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

    edges = routeEdges(edges.filter((item) => item.id !== edge.id));

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

    edges = routeEdges(edges.filter(
      (edge) => !(edge.source === selectedId && edge.sourceHandle === optionId)
    ));
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

    edges = routeEdges(edges.filter((edge) => edge.source !== deletedId && edge.target !== deletedId), nodes);
    selectedId = nodes[0]?.id ?? '';
    statusMessage = `Nodo borrado: ${node.data.title}`;
  }

  function estimatedNodeHeight(node: DialogueNode) {
    return 145 + Math.max(1, node.data.options.length) * 34;
  }

  function layoutDialogueNodes(items: DialogueNode[]) {
    if (items.length === 0) return items;

    const NODE_WIDTH = 260;
    const SIBLING_GAP = 110;
    const ROOT_GAP = 180;
    const VERTICAL_GAP = 150;

    const byId = new Map(items.map((node) => [node.id, node]));
    const originalIndex = new Map(items.map((node, index) => [node.id, index]));
    const depth = new Map<string, number>();
    const children = new Map<string, string[]>();
    const primaryParent = new Map<string, string>();
    const roots: string[] = [];

    function orderedTargets(node: DialogueNode) {
      const seen = new Set<string>();
      const result: string[] = [];

      for (const option of node.data.options) {
        const targetId = option.targetId;
        if (!targetId || targetId === node.id || !byId.has(targetId) || seen.has(targetId)) continue;
        seen.add(targetId);
        result.push(targetId);
      }

      return result;
    }

    function buildTree(rootId: string, baseDepth: number) {
      const queue: string[] = [rootId];
      depth.set(rootId, baseDepth);
      roots.push(rootId);

      while (queue.length > 0) {
        const id = queue.shift() as string;
        const node = byId.get(id);
        if (!node) continue;

        const nextDepth = (depth.get(id) ?? baseDepth) + 1;
        const ownChildren: string[] = [];

        // IMPORTANTE: recorremos las opciones en su orden real.
        // El primer puerto reclama el primer hijo, el segundo el siguiente, etc.
        for (const targetId of orderedTargets(node)) {
          if (depth.has(targetId)) continue;

          depth.set(targetId, nextDepth);
          primaryParent.set(targetId, id);
          ownChildren.push(targetId);
          queue.push(targetId);
        }

        children.set(id, ownChildren);
      }
    }

    const firstId = items[0].id;
    buildTree(firstId, 0);

    const mainMaxDepth = Math.max(0, ...depth.values());
    const disconnectedBaseDepth = mainMaxDepth + 1;

    // Los nodos que no pertenecen al flujo principal se conservan como árboles separados,
    // manteniendo el orden físico original del guion.
    const remaining = [...items]
      .filter((node) => !depth.has(node.id))
      .sort((a, b) => (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0));

    for (const node of remaining) {
      if (!depth.has(node.id)) {
        buildTree(node.id, disconnectedBaseDepth);
      }
    }

    const widthCache = new Map<string, number>();

    function subtreeWidth(id: string): number {
      const cached = widthCache.get(id);
      if (cached !== undefined) return cached;

      const ownChildren = children.get(id) ?? [];
      if (ownChildren.length === 0) {
        widthCache.set(id, NODE_WIDTH);
        return NODE_WIDTH;
      }

      const childrenWidth = ownChildren.reduce((sum, childId) => sum + subtreeWidth(childId), 0)
        + Math.max(0, ownChildren.length - 1) * SIBLING_GAP;
      const width = Math.max(NODE_WIDTH, childrenWidth);
      widthCache.set(id, width);
      return width;
    }

    const levelHeights = new Map<number, number>();
    for (const node of items) {
      const level = depth.get(node.id) ?? 0;
      levelHeights.set(level, Math.max(levelHeights.get(level) ?? 0, estimatedNodeHeight(node)));
    }

    const maxDepth = Math.max(0, ...depth.values());
    const levelY = new Map<number, number>();
    let nextY = 80;

    for (let level = 0; level <= maxDepth; level += 1) {
      levelY.set(level, nextY);
      nextY += (levelHeights.get(level) ?? 145) + VERTICAL_GAP;
    }

    const positions = new Map<string, { x: number; y: number }>();

    function placeTree(id: string, left: number) {
      const treeWidth = subtreeWidth(id);
      const level = depth.get(id) ?? 0;
      positions.set(id, {
        x: left + (treeWidth - NODE_WIDTH) / 2,
        y: levelY.get(level) ?? 80
      });

      const ownChildren = children.get(id) ?? [];
      if (ownChildren.length === 0) return;

      const totalChildrenWidth = ownChildren.reduce((sum, childId) => sum + subtreeWidth(childId), 0)
        + Math.max(0, ownChildren.length - 1) * SIBLING_GAP;
      let childLeft = left + (treeWidth - totalChildrenWidth) / 2;

      for (const childId of ownChildren) {
        placeTree(childId, childLeft);
        childLeft += subtreeWidth(childId) + SIBLING_GAP;
      }
    }

    let rootLeft = 80;
    for (const rootId of roots) {
      placeTree(rootId, rootLeft);
      rootLeft += subtreeWidth(rootId) + ROOT_GAP;
    }

    return items.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position
    }));
  }

  function routeEdges(items: Edge[], currentNodes = nodes) {
    const byId = new Map(currentNodes.map((node) => [node.id, node]));
    let forwardLane = 0;
    let returnLane = 0;

    return items.map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      const isReturn = Boolean(source && target && target.position.y <= source.position.y);
      const lane = isReturn ? returnLane++ : forwardLane++;

      return {
        ...edge,
        type: 'default',
        data: {
          ...(edge.data ?? {}),
          lane
        }
      };
    });
  }

  function organizeGraph() {
    nodes = layoutDialogueNodes(nodes);
    edges = routeEdges(edges, nodes);
    selectedEdgeId = '';
    setConnectionHighlights();
    statusMessage = 'Grafo ordenado';
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

    edges = routeEdges(
      addEdge({ ...connection, type: 'default' }, edges),
      nodes
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
          type: 'default',
      data: { lane: 0 }
        });
      }
    }

    edges = routeEdges(edges, nodes);

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
      <button
        type="button"
        class="header-button danger"
        onclick={deleteSelectedNode}
        disabled={!selectedNode || Boolean(selectedEdge) || selectedNode.data.initial || rawReferenceToLoadedNode(selectedNode.id)}
      >Borrar nodo</button>
      <button
        type="button"
        class="header-button danger"
        onclick={deleteSelectedConnection}
        disabled={!selectedEdge}
      >Borrar conexión</button>
      <button type="button" class="header-button" onclick={organizeGraph}>Ordenar</button>
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
