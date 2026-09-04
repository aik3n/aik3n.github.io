import type { Edge } from '@xyflow/svelte';
import type { DialogueNode } from './dialogueGraph';

function estimatedNodeHeight(node: DialogueNode) {
  if (node.type === 'conditions') {
    return 60 + node.data.conditions.length * 34 + (node.data.text.trim() ? 30 : 0);
  }

  return 115
    + node.data.conditions.length * 31
    + Math.max(1, node.data.options.length) * 31
    + (node.data.options.length ? 24 : 0);
}

export function layoutDialogueNodes(items: DialogueNode[]) {
  if (items.length === 0) return items;

  const NODE_WIDTH = 260;
  const SIBLING_GAP = 110;
  const ROOT_GAP = 180;
  const VERTICAL_GAP = 150;

  const byId = new Map(items.map((node) => [node.id, node]));
  const originalIndex = new Map(items.map((node, index) => [node.id, index]));
  const depth = new Map<string, number>();
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  function orderedTargets(node: DialogueNode) {
    const seen = new Set<string>();
    const result: string[] = [];

    // En nodos de Opciones el flujo principal lo dictan los =.
    // Sus ? son saltos excepcionales y no deben deformar el layout.
    // En nodos de Condiciones, los ? son su único flujo de salida.
    const targetIds = node.type === 'conditions'
      ? node.data.conditions.map((condition) => condition.targetId)
      : node.data.options.map((option) => option.targetId);

    for (const targetId of targetIds) {
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

      for (const targetId of orderedTargets(node)) {
        if (depth.has(targetId)) continue;
        depth.set(targetId, nextDepth);
        ownChildren.push(targetId);
        queue.push(targetId);
      }

      children.set(id, ownChildren);
    }
  }

  buildTree(items[0].id, 0);

  const mainMaxDepth = Math.max(0, ...depth.values());
  const disconnectedBaseDepth = mainMaxDepth + 1;
  const remaining = [...items]
    .filter((node) => !depth.has(node.id))
    .sort((a, b) => (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0));

  for (const node of remaining) {
    if (!depth.has(node.id)) buildTree(node.id, disconnectedBaseDepth);
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

export function routeEdges(items: Edge[], currentNodes: DialogueNode[]) {
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
