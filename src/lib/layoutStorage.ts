import type { Viewport } from '@xyflow/svelte';
import type { DialogueNode } from './dialogueGraph';

const STORAGE_PREFIX = 'zenode:layout:v1:';

export type StoredLayout = {
  version: 1;
  updatedAt: number;
  nodes: Record<string, { x: number; y: number }>;
  viewport?: Viewport;
};

function storageKey(filename: string) {
  return `${STORAGE_PREFIX}${filename.trim().toLowerCase()}`;
}

function nodeKey(title: string) {
  return title.trim().toLowerCase();
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validViewport(value: unknown): value is Viewport {
  if (!value || typeof value !== 'object') return false;
  const viewport = value as Partial<Viewport>;
  return finiteNumber(viewport.x) && finiteNumber(viewport.y) && finiteNumber(viewport.zoom);
}

export function loadStoredLayout(filename: string): StoredLayout | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(storageKey(filename));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    if (parsed.version !== 1 || !parsed.nodes || typeof parsed.nodes !== 'object') return null;

    const positions: StoredLayout['nodes'] = {};
    for (const [key, position] of Object.entries(parsed.nodes)) {
      if (!position || typeof position !== 'object') continue;
      const candidate = position as { x?: unknown; y?: unknown };
      if (!finiteNumber(candidate.x) || !finiteNumber(candidate.y)) continue;
      positions[key] = { x: candidate.x, y: candidate.y };
    }

    return {
      version: 1,
      updatedAt: finiteNumber(parsed.updatedAt) ? parsed.updatedAt : 0,
      nodes: positions,
      viewport: validViewport(parsed.viewport) ? parsed.viewport : undefined
    };
  } catch {
    return null;
  }
}

export function saveStoredLayout(filename: string, nodes: DialogueNode[], viewport?: Viewport) {
  if (typeof localStorage === 'undefined') return;

  const positions: StoredLayout['nodes'] = {};
  for (const node of nodes) {
    const key = nodeKey(node.data.title);
    if (!key) continue;
    positions[key] = { x: node.position.x, y: node.position.y };
  }

  const layout: StoredLayout = {
    version: 1,
    updatedAt: Date.now(),
    nodes: positions,
    viewport: validViewport(viewport) ? viewport : undefined
  };

  try {
    localStorage.setItem(storageKey(filename), JSON.stringify(layout));
  } catch {
    // El editor debe seguir funcionando aunque el navegador bloquee el almacenamiento local.
  }
}

export function applyStoredPositions(nodes: DialogueNode[], layout: StoredLayout | null) {
  if (!layout) return nodes;

  return nodes.map((node) => {
    const stored = layout.nodes[nodeKey(node.data.title)];
    return stored ? { ...node, position: { ...stored } } : node;
  });
}
