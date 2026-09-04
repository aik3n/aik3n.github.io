<script lang="ts">
  import {
    Background,
    Controls,
    SvelteFlow,
    addEdge,
    type Connection,
    type Edge,
    type NodeEventWithPointer,
    type Viewport
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
    type InventoryEffectOperation,
    type NodeEditIntent,
    type VisualNodeKind
  } from './lib/dialogueGraph';
  import {
    parseDialogueText,
    serializeDialogueText,
    type ParsedScript
  } from './lib/dialogueText';
  import { layoutDialogueNodes, routeEdges } from './lib/graphLayout';
  import {
    applyStoredPositions,
    loadStoredLayout,
    saveStoredLayout
  } from './lib/layoutStorage';

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
            targetLabel: 'FINAL',
            effects: []
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
  let nextEffectNumber = $state(1);
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
  let viewportRestoreToken = $state(0);
  let viewportToRestore = $state.raw<Viewport | null>(null);
  let currentViewport = $state.raw<Viewport>({ x: 0, y: 0, zoom: 1 });

  // 053: TXT editable y sincronización bidireccional
  let editableScriptText = $state('');
  let textSyncMessage = $state('');
  let textHasPendingChanges = $state(false);
  let textParseTimer: ReturnType<typeof setTimeout> | null = null;

  // 054: Inspector izquierda · Grafo centro · TXT derecha
  // 055: Inspector fijo · TXT colapsable
  // 056: pestaña lateral para TXT
  // 057: pestaña Guion fija
  let txtPanelOpen = $state(true);

  // 048: modo admin temporal + comprobación de publicación oficial.
  // No publica nada todavía: sólo mira si el nombre ya existe.
  let isAdminSession = $state(
    typeof sessionStorage !== 'undefined'
      && sessionStorage.getItem('zenode:admin') === 'true'
  );
  let validateOpen = $state(false);
  let validateChecking = $state(false);
  let validateExists = $state<boolean | null>(null);
  let validateError = $state('');
  let validateFilename = $state('');

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
          targetLabel: option.targetLabel,
          effects: option.effects.map((effect) => ({
            operation: effect.operation,
            item: effect.item
          }))
        }))
      }))
    )
  );

  $effect(() => {
    const serialized = scriptText;
    if (!textHasPendingChanges) {
      editableScriptText = serialized;
    }
  });

  function originalValidateFilename() {
    let filename = (currentFilename || 'guion.txt').trim();

    try {
      const source = JSON.parse(
        sessionStorage.getItem('zenode:github-source') || 'null'
      ) as { path?: string } | null;

      const sourceName = source?.path?.split('/').filter(Boolean).pop();
      if (sourceName) filename = sourceName;
    } catch {
      // Si los metadatos de origen fallan, usamos el nombre actual del editor.
    }

    return filename;
  }

  async function checkValidateFilename() {
    const filename = validateFilename.trim();
    validateError = '';
    validateExists = null;

    if (!filename) {
      validateError = 'Escribe un nombre para el guion.';
      return;
    }

    validateChecking = true;

    try {
      const encodedPath = filename
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');

      const response = await fetch(
        `https://api.github.com/repos/aik3n/ZeMobida_guiones/contents/${encodedPath}?ref=main`,
        {
          headers: {
            Accept: 'application/vnd.github+json'
          }
        }
      );

      if (response.status === 404) {
        validateExists = false;
        return;
      }

      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          throw new Error(
            'GitHub ha limitado temporalmente las consultas. Prueba de nuevo más tarde.'
          );
        }

        throw new Error(
          `No se pudo comprobar el guion oficial (${response.status}).`
        );
      }

      validateExists = true;
    } catch (error) {
      validateError = error instanceof Error
        ? error.message
        : 'No se pudo comprobar el guion oficial.';
    } finally {
      validateChecking = false;
    }
  }

  async function validateCurrentScript() {
    if (!isAdminSession) return;

    validateOpen = true;
    validateFilename = (currentFilename || 'guion.txt').trim();
    await checkValidateFilename();
  }

  function editValidateFilename(value: string) {
    validateFilename = value;
    validateExists = null;
    validateError = '';
  }

  function closeValidateDialog() {
    validateOpen = false;
  }

  function saveCurrentLayout(viewport = currentViewport) {
    if (!parsedScript) return;
    saveStoredLayout(currentFilename, nodes, viewport);
  }

  function rememberViewport(_event: MouseEvent | TouchEvent | null, viewport: Viewport) {
    currentViewport = viewport;
    saveCurrentLayout(viewport);
  }

  function rememberNodePositions() {
    saveCurrentLayout();
  }

  function selectedEdgeIsEditable() {
    return selectedEdge?.data?.role === 'option'
      || selectedEdge?.data?.role === 'condition-preview';
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
      selectable: true,
      deletable: false,
      focusable: true,
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
    // Las conexiones de condición pueden ser temporales cuando el modo global
    // está oculto. Si pulsamos una, no debemos borrarla antes de seleccionarla.
    if (edge.data?.role !== 'condition-preview') {
      clearConditionPreview();
    }

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
    if (field === 'title') saveCurrentLayout();
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
    saveCurrentLayout();
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
          options: [...node.data.options, { id: optionId, text: `Opción ${nextOptionNumber}`, effects: [] }]
        }
      };
    }));

    nextOptionNumber += 1;
    saveCurrentLayout();
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

  function updateOptionTarget(optionId: string, value: string) {
    const targetLabel = value.trim();
    const targetId = resolveTargetId(targetLabel);

    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((option) =>
              option.id === optionId
                ? { ...option, targetLabel: targetLabel || undefined, targetId }
                : option
            )
          }
        }
    );

    clearConditionPreview();
    const optionEdges = edges.filter((edge) =>
      !(edge.data?.role === 'option' && edge.source === selectedId && edge.sourceHandle === optionId)
    );

    if (targetId) {
      edges = routeEdges(addEdge({
        id: `${selectedId}-${optionId}-${targetId}`,
        source: selectedId,
        sourceHandle: optionId,
        target: targetId,
        type: 'default',
        data: { role: 'option' }
      }, optionEdges), nodes);
    } else {
      edges = routeEdges(optionEdges, nodes);
    }

    selectedEdgeId = '';
    setConnectionHighlights();
    if (showAllConditionJumps) refreshConditionPreviews();
  }

  function addOptionEffect(optionId: string): string | undefined {
    if (!selectedNode) return undefined;
    const effectId = `effect-${nextEffectNumber}`;

    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((option) =>
              option.id === optionId
                ? {
                    ...option,
                    effects: [
                      ...option.effects,
                      { id: effectId, operation: 'add', item: 'objeto' }
                    ]
                  }
                : option
            )
          }
        }
    );

    nextEffectNumber += 1;
    return effectId;
  }

  function updateOptionEffect(
    optionId: string,
    effectId: string,
    field: 'operation' | 'item',
    value: string
  ) {
    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((option) =>
              option.id !== optionId
                ? option
                : {
                    ...option,
                    effects: option.effects.map((effect) =>
                      effect.id !== effectId
                        ? effect
                        : field === 'operation'
                          ? { ...effect, operation: value as InventoryEffectOperation }
                          : { ...effect, item: value.replace(/^\s*[+-]/, '').trim() }
                    )
                  }
            )
          }
        }
    );
  }

  function removeOptionEffect(optionId: string, effectId: string) {
    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((option) =>
              option.id === optionId
                ? { ...option, effects: option.effects.filter((effect) => effect.id !== effectId) }
                : option
            )
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
    saveCurrentLayout();
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
    saveCurrentLayout();
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
    saveCurrentLayout();
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
    saveCurrentLayout();
  }

  function deleteSelectedConnection() {
    const edge = selectedEdge;
    if (!edge) return;

    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);

    if (edge.data?.role === 'condition-preview') {
      const condition = sourceNode?.data.conditions.find((item) => item.id === edge.sourceHandle);

      edges = routeEdges(edges.filter((item) => item.id !== edge.id), nodes);
      nodes = nodes.map((node) => node.id !== edge.source
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              conditions: node.data.conditions.map((item) =>
                item.id === edge.sourceHandle
                  ? { ...item, targetId: undefined, targetLabel: undefined }
                  : item
              )
            }
          }
      );

      selectedEdgeId = '';
      setConnectionHighlights();
      if (showAllConditionJumps) refreshConditionPreviews();
      statusMessage = `Conexión borrada: ?${condition?.order ?? ''} → ${targetNode?.data.title ?? 'destino'}`;
      return;
    }

    if (edge.data?.role !== 'option') return;

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
    saveCurrentLayout();
  }

  function centerGraph() {
    centerRequestToken += 1;
    statusMessage = 'Vista centrada';
  }

  function connectOption(connection: Connection) {
    const source = connection.source;
    const target = connection.target;
    const handleId = connection.sourceHandle;
    if (!source || !target || !handleId) return;

    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);
    if (!sourceNode || !targetNode) return;

    const option = sourceNode.data.options.find((item) => item.id === handleId);
    const condition = sourceNode.data.conditions.find((item) => item.id === handleId);
    if (!option && !condition) return;

    clearConditionPreview();
    edges = edges.filter((edge) => !(edge.source === source && edge.sourceHandle === handleId));

    if (condition) {
      nodes = nodes.map((node) => node.id !== source
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              conditions: node.data.conditions.map((item) =>
                item.id === handleId
                  ? { ...item, targetId: target, targetLabel: targetNode.data.title }
                  : item
              )
            }
          }
      );

      const conditionEdge = conditionPreviewEdge(source, handleId, target);
      edges = routeEdges([...edges, conditionEdge], nodes);
      selectedEdgeId = conditionEdge.id;
      setSelectedNodeId(source);
      setConnectionHighlights(source, target);
      sidebarMode = 'inspector';
      statusMessage = `Condición ?${condition.order} → ${targetNode.data.title}`;
      return;
    }

    edges = routeEdges(addEdge({ ...connection, type: 'default', data: { role: 'option' } }, edges), nodes);

    nodes = nodes.map((node) => node.id !== source
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            options: node.data.options.map((item) =>
              item.id === handleId
                ? { ...item, targetId: target, targetLabel: targetNode.data.title }
                : item
            )
          }
        }
    );
  }


  function buildDialogueNodesFromParsed(parsed: ParsedScript): DialogueNode[] {
    const idByLabel = new Map(
      parsed.nodes.map((node) => [node.title.toLowerCase(), node.id])
    );

    return parsed.nodes.map((node, index) => {
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
          targetLabel: option.targetLabel,
          effects: option.effects.map((effect) => ({
            id: effect.id,
            operation: effect.operation,
            item: effect.item
          }))
        }))
      };

      return {
        id: node.id,
        type: classifyNodeType(data),
        position: { x: 0, y: 0 },
        data
      } as DialogueNode;
    });
  }

  function buildVisibleEdges(graphNodes: DialogueNode[]): Edge[] {
    const nextEdges: Edge[] = [];

    for (const node of graphNodes) {
      for (const option of node.data.options) {
        if (!option.targetId) continue;

        nextEdges.push({
          id: `${node.id}-${option.id}-${option.targetId}`,
          source: node.id,
          sourceHandle: option.id,
          target: option.targetId,
          type: 'default',
          data: { role: 'option', lane: 0 }
        });
      }

      if (!showAllConditionJumps) continue;

      for (const condition of node.data.conditions) {
        if (!condition.targetId) continue;
        nextEdges.push(
          conditionPreviewEdge(node.id, condition.id, condition.targetId)
        );
      }
    }

    return routeEdges(nextEdges, graphNodes);
  }

  function liveTextIssue(text: string, parsed: ParsedScript) {
    if (parsed.nodes.length === 0) {
      return 'TXT pendiente: añade al menos un nodo #.';
    }

    const lines = text.replace(/\r\n/g, '\n').split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();

      if (/^#\s*$/.test(trimmed)) {
        return `TXT pendiente: completa el nombre del nodo en la línea ${index + 1}.`;
      }

      if (trimmed.startsWith('?')) {
        const code = trimmed.split("'")[0];
        if (!/>\s*[^\s\[]+/.test(code)) {
          return `TXT pendiente: completa el destino de la condición en la línea ${index + 1}.`;
        }
      }
    }

    const titles = new Set<string>();
    for (const node of parsed.nodes) {
      const key = node.title.trim().toLowerCase();
      if (titles.has(key)) {
        return `TXT pendiente: hay más de un nodo # ${node.title}.`;
      }
      titles.add(key);
    }

    return '';
  }

  function applyEditableScriptText(text: string) {
    const parsed = parseDialogueText(text, currentFilename || 'guion.txt');
    const issue = liveTextIssue(text, parsed);

    if (issue) {
      textSyncMessage = issue;
      statusMessage = issue;
      return;
    }

    const oldPositions = new Map(
      nodes.map((node) => [
        node.data.title.trim().toLowerCase(),
        { x: node.position.x, y: node.position.y }
      ])
    );
    const oldSelectedTitle =
      selectedNode?.data.title.trim().toLowerCase() ?? '';

    let nextNodes = layoutDialogueNodes(buildDialogueNodesFromParsed(parsed));

    nextNodes = nextNodes.map((node) => {
      const previous = oldPositions.get(node.data.title.trim().toLowerCase());
      return previous
        ? { ...node, position: { ...previous } }
        : node;
    });

    nodes = nextNodes;
    edges = buildVisibleEdges(nodes);
    parsedScript = parsed;
    selectedEdgeId = '';
    setConnectionHighlights();

    const nextSelected = oldSelectedTitle
      ? nodes.find(
          (node) => node.data.title.trim().toLowerCase() === oldSelectedTitle
        )
      : undefined;

    setSelectedNodeId(nextSelected?.id ?? nodes[0]?.id ?? '');

    nextNodeNumber = nodes.length + 1;
    nextOptionNumber =
      parsed.nodes.reduce((total, node) => total + node.options.length, 0) + 1;
    nextEffectNumber =
      parsed.nodes.reduce(
        (total, node) =>
          total +
          node.options.reduce(
            (sum, option) => sum + option.effects.length,
            0
          ),
        0
      ) + 1;
    nextConditionNumber =
      parsed.nodes.reduce(
        (total, node) => total + node.conditions.length,
        0
      ) + 1;

    textHasPendingChanges = false;
    textSyncMessage =
      `Sincronizado · ${nodes.length} nodo${nodes.length === 1 ? '' : 's'}`;
    statusMessage = textSyncMessage;
    saveCurrentLayout();
  }

  function scheduleEditableScriptParse(value: string) {
    editableScriptText = value;
    textHasPendingChanges = true;
    textSyncMessage = 'Interpretando cambios…';

    if (textParseTimer) {
      clearTimeout(textParseTimer);
    }

    textParseTimer = setTimeout(() => {
      textParseTimer = null;
      applyEditableScriptText(editableScriptText);
    }, 400);
  }

  function openFilePicker() {
    fileInput?.click();
  }

  async function loadScriptFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // GithubScripts marca justo antes de disparar el change si este File viene
    // del repositorio. Si el usuario abre un TXT local, limpiamos el origen
    // remoto anterior para que Validar nunca reutilice un nombre viejo.
    const openingFromGithub =
      sessionStorage.getItem('zenode:github-source-pending') === 'true';
    sessionStorage.removeItem('zenode:github-source-pending');

    if (!openingFromGithub) {
      sessionStorage.removeItem('zenode:github-source');
    }

    const text = await file.text();
    const parsed = parseDialogueText(text, file.name);
    if (parsed.nodes.length === 0) {
      statusMessage = 'No he encontrado ningún nodo # en ese archivo.';
      input.value = '';
      return;
    }

    const loadedNodes = buildDialogueNodesFromParsed(parsed);

    showAllConditionJumps = false;
    const storedLayout = loadStoredLayout(file.name);
    nodes = applyStoredPositions(layoutDialogueNodes(loadedNodes), storedLayout);
    edges = buildVisibleEdges(nodes);

    parsedScript = parsed;
    editableScriptText = text;
    textHasPendingChanges = false;
    textSyncMessage = '';
    if (textParseTimer) {
      clearTimeout(textParseTimer);
      textParseTimer = null;
    }
    selectedEdgeId = '';
    currentFilename = file.name;
    // Al abrir un guion conservamos las posiciones guardadas, pero siempre
    // encuadramos todo el grafo para que el usuario vea el contenido completo.
    currentViewport = { x: 0, y: 0, zoom: 1 };
    viewportToRestore = null;
    centerRequestToken += 1;
    setSelectedNodeId(nodes[0].id);
    nextNodeNumber = nodes.length + 1;
    nextOptionNumber = parsed.nodes.reduce((total, node) => total + node.options.length, 0) + 1;
    nextEffectNumber = parsed.nodes.reduce(
      (total, node) => total + node.options.reduce((sum, option) => sum + option.effects.length, 0),
      0
    ) + 1;
    nextConditionNumber = parsed.nodes.reduce((total, node) => total + node.conditions.length, 0) + 1;
    sidebarMode = 'txt';
    const conditionCount = parsed.nodes.reduce((total, node) => total + node.conditions.length, 0);
    statusMessage = `Cargado: ${file.name}${storedLayout ? ' · disposición recuperada' : ''}${conditionCount ? ` · ${conditionCount} condición${conditionCount === 1 ? '' : 'es'}` : ''}`;
    input.value = '';
  }

  function saveScript() {
    const blob = new Blob([editableScriptText], { type: 'text/plain;charset=utf-8' });
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
      <input
        class="brand-filename-input"
        bind:value={currentFilename}
        placeholder="guion.txt"
        aria-label="Nombre del guion"
        title="Nombre del guion"
      />
    </div>

    <div class="header-actions">
      {#if statusMessage}<span class="status-message">{statusMessage}</span>{/if}

      <button
        type="button"
        class="header-button node-drag-tool"
        draggable={true}
        ondragstart={(event) => startPaletteDrag(event, 'options')}
        title="Arrastra al lienzo para crear un nodo"
      >▣ Nodo</button>

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
      <!-- 059: carga oficiales y propuestas -->
      <!-- 060: eventos separados para GitHub -->
      <button
        type="button"
        class="header-button"
        onclick={() => window.dispatchEvent(
          new Event('zenode:load-official-scripts')
        )}
        title="Cargar un guion del repositorio oficial"
      >Carga oficiales</button>

      <button
        type="button"
        class="header-button"
        onclick={() => window.dispatchEvent(
          new Event('zenode:load-proposal-scripts')
        )}
        title="Cargar un guion del repositorio de propuestas"
      >Carga propuestas</button>
      <button type="button" class="header-button" onclick={openFilePicker}>Abrir TXT</button>
      {#if isAdminSession}
        <button
          type="button"
          class="header-button validate-official-button"
          onclick={validateCurrentScript}
          disabled={validateChecking}
        >✓ Validar</button>
      {/if}
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

  {#if validateOpen}
    <div class="validate-overlay">
      <div class="validate-dialog">
        <div class="validate-dialog-heading">
          <strong>Validar guion</strong>
          <span>{validateFilename || currentFilename}</span>
        </div>

        {#if validateChecking}
          <p class="validate-dialog-text">Comprobando los guiones oficiales…</p>
        {:else if validateError}
          <div class="validate-result validate-result-error">
            {validateError}
          </div>
        {:else if validateExists === true}
          <div class="validate-result validate-result-warning">
            <strong>Ya existe {validateFilename.trim()}.</strong>
            <span>
              Si continúas, esta versión sustituirá al guion oficial actual.
            </span>
          </div>
        {:else if validateExists === false}
          <div class="validate-result validate-result-new">
            <strong>{validateFilename.trim()} es un guion nuevo.</strong>
            <span>
              Se publicará como nuevo guion oficial.
            </span>
          </div>
        {:else}
          <div class="validate-result validate-result-pending">
            Comprueba el nombre antes de continuar.
          </div>
        {/if}

        <div class="validate-dialog-note">
          Esta prueba todavía no modifica ningún repositorio.
        </div>

        <div class="validate-dialog-actions">
          <button
            type="button"
            class="header-button"
            onclick={closeValidateDialog}
          >Cancelar</button>

          {#if validateExists === true && !validateChecking}
            <button
              type="button"
              class="header-button danger"
              disabled
              title="Se conectará al Worker en el siguiente paso"
            >Sobrescribir</button>
          {:else if validateExists === false && !validateChecking}
            <button
              type="button"
              class="header-button validate-official-button"
              disabled
              title="Se conectará al Worker en el siguiente paso"
            >✓ Validar</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <main
    class="workspace"
    class:txt-closed={!txtPanelOpen}
  >
    <aside class="inspector-panel">
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
        onUpdateOptionTarget={updateOptionTarget}
        onAddOptionEffect={addOptionEffect}
        onUpdateOptionEffect={updateOptionEffect}
        onRemoveOptionEffect={removeOptionEffect}
        onRemoveOption={removeOption}
      />
    </aside>

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
        onnodedragstop={rememberNodePositions}
        onedgeclick={selectEdge}
        onpaneclick={clearConditionPreview}
        onmoveend={rememberViewport}
        onconnect={connectOption}
        fitView
        minZoom={0.4}
        maxZoom={1.8}
        nodesConnectable={true}
        deleteKey={null}
        connectionRadius={28}
      >
        <ViewportActions
          requestToken={centerRequestToken}
          restoreToken={viewportRestoreToken}
          restoreViewport={viewportToRestore}
        />
        <Background gap={20} size={1} />
        <Controls />
      </SvelteFlow>
    </section>

    <button
      type="button"
      class="txt-edge-toggle"
      class:txt-edge-open={txtPanelOpen}
      onclick={() => (txtPanelOpen = !txtPanelOpen)}
      aria-label={txtPanelOpen ? 'Cerrar panel Guion' : 'Abrir panel Guion'}
      title={txtPanelOpen ? 'Cerrar Guion' : 'Abrir Guion'}
    >
      <span class="txt-edge-arrow">{txtPanelOpen ? '›' : '‹'}</span>
      <span class="txt-edge-label">Guion</span>
    </button>

    <aside
      class="txt-panel"
      class:panel-collapsed={!txtPanelOpen}
      aria-hidden={!txtPanelOpen}
    >
      <div class="txt-heading txt-panel-heading">
        <div>
          <strong>TXT</strong>
          <small>{currentFilename}</small>
        </div>
      </div>

      <textarea
        class="script-preview"
        value={editableScriptText}
        oninput={(event) => scheduleEditableScriptParse(event.currentTarget.value)}
        spellcheck="false"
      ></textarea>

      <div
        class:text-sync-warning={textHasPendingChanges}
        class="text-sync-status"
      >
        {textSyncMessage || 'TXT y grafo sincronizados'}
      </div>

      <div class="info-box compact">
        El TXT es la fuente de verdad. Los cambios se interpretan automáticamente
        y el grafo conserva el último estado válido mientras estás escribiendo.
      </div>
    </aside>
  </main>
</div>
