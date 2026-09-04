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
  import OptionsNodeView from './lib/DialogueNode.svelte';
  import ConditionsNodeView from './lib/ConditionsNode.svelte';
  import InspectorView from './lib/Inspector.svelte';
  import ViewportActions from './lib/ViewportActions.svelte';
  import {
    classifyNodeType,
    refreshNodeType,
    refreshNodeTypes,
    type DialogueNode,
    type InspectorRequest,
    type NodeEditIntent,
    type VisualNodeKind
  } from './lib/dialogueGraph';
  import {
    parseDialogueText,
    serializeDialogueText,
    type ParsedScript
  } from './lib/dialogueText';
  import { layoutDialogueNodes, routeEdges } from './lib/graphLayout';

  const nodeTypes = {
    options: OptionsNodeView,
    conditions: ConditionsNodeView
  };

  let nodes = $state.raw<DialogueNode[]>([
    {
      id: 'inicio',
      type: 'options',
      position: { x: 180, y: 100 },
      data: {
        title: 'INICIO',
        text: 'Hola, aventurero.',
        initial: true,
        editorSelected: true,
        conditions: [],
        onConditionTargetClick: toggleConditionJump,
        onInspectorNavigate: navigateInspector,
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
      type: 'options',
      position: { x: 520, y: 100 },
      data: {
        title: 'FINAL',
        text: 'Adiós.',
        conditions: [],
        onConditionTargetClick: toggleConditionJump,
        onInspectorNavigate: navigateInspector,
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
      data: { role: 'option', lane: 0 }
    }
  ]);

  let selectedId = $state('inicio');
  let selectedEdgeId = $state('');
  let nextNodeNumber = $state(1);
  let nextOptionNumber = $state(1);
  let nextConditionNumber = $state(1);
  let canvasElement = $state<HTMLElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let parsedScript = $state.raw<ParsedScript | null>(null);
  let currentFilename = $state('guion.txt');
  let sidebarMode = $state<'inspector' | 'txt'>('inspector');
  let statusMessage = $state('');
  let showAllConditionJumps = $state(false);
  let inspectorRequest = $state.raw<InspectorRequest | null>(null);
  let inspectorRequestToken = $state(0);
  let centerRequestToken = $state(0);

  let selectedNode = $derived(nodes.find((node) => node.id === selectedId));
  let selectedEdge = $derived(edges.find((edge) => edge.id === selectedEdgeId));

  function setSelectedNodeId(nodeId: string) {
    selectedId = nodeId;
    nodes = nodes.map((node) => {
      const shouldBeSelected = Boolean(nodeId) && node.id === nodeId;
      if (Boolean(node.data.editorSelected) === shouldBeSelected) return node;

      return {
        ...node,
        data: {
          ...node.data,
          editorSelected: shouldBeSelected ? true : undefined
        }
      };
    });
  }
  let availableNodeTitles = $derived(
    nodes
      .map((node) => node.data.title.trim())
      .filter((title, index, all) => title && all.indexOf(title) === index)
  );
  let scriptText = $derived(
    serializeDialogueText(
      parsedScript,
      nodes.map((node) => ({
        id: node.id,
        title: node.data.title,
        text: node.data.text,
        conditions: node.data.conditions.map((condition) => ({
          id: condition.id,
          items: condition.items,
          targetLabel: condition.targetLabel
        })),
        options: node.data.options.map((option) => ({
          id: option.id,
          text: option.text,
          targetLabel: option.targetLabel
        }))
      }))
    )
  );

  function selectedEdgeIsEditable() {
    return selectedEdge?.data?.role === 'option';
  }

  function resolveTargetId(label?: string) {
    const normalized = label?.trim().toLowerCase();
    if (!normalized) return undefined;
    return nodes.find((node) => node.data.title.toLowerCase() === normalized)?.id;
  }

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

  function conditionPreviewEdge(sourceId: string, conditionId: string, targetId: string): Edge {
    return {
      id: `condition-preview-${sourceId}-${conditionId}`,
      source: sourceId,
      sourceHandle: conditionId,
      target: targetId,
      type: 'default',
      selectable: false,
      deletable: false,
      focusable: false,
      class: 'condition-preview-edge',
      data: { role: 'condition-preview', lane: 0 }
    };
  }

  function refreshConditionPreviews() {
    const optionEdges = edges.filter((edge) => edge.data?.role !== 'condition-preview');

    if (!showAllConditionJumps) {
      edges = optionEdges;
      return;
    }

    const previews: Edge[] = [];
    for (const node of nodes) {
      for (const condition of node.data.conditions) {
        if (!condition.targetId) continue;
        previews.push(conditionPreviewEdge(node.id, condition.id, condition.targetId));
      }
    }

    edges = routeEdges([...optionEdges, ...previews], nodes);
  }

  function clearConditionPreview() {
    if (!showAllConditionJumps) {
      edges = edges.filter((edge) => edge.data?.role !== 'condition-preview');
    }
    setConnectionHighlights();
  }

  function toggleAllConditionJumps() {
    showAllConditionJumps = !showAllConditionJumps;
    refreshConditionPreviews();
    selectedEdgeId = '';
    setConnectionHighlights();

    if (showAllConditionJumps) {
      const visibleCount = edges.filter((edge) => edge.data?.role === 'condition-preview').length;
      statusMessage = visibleCount
        ? `Mostrando ${visibleCount} conexión${visibleCount === 1 ? '' : 'es'} de condición`
        : 'No hay condiciones con destino válido.';
    } else {
      statusMessage = 'Conexiones de condiciones ocultas';
    }
  }

  function toggleConditionJump(sourceId: string, conditionId: string) {
    const previewId = `condition-preview-${sourceId}-${conditionId}`;
    const sourceNode = nodes.find((node) => node.id === sourceId);
    const condition = sourceNode?.data.conditions.find((item) => item.id === conditionId);

    if (!sourceNode || !condition?.targetId) {
      setConnectionHighlights();
      statusMessage = condition?.targetLabel
        ? `Destino no encontrado: ${condition.targetLabel}`
        : 'Esta condición todavía no tiene destino.';
      return;
    }

    if (showAllConditionJumps) {
      setSelectedNodeId(sourceId);
      selectedEdgeId = '';
      setConnectionHighlights(sourceId, condition.targetId);
      sidebarMode = 'inspector';
      statusMessage = `Condición ?${condition.order} → ${condition.targetLabel}`;
      return;
    }

    const wasVisible = edges.some((edge) => edge.id === previewId);
    edges = edges.filter((edge) => edge.data?.role !== 'condition-preview');

    if (wasVisible) {
      setConnectionHighlights();
      statusMessage = '';
      return;
    }

    edges = routeEdges([
      ...edges,
      conditionPreviewEdge(sourceId, conditionId, condition.targetId)
    ], nodes);

    setSelectedNodeId(sourceId);
    selectedEdgeId = '';
    setConnectionHighlights(sourceId, condition.targetId);
    sidebarMode = 'inspector';
    statusMessage = `Condición ?${condition.order} → ${condition.targetLabel}`;
  }

  function navigateInspector(nodeId: string, intent: NodeEditIntent) {
    clearConditionPreview();
    setSelectedNodeId(nodeId);
    selectedEdgeId = '';
    sidebarMode = 'inspector';
    inspectorRequestToken += 1;
    inspectorRequest = {
      nodeId,
      token: inspectorRequestToken,
      ...intent
    };
  }

  const selectNode: NodeEventWithPointer<MouseEvent | TouchEvent, DialogueNode> = ({ node }) => {
    clearConditionPreview();
    setSelectedNodeId(node.id);
    selectedEdgeId = '';
    sidebarMode = 'inspector';
  };

  function selectEdge({ edge }: { edge: Edge; event: MouseEvent }) {
    if (edge.data?.role === 'condition-preview') return;
    clearConditionPreview();
    selectedEdgeId = edge.id;
    setSelectedNodeId(edge.source);
    setConnectionHighlights(edge.source, edge.target);
    sidebarMode = 'inspector';
  }

  function updateSelected(field: 'title' | 'text', value: string) {
    nodes = nodes.map((node) => {
      const options = node.data.options.map((option) =>
        field === 'title' && option.targetId === selectedId
          ? { ...option, targetLabel: value }
          : option
      );
      const conditions = node.data.conditions.map((condition) =>
        field === 'title' && condition.targetId === selectedId
          ? { ...condition, targetLabel: value }
          : condition
      );

      return refreshNodeType({
        ...node,
        data: {
          ...node.data,
          ...(node.id === selectedId ? { [field]: value } : {}),
          options,
          conditions
        }
      });
    });
  }

  function createNodeAt(x: number, y: number, kind: VisualNodeKind) {
    const id = `node-${nextNodeNumber}`;
    const isConditions = kind === 'conditions';

    const newNode: DialogueNode = {
      id,
      type: kind,
      position: { x, y },
      data: {
        title: isConditions ? `CONDICION_${nextNodeNumber}` : `NODO_${nextNodeNumber}`,
        text: isConditions ? '' : 'Texto del PNJ.',
        conditions: isConditions
          ? [{
              id: `cond-${nextConditionNumber}`,
              order: 1,
              items: ['condicion']
            }]
          : [],
        onConditionTargetClick: toggleConditionJump,
        onInspectorNavigate: navigateInspector,
        options: []
      }
    };

    nodes = [...nodes, newNode];
    setSelectedNodeId(id);
    selectedEdgeId = '';
    sidebarMode = 'inspector';
    nextNodeNumber += 1;
    if (isConditions) nextConditionNumber += 1;
    statusMessage = isConditions
      ? 'Nodo de condiciones creado. Completa condición y destino en el inspector.'
      : 'Nodo de opciones creado.';
  }

  function startPaletteDrag(event: DragEvent, kind: VisualNodeKind) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('application/x-zemobida-node', kind);
    event.dataTransfer.effectAllowed = 'copy';
  }

  function allowCanvasDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function dropNodeOnCanvas(event: DragEvent) {
    event.preventDefault();
    if (!canvasElement || !event.dataTransfer) return;

    const kind = event.dataTransfer.getData('application/x-zemobida-node') as VisualNodeKind;
    if (kind !== 'options' && kind !== 'conditions') return;

    const rect = canvasElement.getBoundingClientRect();
    const x = Math.max(20, event.clientX - rect.left - 125);
    const y = Math.max(20, event.clientY - rect.top - 45);
    createNodeAt(x, y, kind);
  }

  function addOption(): string | undefined {
    if (!selectedNode) return undefined;
    const optionId = `opt-${nextOptionNumber}`;

    nodes = refreshNodeTypes(nodes.map((node) => {
      if (node.id !== selectedId) return node;
      return {
        ...node,
        data: {
          ...node.data,
          options: [...node.data.options, { id: optionId, text: `Opción ${nextOptionNumber}` }]
        }
      };
    }));

    nextOptionNumber += 1;
    return optionId;
  }

  function updateOption(optionId: string, text: string) {
    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((option) => option.id === optionId ? { ...option, text } : option)
          }
        }
    );
  }

  function removeOption(optionId: string) {
    if (!selectedNode) return;

    nodes = refreshNodeTypes(nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.filter((option) => option.id !== optionId)
          }
        }
    ));

    edges = routeEdges(edges.filter(
      (edge) => !(edge.source === selectedId && edge.sourceHandle === optionId)
    ), nodes);
  }

  function addCondition(): string | undefined {
    if (!selectedNode) return undefined;

    const conditionId = `cond-${nextConditionNumber}`;
    nodes = refreshNodeTypes(nodes.map((node) => {
      if (node.id !== selectedId) return node;
      return {
        ...node,
        data: {
          ...node.data,
          conditions: [
            ...node.data.conditions,
            {
              id: conditionId,
              order: node.data.conditions.length + 1,
              items: ['condicion']
            }
          ]
        }
      };
    }));
    nextConditionNumber += 1;
    return conditionId;
  }

  function updateConditionItems(conditionId: string, value: string) {
    const items = value
      .split(/[\s,]+/)
      .map((item) => item.trim().replace(/^\?/, ''))
      .filter(Boolean);

    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            conditions: node.data.conditions.map((condition) =>
              condition.id === conditionId ? { ...condition, items } : condition
            )
          }
        }
    );
  }

  function updateConditionTarget(conditionId: string, value: string) {
    const targetLabel = value.trim();
    const targetId = resolveTargetId(targetLabel);

    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            conditions: node.data.conditions.map((condition) =>
              condition.id === conditionId
                ? { ...condition, targetLabel: targetLabel || undefined, targetId }
                : condition
            )
          }
        }
    );
    if (showAllConditionJumps) refreshConditionPreviews();
    else clearConditionPreview();
  }

  function removeCondition(conditionId: string) {
    if (!selectedNode) return;

    nodes = refreshNodeTypes(nodes.map((node) => {
      if (node.id !== selectedId) return node;
      const conditions = node.data.conditions
        .filter((condition) => condition.id !== conditionId)
        .map((condition, index) => ({ ...condition, order: index + 1 }));
      return { ...node, data: { ...node.data, conditions } };
    }));
    if (showAllConditionJumps) refreshConditionPreviews();
    else clearConditionPreview();
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

  function conditionReferencesTarget(nodeId: string) {
    return nodes.some((node) => node.data.conditions.some((condition) => condition.targetId === nodeId));
  }

  function deleteSelectedNode() {
    const node = selectedNode;
    if (!node) return;

    if (node.data.initial) {
      statusMessage = 'El nodo inicial no se puede borrar.';
      return;
    }
    if (conditionReferencesTarget(node.id)) {
      statusMessage = `No se puede borrar ${node.data.title}: una condición salta a este nodo.`;
      return;
    }
    if (rawReferenceToLoadedNode(node.id)) {
      statusMessage = `No se puede borrar ${node.data.title}: existe un salto > todavía no visual.`;
      return;
    }

    const deletedId = node.id;
    nodes = refreshNodeTypes(nodes
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
      }))
    );

    edges = routeEdges(edges.filter((edge) => edge.source !== deletedId && edge.target !== deletedId), nodes);
    setSelectedNodeId(nodes[0]?.id ?? '');
    selectedEdgeId = '';
    statusMessage = `Nodo borrado: ${node.data.title}`;
  }

  function deleteSelectedConnection() {
    const edge = selectedEdge;
    if (!edge || edge.data?.role !== 'option') return;

    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    const option = sourceNode?.data.options.find((item) => item.id === edge.sourceHandle);

    edges = routeEdges(edges.filter((item) => item.id !== edge.id), nodes);
    nodes = nodes.map((node) => node.id !== edge.source
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((item) =>
              item.id === edge.sourceHandle
                ? { ...item, targetId: undefined, targetLabel: undefined }
                : item
            )
          }
        }
    );

    selectedEdgeId = '';
    setConnectionHighlights();
    statusMessage = `Conexión borrada: ${option?.text ?? 'opción'} → ${targetNode?.data.title ?? 'destino'}`;
  }

  function organizeGraph() {
    clearConditionPreview();
    nodes = layoutDialogueNodes(nodes);
    edges = routeEdges(edges, nodes);
    selectedEdgeId = '';
    setConnectionHighlights();
    statusMessage = 'Grafo ordenado';
  }

  function centerGraph() {
    centerRequestToken += 1;
    statusMessage = 'Vista centrada';
  }

  function connectOption(connection: Connection) {
    const source = connection.source;
    const target = connection.target;
    const optionId = connection.sourceHandle;
    if (!source || !target || !optionId) return;

    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);
    const option = sourceNode?.data.options.find((item) => item.id === optionId);
    if (!sourceNode || !targetNode || !option) return;

    clearConditionPreview();
    edges = edges.filter((edge) => !(edge.source === source && edge.sourceHandle === optionId));
    edges = routeEdges(addEdge({ ...connection, type: 'default', data: { role: 'option' } }, edges), nodes);

    nodes = nodes.map((node) => node.id !== source
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((item) =>
              item.id === optionId
                ? { ...item, targetId: target, targetLabel: targetNode.data.title }
                : item
            )
          }
        }
    );
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

    const idByLabel = new Map(parsed.nodes.map((node) => [node.title.toLowerCase(), node.id]));
    const loadedNodes = parsed.nodes.map((node, index) => {
      const data = {
        title: node.title,
        text: node.originalText,
        initial: index === 0,
        onConditionTargetClick: toggleConditionJump,
        onInspectorNavigate: navigateInspector,
        conditions: node.conditions.map((condition, conditionIndex) => ({
          id: condition.id,
          order: conditionIndex + 1,
          items: condition.items,
          targetId: condition.targetLabel
            ? idByLabel.get(condition.targetLabel.toLowerCase())
            : undefined,
          targetLabel: condition.targetLabel
        })),
        options: node.options.map((option) => ({
          id: option.id,
          text: option.text,
          targetId: option.targetLabel
            ? idByLabel.get(option.targetLabel.toLowerCase())
            : undefined,
          targetLabel: option.targetLabel
        }))
      };

      return {
        id: node.id,
        type: classifyNodeType(data),
        position: { x: 0, y: 0 },
        data
      } as DialogueNode;
    });

    showAllConditionJumps = false;
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
          data: { role: 'option', lane: 0 }
        });
      }
    }
    edges = routeEdges(edges, nodes);

    parsedScript = parsed;
    selectedEdgeId = '';
    currentFilename = file.name;
    setSelectedNodeId(nodes[0].id);
    nextNodeNumber = nodes.length + 1;
    nextOptionNumber = parsed.nodes.reduce((total, node) => total + node.options.length, 0) + 1;
    nextConditionNumber = parsed.nodes.reduce((total, node) => total + node.conditions.length, 0) + 1;
    sidebarMode = 'txt';
    const conditionCount = parsed.nodes.reduce((total, node) => total + node.conditions.length, 0);
    statusMessage = `Cargado: ${file.name}${conditionCount ? ` · ${conditionCount} condición${conditionCount === 1 ? '' : 'es'}` : ''}`;
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
      {#if statusMessage}<span class="status-message">{statusMessage}</span>{/if}
      <button
        type="button"
        class={showAllConditionJumps ? 'header-button condition-toggle-active' : 'header-button'}
        onclick={toggleAllConditionJumps}
      >{showAllConditionJumps ? 'Ocultar conexiones ?' : 'Mostrar conexiones ?'}</button>
      <button
        type="button"
        class="header-button danger"
        onclick={deleteSelectedNode}
        disabled={!selectedNode || Boolean(selectedEdge) || selectedNode.data.initial || conditionReferencesTarget(selectedNode.id) || rawReferenceToLoadedNode(selectedNode.id)}
      >Borrar nodo</button>
      <button
        type="button"
        class="header-button danger"
        onclick={deleteSelectedConnection}
        disabled={!selectedEdge || !selectedEdgeIsEditable()}
      >Borrar conexión</button>
      <button type="button" class="header-button" onclick={organizeGraph}>Ordenar</button>
      <button type="button" class="header-button" onclick={centerGraph}>Centrar</button>
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
        ondragstart={(event) => startPaletteDrag(event, 'options')}
      >
        <span class="palette-node-icon">▣</span>
        <div>
          <strong>Opciones</strong>
          <small>texto + respuestas</small>
        </div>
      </div>

      <div
        class="palette-node palette-conditions"
        draggable={true}
        ondragstart={(event) => startPaletteDrag(event, 'conditions')}
      >
        <span class="palette-node-icon">?</span>
        <div>
          <strong>Condiciones</strong>
          <small>sólo saltos ?</small>
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
        onpaneclick={clearConditionPreview}
        onconnect={connectOption}
        fitView
        minZoom={0.4}
        maxZoom={1.8}
        nodesConnectable={true}
        deleteKey={null}
        connectionRadius={28}
      >
        <ViewportActions requestToken={centerRequestToken} />
        <Background gap={20} size={1} />
        <Controls />
      </SvelteFlow>
    </section>

    <aside>
      <div class="sidebar-tabs">
        <button type="button" class:active={sidebarMode === 'inspector'} onclick={() => (sidebarMode = 'inspector')}>Inspector</button>
        <button type="button" class:active={sidebarMode === 'txt'} onclick={() => (sidebarMode = 'txt')}>TXT</button>
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
          El tipo visual se deriva del contenido: si hay alguna <b>=</b>, es nodo de Opciones; si no hay opciones y sí hay <b>?</b>, es nodo de Condiciones. El TXT sigue siendo la fuente de verdad.
        </div>
      {:else}
        <InspectorView
          node={selectedNode}
          request={inspectorRequest}
          {availableNodeTitles}
          onUpdateNode={updateSelected}
          onAddCondition={addCondition}
          onUpdateConditionItems={updateConditionItems}
          onUpdateConditionTarget={updateConditionTarget}
          onRemoveCondition={removeCondition}
          onAddOption={addOption}
          onUpdateOption={updateOption}
          onRemoveOption={removeOption}
        />
      {/if}
    </aside>
  </main>
</div>
