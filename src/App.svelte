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

  // 066: envio directo por Worker
  const PUBLISHER_URL = 'https://zemobida-publish.sam-cdi110.workers.dev';

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
        canDeleteNode: canDeleteNodeFromCard,
        onDeleteNode: deleteNodeFromCard,
        hasNodeError: nodeHasErrorById,
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
        canDeleteNode: canDeleteNodeFromCard,
        onDeleteNode: deleteNodeFromCard,
        hasNodeError: nodeHasErrorById,
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
  let statusMessage = $state('');
  // 069: conexiones de condición siempre visibles
  let inspectorRequest = $state.raw<InspectorRequest | null>(null);
  let inspectorRequestToken = $state(0);
  // 091: centrar el ejemplo al entrar
  let centerRequestToken = $state(1);
  let viewportRestoreToken = $state(0);
  let viewportToRestore = $state.raw<Viewport | null>(null);
  let currentViewport = $state.raw<Viewport>({ x: 0, y: 0, zoom: 1 });

  // 053: TXT editable y sincronización bidireccional
  let editableScriptText = $state('');
  let textSyncMessage = $state('');
  let textHasPendingChanges = $state(false);
  let textParseTimer: ReturnType<typeof setTimeout> | null = null;

  // 093: deshacer/rehacer TXT + posiciones de nodos
  type HistoryPosition = {
    id: string;
    x: number;
    y: number;
  };

  type HistorySnapshot = {
    text: string;
    positions: HistoryPosition[];
  };

  const HISTORY_LIMIT = 50;
  let editHistory = $state.raw<HistorySnapshot[]>([]);
  let editHistoryIndex = $state(-1);
  let historyTimer: ReturnType<typeof setTimeout> | null = null;
  let historyRestoring = $state(false);

  let canUndoHistory = $derived(editHistoryIndex > 0);
  let canRedoHistory = $derived(
    editHistoryIndex >= 0
      && editHistoryIndex < editHistory.length - 1
  );

  // 054: Inspector izquierda · Grafo centro · TXT derecha
  // 055: Inspector fijo · TXT colapsable
  // 056: pestaña lateral para TXT
  // 057: pestaña Guion fija
  let txtPanelOpen = $state(false);
  let txtPanelWidth = $state<number | null>(null);

  // 112: ancho ajustable del panel oficial
  let officialPanelWidth = $state<number | null>(null);

  // 106: gemelo oficial del guion local
  // 107: panel oficial independiente a la izquierda
  let officialPanelOpen = $state(false);
  let officialTwinText = $state('');
  let officialTwinExists = $state(false);
  let officialTwinLoading = $state(false);
  let officialTwinError = $state('');
  let officialTwinRequest = 0;

  function normalizeTwinText(text: string) {
    return text.replace(/\r\n/g, '\n');
  }

  let officialTwinMatches = $derived(
    officialTwinExists
      && normalizeTwinText(officialTwinText)
        === normalizeTwinText(editableScriptText)
  );

  let highlightedOfficialTwinText = $derived(
    highlightDialogueText(officialTwinText)
  );

  $effect(() => {
    const filename = currentFilename.trim();
    const request = ++officialTwinRequest;

    officialTwinText = '';
    officialTwinExists = false;
    officialTwinError = '';
    officialPanelOpen = false;

    if (!filename.toLowerCase().endsWith('.txt')) {
      officialPanelOpen = false;
      return;
    }

    officialTwinLoading = true;

    const timer = window.setTimeout(async () => {
      const url =
        'https://raw.githubusercontent.com/'
        + 'aik3n/ZeMobida_guiones/main/'
        + encodeURIComponent(filename);

      try {
        const response = await fetch(url, { cache: 'no-store' });

        if (request !== officialTwinRequest) return;

        if (response.status === 404) {
          officialTwinText = '';
          officialTwinExists = false;
          officialPanelOpen = false;
          return;
        }

        if (!response.ok) {
          throw new Error(
            `No se pudo consultar el oficial (${response.status}).`
          );
        }

        officialTwinText = await response.text();

        if (request !== officialTwinRequest) return;

        officialTwinExists = true;
      } catch (cause) {
        if (request !== officialTwinRequest) return;

        officialTwinText = '';
        officialTwinExists = false;
        officialTwinError =
          cause instanceof Error
            ? cause.message
            : 'No se pudo consultar el guion oficial.';

        officialPanelOpen = false;
      } finally {
        if (request === officialTwinRequest) {
          officialTwinLoading = false;
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  });

  // 098: resaltado de sintaxis del lenguaje ZeMobida
  let scriptTextarea = $state<HTMLTextAreaElement | null>(null);
  let scriptHighlight = $state<HTMLElement | null>(null);

  // 099: resaltado semántico como editor integrado ZeMobida
  function escapeSyntaxHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function syntaxSpan(value: string, className: string) {
    if (!value) return '';
    return `<span class="${className}">${escapeSyntaxHtml(value)}</span>`;
  }

  function highlightEffects(value: string, baseClass = '') {
    const effectPattern = /\[[^\]]*\]/g;
    let html = '';
    let cursor = 0;

    for (const match of value.matchAll(effectPattern)) {
      const index = match.index ?? 0;
      const before = value.slice(cursor, index);

      html += baseClass
        ? syntaxSpan(before, baseClass)
        : escapeSyntaxHtml(before);

      html += syntaxSpan(match[0], 'syntax-effect');
      cursor = index + match[0].length;
    }

    const rest = value.slice(cursor);
    html += baseClass
      ? syntaxSpan(rest, baseClass)
      : escapeSyntaxHtml(rest);

    return html;
  }

  function highlightDialogueLine(line: string) {
    // DIALOGUE_FORMAT.md: ' inicia comentario hasta final de línea.
    const commentIndex = line.indexOf("'");
    const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    const comment = commentIndex >= 0 ? line.slice(commentIndex) : '';

    let codeHtml = '';

    // DIALOGUE_FORMAT.md: cada línea se interpreta por su primer carácter.
    if (code.startsWith('@')) {
      codeHtml = highlightEffects(code, 'syntax-signature');
    } else if (code.startsWith('#')) {
      codeHtml = highlightEffects(code, 'syntax-node');
    } else if (code.startsWith('>')) {
      // El marcador > forma parte del salto: mismo cian que el destino.
      codeHtml = highlightEffects(code, 'syntax-jump');
    } else if (code.startsWith('?')) {
      const jumpIndex = code.indexOf('>');

      if (jumpIndex >= 0) {
        codeHtml =
          highlightEffects(code.slice(0, jumpIndex), 'syntax-condition')
          + highlightEffects(code.slice(jumpIndex), 'syntax-jump');
      } else {
        codeHtml = highlightEffects(code, 'syntax-condition');
      }
    } else if (code.startsWith('=')) {
      const jumpIndex = code.indexOf('>');

      if (jumpIndex >= 0) {
        codeHtml =
          highlightEffects(code.slice(0, jumpIndex), 'syntax-option')
          + highlightEffects(code.slice(jumpIndex), 'syntax-jump');
      } else {
        codeHtml = highlightEffects(code, 'syntax-option');
      }
    } else {
      // Texto normal del PNJ; sólo se colorean posibles efectos [ ].
      codeHtml = highlightEffects(code);
    }

    const commentHtml = comment
      ? syntaxSpan(comment, 'syntax-comment')
      : '';

    return `${codeHtml}${commentHtml}`;
  }

  function highlightDialogueText(text: string) {
    const highlighted = text
      .split('\n')
      .map(highlightDialogueLine)
      .join('\n');

    return highlighted + (text.endsWith('\n') ? ' ' : '');
  }

  let highlightedScriptText = $derived(
    highlightDialogueText(editableScriptText)
  );

  function syncScriptHighlightScroll() {
    if (!scriptTextarea || !scriptHighlight) return;
    scriptHighlight.scrollTop = scriptTextarea.scrollTop;
    scriptHighlight.scrollLeft = scriptTextarea.scrollLeft;
  }

  function startTxtPanelResize(event: PointerEvent) {
    if (!txtPanelOpen) return;

    const handle = event.currentTarget as HTMLElement;
    const workspace = handle.closest('.workspace') as HTMLElement | null;
    if (!workspace) return;

    event.preventDefault();

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const resize = (clientX: number) => {
      const rect = workspace.getBoundingClientRect();
      const inspector = workspace.querySelector(
        '.inspector-panel'
      ) as HTMLElement | null;

      const inspectorWidth =
        inspector?.getBoundingClientRect().width ?? 330;

      const minPanelWidth = 260;
      const minGraphWidth = 280;
      const maxPanelWidth = Math.max(
        minPanelWidth,
        Math.min(
          760,
          rect.width - inspectorWidth - minGraphWidth
        )
      );

      const desiredWidth = rect.right - clientX;

      txtPanelWidth = Math.round(
        Math.max(
          minPanelWidth,
          Math.min(maxPanelWidth, desiredWidth)
        )
      );
    };

    const move = (moveEvent: PointerEvent) => {
      resize(moveEvent.clientX);
    };

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }


  function startOfficialPanelResize(event: PointerEvent) {
    if (!officialTwinExists || !officialPanelOpen) return;

    const handle = event.currentTarget as HTMLElement;
    const panel = handle.closest(
      '.official-twin-panel'
    ) as HTMLElement | null;
    const workspace = handle.closest(
      '.workspace'
    ) as HTMLElement | null;

    if (!panel || !workspace) return;

    event.preventDefault();

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const resize = (clientX: number) => {
      const workspaceRect = workspace.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      const inspector = workspace.querySelector(
        '.inspector-panel'
      ) as HTMLElement | null;

      const localPanel = workspace.querySelector(
        '.txt-panel'
      ) as HTMLElement | null;

      const officialToggle = workspace.querySelector(
        '.official-grid-toggle'
      ) as HTMLElement | null;

      const inspectorWidth =
        inspector?.getBoundingClientRect().width ?? 330;

      const localWidth =
        txtPanelOpen
          ? (localPanel?.getBoundingClientRect().width ?? 390)
          : 0;

      const toggleWidth =
        officialToggle?.getBoundingClientRect().width ?? 30;

      const minPanelWidth = 260;
      const minGraphWidth = 280;

      const maxPanelWidth = Math.max(
        minPanelWidth,
        Math.min(
          760,
          workspaceRect.width
            - inspectorWidth
            - toggleWidth
            - localWidth
            - minGraphWidth
        )
      );

      const desiredWidth = clientX - panelRect.left;

      officialPanelWidth = Math.round(
        Math.max(
          minPanelWidth,
          Math.min(maxPanelWidth, desiredWidth)
        )
      );
    };

    const move = (moveEvent: PointerEvent) => {
      resize(moveEvent.clientX);
    };

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  // 070: estado en lienzo + Guion plegado + deselección en vacío
  // 071: crear nodo desde Inspector
  // 072: borrar nodo desde Inspector (corregido por 073)
  // 073: borrar nodo desde la tarjeta del grafo
  // 074: borrar conexión desde el lienzo
  // 075: acciones del grafo dentro del lienzo
  // 078: ancho ajustable de Guion
  // 079: abrir/guardar local antes de enviar
  // 080: separar acciones locales del envío
  // 081b: acciones locales centradas y envío a la derecha

  // 061: limpieza de restos de UI

  // 066: envío simple; usuario → propuestas, admin → oficiales.
  let publishBusy = $state(false);

  // 067: limpieza de Validar antiguo
  let isAdminSession = $state(
    typeof sessionStorage !== 'undefined'
      && sessionStorage.getItem('zenode:admin') === 'true'
  );

  let selectedNode = $derived(nodes.find((node) => node.id === selectedId));
  let selectedEdge = $derived(edges.find((edge) => edge.id === selectedEdgeId));

  // 096: detectar errores semánticos por nodo
  function nodeHasErrorById(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return false;

    const title = node.data.title.trim();
    if (!title) return true;

    const normalizedTitle = title.toLowerCase();
    if (
      nodes.filter(
        (item) => item.data.title.trim().toLowerCase() === normalizedTitle
      ).length > 1
    ) {
      return true;
    }

    const isSpecialDestination = (label?: string) =>
      label?.trim().toUpperCase() === 'RANDOM';

    const destinationIsBroken = (
      label?: string,
      targetId?: string
    ) =>
      Boolean(label?.trim())
      && !isSpecialDestination(label)
      && !targetId;

    if (
      node.data.effects?.some((effect) => !effect.item.trim())
    ) {
      return true;
    }

    if (
      destinationIsBroken(
        node.data.jumpTargetLabel,
        node.data.jumpTargetId
      )
    ) {
      return true;
    }

    if (
      node.data.conditions.some(
        (condition) =>
          condition.items.length === 0
          || condition.items.some((item) => !item.trim())
          || !condition.targetLabel?.trim()
          || destinationIsBroken(
            condition.targetLabel,
            condition.targetId
          )
      )
    ) {
      return true;
    }

    if (
      node.data.options.some(
        (option) =>
          !option.text.trim()
          || destinationIsBroken(
            option.targetLabel,
            option.targetId
          )
          || option.effects.some((effect) => !effect.item.trim())
      )
    ) {
      return true;
    }

    return false;
  }

  function setSelectedNodeId(nodeId: string) {
    selectedId = nodeId;
    nodes = nodes.map((node) => {
      const shouldBeSelected = Boolean(nodeId) && node.id === nodeId;
      const editorSelectionMatches =
        Boolean(node.data.editorSelected) === shouldBeSelected;
      const flowSelectionMatches =
        Boolean(node.selected) === shouldBeSelected;

      if (editorSelectionMatches && flowSelectionMatches) return node;

      return {
        ...node,
        selected: shouldBeSelected,
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
        // 063: inventario al entrar
        effects: (node.data.effects ?? []).map((effect) => ({
          operation: effect.operation,
          item: effect.item
        })),
        // 064: salto directo
        jumpTargetLabel: node.data.jumpTargetLabel,
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

  function captureHistorySnapshot(): HistorySnapshot {
    return {
      text: editableScriptText,
      positions: nodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y
      }))
    };
  }

  function historySnapshotKey(snapshot: HistorySnapshot) {
    return JSON.stringify(snapshot);
  }

  function resetEditHistory() {
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = null;
    }

    editHistory = [];
    editHistoryIndex = -1;
  }

  function recordHistorySnapshot() {
    if (historyRestoring || textHasPendingChanges) return;

    const snapshot = captureHistorySnapshot();

    if (!snapshot.text && !parsedScript) return;

    const current = editHistory[editHistoryIndex];
    if (
      current
      && historySnapshotKey(current) === historySnapshotKey(snapshot)
    ) {
      return;
    }

    let nextHistory = [
      ...editHistory.slice(0, editHistoryIndex + 1),
      snapshot
    ];

    if (nextHistory.length > HISTORY_LIMIT) {
      nextHistory = nextHistory.slice(
        nextHistory.length - HISTORY_LIMIT
      );
    }

    editHistory = nextHistory;
    editHistoryIndex = editHistory.length - 1;
  }

  function restoreHistorySnapshot(
    snapshot: HistorySnapshot,
    message: string
  ) {
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = null;
    }

    if (textParseTimer) {
      clearTimeout(textParseTimer);
      textParseTimer = null;
    }

    historyRestoring = true;
    editableScriptText = snapshot.text;
    textHasPendingChanges = true;

    applyEditableScriptText(snapshot.text);

    if (textHasPendingChanges) {
      historyRestoring = false;
      statusMessage = 'No se pudo restaurar ese estado del guion.';
      return false;
    }

    const positionById = new Map(
      snapshot.positions.map((position) => [
        position.id,
        position
      ])
    );

    nodes = nodes.map((node) => {
      const position = positionById.get(node.id);
      if (!position) return node;

      return {
        ...node,
        position: {
          x: position.x,
          y: position.y
        }
      };
    });

    edges = routeEdges(edges, nodes);
    editableScriptText = snapshot.text;
    saveCurrentLayout();
    statusMessage = message;

    queueMicrotask(() => {
      historyRestoring = false;
    });

    return true;
  }

  function undoHistory() {
    if (!canUndoHistory) return;

    const nextIndex = editHistoryIndex - 1;
    const snapshot = editHistory[nextIndex];
    if (!snapshot) return;

    if (restoreHistorySnapshot(snapshot, 'Deshacer')) {
      editHistoryIndex = nextIndex;
    }
  }

  function redoHistory() {
    if (!canRedoHistory) return;

    const nextIndex = editHistoryIndex + 1;
    const snapshot = editHistory[nextIndex];
    if (!snapshot) return;

    if (restoreHistorySnapshot(snapshot, 'Rehacer')) {
      editHistoryIndex = nextIndex;
    }
  }

  function handleHistoryShortcut(event: KeyboardEvent) {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier || event.altKey) return;

    const key = event.key.toLowerCase();

    if (key === 'z' && event.shiftKey) {
      if (!canRedoHistory) return;
      event.preventDefault();
      redoHistory();
      return;
    }

    if (key === 'z') {
      if (!canUndoHistory) return;
      event.preventDefault();
      undoHistory();
      return;
    }

    if (key === 'y') {
      if (!canRedoHistory) return;
      event.preventDefault();
      redoHistory();
    }
  }

  $effect(() => {
    const text = editableScriptText;
    const pending = textHasPendingChanges;
    const restoring = historyRestoring;

    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = null;
    }

    if (restoring || pending) return;
    if (!text && !parsedScript) return;

    if (editHistoryIndex < 0) {
      queueMicrotask(recordHistorySnapshot);
      return;
    }

    historyTimer = setTimeout(() => {
      historyTimer = null;
      recordHistorySnapshot();
    }, 250);
  });

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
    recordHistorySnapshot();
  }

  function selectedEdgeIsEditable() {
    return selectedEdge?.data?.role === 'option'
      || selectedEdge?.data?.role === 'condition-preview'
      || selectedEdge?.data?.role === 'direct-jump';
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
    const nonConditionEdges = edges.filter(
      (edge) => edge.data?.role !== 'condition-preview'
    );

    const conditionEdges: Edge[] = [];
    for (const node of nodes) {
      for (const condition of node.data.conditions) {
        if (!condition.targetId) continue;
        conditionEdges.push(
          conditionPreviewEdge(node.id, condition.id, condition.targetId)
        );
      }
    }

    edges = routeEdges([...nonConditionEdges, ...conditionEdges], nodes);
  }

  function clearConditionPreview() {
    setConnectionHighlights();
  }

  function clearCanvasSelection() {
    clearConditionPreview();
    setSelectedNodeId('');
    selectedEdgeId = '';
    inspectorRequest = null;
  }

  function toggleConditionJump(sourceId: string, conditionId: string) {
    const sourceNode = nodes.find((node) => node.id === sourceId);
    const condition = sourceNode?.data.conditions.find(
      (item) => item.id === conditionId
    );

    if (!sourceNode || !condition?.targetId) {
      setConnectionHighlights();
      statusMessage = condition?.targetLabel
        ? `Destino no encontrado: ${condition.targetLabel}`
        : 'Esta condición todavía no tiene destino.';
      return;
    }

    setSelectedNodeId(sourceId);
    selectedEdgeId = '';
    setConnectionHighlights(sourceId, condition.targetId);
    statusMessage = `Condición ?${condition.order} → ${condition.targetLabel}`;
  }

  function navigateInspector(nodeId: string, intent: NodeEditIntent) {
    clearConditionPreview();
    setSelectedNodeId(nodeId);
    selectedEdgeId = '';
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
  };

  // 087: seleccionar nodo al empezar a arrastrarlo
  // 088: evento correcto de Svelte Flow para drag start
  // 089: sincronizar selección del editor con Svelte Flow
  function selectNodeOnDragStart({
    targetNode
  }: {
    targetNode: DialogueNode | null;
  }) {
    if (!targetNode) return;

    clearConditionPreview();
    setSelectedNodeId(targetNode.id);
    selectedEdgeId = '';
  }

  function selectEdge({ edge }: { edge: Edge; event: MouseEvent }) {
    clearConditionPreview();
    selectedEdgeId = edge.id;
    setSelectedNodeId(edge.source);
    setConnectionHighlights(edge.source, edge.target);
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
      const jumpTargetLabel =
        field === 'title' && node.data.jumpTargetId === selectedId
          ? value
          : node.data.jumpTargetLabel;

      return refreshNodeType({
        ...node,
        data: {
          ...node.data,
          ...(node.id === selectedId ? { [field]: value } : {}),
          options,
          conditions,
          jumpTargetLabel
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
        effects: [],
        jumpTargetId: undefined,
        jumpTargetLabel: undefined,
        conditions: isConditions
          ? [{
              id: `cond-${nextConditionNumber}`,
              order: 1,
              items: ['condicion']
            }]
          : [],
        onConditionTargetClick: toggleConditionJump,
        onInspectorNavigate: navigateInspector,
        canDeleteNode: canDeleteNodeFromCard,
        onDeleteNode: deleteNodeFromCard,
        hasNodeError: nodeHasErrorById,
        options: []
      }
    };

    nodes = [...nodes, newNode];
    setSelectedNodeId(id);
    selectedEdgeId = '';
    nextNodeNumber += 1;
    if (isConditions) nextConditionNumber += 1;
    statusMessage = isConditions
      ? 'Nodo creado con condición. Completa condición y destino en el inspector.'
      : 'Nodo creado.';
    saveCurrentLayout();
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

  // 063: inventario al entrar en el nodo
  function addNodeEffect(): string | undefined {
    if (!selectedNode) return undefined;

    if (!selectedNode.data.text.trim()) {
      statusMessage = 'Añade texto de diálogo antes de crear un efecto al entrar.';
      return undefined;
    }

    const effectId = `effect-${nextEffectNumber}`;

    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            effects: [
              ...(node.data.effects ?? []),
              { id: effectId, operation: 'add', item: 'objeto' }
            ]
          }
        }
    );

    nextEffectNumber += 1;
    return effectId;
  }

  function updateNodeEffect(
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
            effects: (node.data.effects ?? []).map((effect) =>
              effect.id !== effectId
                ? effect
                : field === 'operation'
                  ? { ...effect, operation: value as InventoryEffectOperation }
                  : { ...effect, item: value.replace(/^\s*[+-]/, '').trim() }
            )
          }
        }
    );
  }

  function removeNodeEffect(effectId: string) {
    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            effects: (node.data.effects ?? []).filter(
              (effect) => effect.id !== effectId
            )
          }
        }
    );
  }

  // 064: salto directo > DESTINO
  function updateJumpTarget(value: string) {
    if (!selectedNode) return;

    const jumpTargetLabel = value.trim();
    const jumpTargetId =
      jumpTargetLabel.toLowerCase() === 'random'
        ? undefined
        : resolveTargetId(jumpTargetLabel);

    nodes = nodes.map((node) => node.id !== selectedId
      ? node
      : {
          ...node,
          data: {
            ...node.data,
            jumpTargetLabel: jumpTargetLabel || undefined,
            jumpTargetId
          }
        }
    );

    edges = routeEdges(
      edges.filter((edge) =>
        !(edge.data?.role === 'direct-jump' && edge.source === selectedId)
      ),
      nodes
    );

    if (jumpTargetId) {
      edges = routeEdges([
        ...edges,
        {
          id: `direct-jump-${selectedId}-${jumpTargetId}`,
          source: selectedId,
          sourceHandle: 'direct-jump',
          target: jumpTargetId,
          type: 'default',
          data: { role: 'direct-jump', lane: 0 }
        }
      ], nodes);
    }

    selectedEdgeId = '';
    setConnectionHighlights();
    refreshConditionPreviews();
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
    refreshConditionPreviews();
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
    refreshConditionPreviews();
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
    refreshConditionPreviews();
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

  function jumpReferencesTarget(nodeId: string) {
    return nodes.some((node) => node.data.jumpTargetId === nodeId);
  }

  function canDeleteNodeFromCard(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    return Boolean(
      node
      && !node.data.initial
      && !conditionReferencesTarget(nodeId)
      && !jumpReferencesTarget(nodeId)
      && !rawReferenceToLoadedNode(nodeId)
    );
  }

  function deleteNodeFromCard(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;

    if (node.data.initial) {
      statusMessage = 'El nodo inicial no se puede borrar.';
      return;
    }
    if (conditionReferencesTarget(node.id)) {
      statusMessage = `No se puede borrar ${node.data.title}: una condición salta a este nodo.`;
      return;
    }
    if (jumpReferencesTarget(node.id)) {
      statusMessage = `No se puede borrar ${node.data.title}: un salto directo apunta a este nodo.`;
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

    edges = routeEdges(
      edges.filter((edge) => edge.source !== deletedId && edge.target !== deletedId),
      nodes
    );
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
      refreshConditionPreviews();
      statusMessage = `Conexión borrada: ?${condition?.order ?? ''} → ${targetNode?.data.title ?? 'destino'}`;
      return;
    }

    if (edge.data?.role === 'direct-jump') {
      edges = routeEdges(edges.filter((item) => item.id !== edge.id), nodes);
      nodes = nodes.map((node) => node.id !== edge.source
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              jumpTargetId: undefined,
              jumpTargetLabel: undefined
            }
          }
      );

      selectedEdgeId = '';
      setConnectionHighlights();
      statusMessage = `Salto directo borrado: ${sourceNode?.data.title ?? 'nodo'} → ${targetNode?.data.title ?? 'destino'}`;
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
    recordHistorySnapshot();
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
    const directJump = handleId === 'direct-jump';
    if (!option && !condition && !directJump) return;

    clearConditionPreview();
    edges = edges.filter((edge) => !(edge.source === source && edge.sourceHandle === handleId));

    if (directJump) {
      nodes = nodes.map((node) => node.id !== source
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              jumpTargetId: target,
              jumpTargetLabel: targetNode.data.title
            }
          }
      );

      const jumpEdge: Edge = {
        id: `direct-jump-${source}-${target}`,
        source,
        sourceHandle: 'direct-jump',
        target,
        type: 'default',
        data: { role: 'direct-jump', lane: 0 }
      };
      edges = routeEdges([...edges, jumpEdge], nodes);
      selectedEdgeId = jumpEdge.id;
      setSelectedNodeId(source);
      setConnectionHighlights(source, target);
      statusMessage = `Salto directo → ${targetNode.data.title}`;
      return;
    }

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
        effects: node.effects.map((effect) => ({
          id: effect.id,
          operation: effect.operation,
          item: effect.item
        })),
        jumpTargetId:
          node.jumpTargetLabel && node.jumpTargetLabel.toLowerCase() !== 'random'
            ? idByLabel.get(node.jumpTargetLabel.toLowerCase())
            : undefined,
        jumpTargetLabel: node.jumpTargetLabel,
        initial: index === 0,
        onConditionTargetClick: toggleConditionJump,
        onInspectorNavigate: navigateInspector,
        canDeleteNode: canDeleteNodeFromCard,
        onDeleteNode: deleteNodeFromCard,
        hasNodeError: nodeHasErrorById,
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
      if (node.data.jumpTargetId) {
        nextEdges.push({
          id: `direct-jump-${node.id}-${node.data.jumpTargetId}`,
          source: node.id,
          sourceHandle: 'direct-jump',
          target: node.data.jumpTargetId,
          type: 'default',
          data: { role: 'direct-jump', lane: 0 }
        });
      }

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
          node.effects.length +
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
    resetEditHistory();
    recordHistorySnapshot();
    // Al abrir un guion conservamos las posiciones guardadas, pero siempre
    // encuadramos todo el grafo para que el usuario vea el contenido completo.
    currentViewport = { x: 0, y: 0, zoom: 1 };
    viewportToRestore = null;
    centerRequestToken += 1;
    setSelectedNodeId(nodes[0].id);
    nextNodeNumber = nodes.length + 1;
    nextOptionNumber = parsed.nodes.reduce((total, node) => total + node.options.length, 0) + 1;
    nextEffectNumber = parsed.nodes.reduce(
      (total, node) =>
        total +
        node.effects.length +
        node.options.reduce((sum, option) => sum + option.effects.length, 0),
      0
    ) + 1;
    nextConditionNumber = parsed.nodes.reduce((total, node) => total + node.conditions.length, 0) + 1;
    const conditionCount = parsed.nodes.reduce((total, node) => total + node.conditions.length, 0);
    statusMessage = `Cargado: ${file.name}${storedLayout ? ' · disposición recuperada' : ''}${conditionCount ? ` · ${conditionCount} condición${conditionCount === 1 ? '' : 'es'}` : ''}`;
    input.value = '';
  }

  async function publishCurrentScript(target: 'proposal' | 'official') {
    if (publishBusy) return;

    const filename = (currentFilename || 'guion.txt').trim();
    const content = editableScriptText;

    if (!/^[A-Za-z0-9._-]+\.txt$/i.test(filename)) {
      statusMessage =
        'Nombre no válido: usa letras, números, punto, guion o guion bajo y termina en .txt';
      return;
    }

    if (!content.trim()) {
      statusMessage = 'No se puede enviar un guion vacío.';
      return;
    }

    publishBusy = true;
    statusMessage =
      target === 'official'
        ? `Publicando oficial: ${filename}…`
        : `Enviando propuesta: ${filename}…`;

    try {
      const response = await fetch(`${PUBLISHER_URL}/${target}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename,
          content
        })
      });

      let result: {
        ok?: boolean;
        error?: string;
        overwritten?: boolean;
      } = {};

      try {
        result = await response.json();
      } catch {
        // Si el Worker devuelve algo inesperado, usamos el estado HTTP.
      }

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ||
          `No se pudo enviar el guion (${response.status}).`
        );
      }

      if (target === 'official') {
        statusMessage = result.overwritten
          ? `Oficial actualizado: ${filename}`
          : `Oficial publicado: ${filename}`;
      } else {
        statusMessage = result.overwritten
          ? `Propuesta actualizada: ${filename}`
          : `Propuesta enviada: ${filename}`;
      }
    } catch (error) {
      statusMessage =
        error instanceof Error
          ? `Error de envío: ${error.message}`
          : 'Error de envío.';
    } finally {
      publishBusy = false;
    }
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

<svelte:window onkeydown={handleHistoryShortcut} />

<div class="app-shell">
  <header>
    <div class="brand-block">
      <strong>ZeMobida</strong>

      <!-- 062: cargas junto al titulo -->
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

      <input
        class="brand-filename-input"
        bind:value={currentFilename}
        placeholder="guion.txt"
        aria-label="Nombre del guion"
        title="Nombre del guion"
      />
    </div>

    <div class="header-local-actions">
      <button
        type="button"
        class="header-button"
        onclick={openFilePicker}
      >Abrir guion local</button>

      <button
        type="button"
        class="header-button"
        onclick={saveScript}
      >Guardar guion local</button>

      <input
        class="hidden-file-input"
        bind:this={fileInput}
        type="file"
        accept=".txt,text/plain"
        onchange={loadScriptFile}
      />
    </div>

    <div class="header-publish-actions">
      <!-- 104: admin conserva envío oficial y propuesta -->
      {#if isAdminSession}
        <button
          type="button"
          class="header-button publish-official-button"
          onclick={() => publishCurrentScript('official')}
          disabled={publishBusy}
          title="Enviar este guion a los oficiales"
        >{publishBusy ? 'Enviando…' : 'Enviar oficial'}</button>

        <button
          type="button"
          class="header-button primary"
          onclick={() => publishCurrentScript('proposal')}
          disabled={publishBusy}
          title="Enviar este guion como propuesta"
        >Enviar propuesta</button>
      {:else}
        <button
          type="button"
          class="header-button primary"
          onclick={() => publishCurrentScript('proposal')}
          disabled={publishBusy}
          title="Enviar este guion como propuesta"
        >{publishBusy ? 'Enviando…' : 'Enviar propuesta'}</button>
      {/if}
    </div>
  </header>

  <main
    class="workspace"
    class:txt-closed={!txtPanelOpen}
    class:official-available={officialTwinExists}
    class:official-open={officialTwinExists && officialPanelOpen}
    style={[
      txtPanelWidth === null
        ? ''
        : `--txt-panel-width: ${txtPanelWidth}px;`,
      officialPanelWidth === null
        ? ''
        : `--official-panel-width: ${officialPanelWidth}px;`
    ].filter(Boolean).join(' ') || undefined}
  >
    <aside class="inspector-panel">
      <InspectorView
        node={selectedNode}
        request={inspectorRequest}
        {availableNodeTitles}
        onUpdateNode={updateSelected}
        onUpdateJumpTarget={updateJumpTarget}
        onAddNodeEffect={addNodeEffect}
        onUpdateNodeEffect={updateNodeEffect}
        onRemoveNodeEffect={removeNodeEffect}
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

<!-- 111: OFICIAL entre Inspector y Grafo -->
    {#if officialTwinExists}
      <button
        type="button"
        class="official-edge-toggle official-grid-toggle"
        onclick={() => (officialPanelOpen = !officialPanelOpen)}
        aria-label={officialPanelOpen
          ? 'Cerrar guion oficial'
          : 'Abrir guion oficial'}
        title={officialTwinMatches
          ? 'Guion oficial · igual al local'
          : 'Guion oficial · diferente del local'}
      >
        <span class="official-edge-arrow">
          {officialPanelOpen ? '‹' : '›'}
        </span>
        <span class="official-edge-label">OFICIAL</span>
      </button>
    {/if}

    {#if officialTwinExists && officialPanelOpen}
      <aside class="official-twin-panel">
        <!-- 112: tirador de ancho del panel oficial -->
        <button
          type="button"
          class="official-resize-handle"
          onpointerdown={startOfficialPanelResize}
          aria-label="Cambiar ancho del panel oficial"
          title="Arrastrar para cambiar el ancho"
        ></button>

        <div
          class:official-twin-different={!officialTwinMatches}
          class="official-twin-status"
        >
          {officialTwinMatches ? 'IGUAL AL LOCAL' : 'DIFERENTE DEL LOCAL'}
        </div>

        <div
          class="official-twin-editor"
          aria-label="Guion oficial, solo lectura"
        >
          <pre class="official-twin-code">{@html highlightedOfficialTwinText}</pre>
        </div>
      </aside>
    {/if}

    <section
      class="canvas"
      bind:this={canvasElement}
      ondragover={allowCanvasDrop}
      ondrop={dropNodeOnCanvas}
    >
      <div class="canvas-tools">
        <!-- 093: botones visuales deshacer / rehacer -->
        <button
          type="button"
          class="canvas-tool-button history-button"
          onclick={undoHistory}
          disabled={!canUndoHistory}
          aria-label="Deshacer"
          title="Deshacer (Ctrl+Z)"
        >↶</button>

        <button
          type="button"
          class="canvas-tool-button history-button"
          onclick={redoHistory}
          disabled={!canRedoHistory}
          aria-label="Rehacer"
          title="Rehacer (Ctrl+Y / Ctrl+Shift+Z)"
        >↷</button>

        <button
          type="button"
          class="canvas-tool-button"
          onclick={centerGraph}
          title="Centrar el grafo"
        >CENTRAR</button>

        <button
          type="button"
          class="canvas-tool-button"
          onclick={organizeGraph}
          title="Ordenar automáticamente el grafo"
        >ORDENAR</button>

        {#if selectedEdge && selectedEdgeIsEditable()}
          <button
            type="button"
            class="canvas-tool-button danger"
            onclick={deleteSelectedConnection}
            title="Borrar conexión seleccionada"
          >BORRAR</button>
        {/if}
      </div>

      <!-- 085: aviso de nodo inicial en el editor -->
      {#if selectedNode?.data.initial}
        <div class="canvas-initial-info">
          ▶ Nodo inicial · punto de entrada del diálogo · admite retornos
        </div>
      {/if}

      <SvelteFlow
        bind:nodes
        bind:edges
        {nodeTypes}
        onnodeclick={selectNode}
        onnodedragstart={selectNodeOnDragStart}
        onnodedragstop={rememberNodePositions}
        onedgeclick={selectEdge}
        onpaneclick={clearCanvasSelection}
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

      {#if statusMessage}
        <div class="canvas-status" role="status">{statusMessage}</div>
      {/if}
    </section>

    {#if txtPanelOpen}
      <button
        type="button"
        class="txt-resize-handle"
        onpointerdown={startTxtPanelResize}
        aria-label="Cambiar ancho del panel Guion"
        title="Arrastra para cambiar el ancho"
      ></button>
    {/if}

        <button
      type="button"
      class="txt-edge-toggle"
      class:txt-edge-open={txtPanelOpen}
      onclick={() => (txtPanelOpen = !txtPanelOpen)}
      aria-label={txtPanelOpen ? 'Cerrar panel Guion' : 'Abrir panel Guion'}
      title={txtPanelOpen ? 'Cerrar Guion' : 'Abrir Guion'}
    >
      <span class="txt-edge-arrow">{txtPanelOpen ? '›' : '‹'}</span>
      <!-- 090: pestaña EDITOR GUION -->
      <span class="txt-edge-label">EDITOR GUION</span>
    </button>

    <aside
      class="txt-panel"
      class:panel-collapsed={!txtPanelOpen}
      aria-hidden={!txtPanelOpen}
    >
      <!-- 103: TXT y nombre redundantes eliminados del panel -->
      <div class="script-editor-layer">
        <pre
          class="script-highlight"
          bind:this={scriptHighlight}
          aria-hidden="true"
        >{@html highlightedScriptText}</pre>

        <textarea
          class="script-preview script-input"
          bind:this={scriptTextarea}
          value={editableScriptText}
          oninput={(event) => scheduleEditableScriptParse(event.currentTarget.value)}
          onscroll={syncScriptHighlightScroll}
          spellcheck="false"
        ></textarea>
      </div>

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
