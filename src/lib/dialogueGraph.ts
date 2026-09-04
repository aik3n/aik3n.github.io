import type { Node } from '@xyflow/svelte';

export type VisualNodeKind = 'options' | 'conditions';

export type InspectorSection = 'name' | 'dialogue' | 'jump' | 'conditions' | 'options';

export type NodeEditIntent = {
  section: InspectorSection;
  itemId?: string;
  field?: 'name' | 'text' | 'items' | 'target' | 'option';
  focus?: boolean;
};

export type InspectorRequest = NodeEditIntent & {
  nodeId: string;
  token: number;
};

export type InventoryEffectOperation = 'add' | 'remove';

export type DialogueInventoryEffect = {
  id: string;
  operation: InventoryEffectOperation;
  item: string;
};

export type DialogueOption = {
  id: string;
  text: string;
  targetId?: string;
  targetLabel?: string;
  effects: DialogueInventoryEffect[];
};

export type DialogueCondition = {
  id: string;
  order: number;
  items: string[];
  targetId?: string;
  targetLabel?: string;
};

export type DialogueNodeData = {
  title: string;
  text: string;
  // 063: inventario al entrar
  effects?: DialogueInventoryEffect[];
  // 064: salto directo
  jumpTargetId?: string;
  jumpTargetLabel?: string;
  conditions: DialogueCondition[];
  options: DialogueOption[];
  initial?: boolean;
  connectionHighlight?: 'source' | 'target' | 'both';
  editorSelected?: boolean;
  onConditionTargetClick?: (sourceId: string, conditionId: string) => void;
  onInspectorNavigate?: (nodeId: string, intent: NodeEditIntent) => void;
  // 073: borrado contextual desde la tarjeta visual
  canDeleteNode?: (nodeId: string) => boolean;
  onDeleteNode?: (nodeId: string) => void;
  // 096: aviso visual de error semántico
  hasNodeError?: (nodeId: string) => boolean;
};

export type DialogueNode = Node<DialogueNodeData, VisualNodeKind>;

export function classifyNodeType(data: Pick<DialogueNodeData, 'options' | 'conditions'>): VisualNodeKind {
  if (data.options.length > 0 || data.conditions.length === 0) return 'options';
  return 'conditions';
}

export function refreshNodeType(node: DialogueNode): DialogueNode {
  return {
    ...node,
    type: classifyNodeType(node.data)
  };
}

export function refreshNodeTypes(nodes: DialogueNode[]): DialogueNode[] {
  return nodes.map(refreshNodeType);
}
