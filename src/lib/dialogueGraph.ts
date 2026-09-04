import type { Node } from '@xyflow/svelte';

export type VisualNodeKind = 'options' | 'conditions';

export type InspectorSection = 'name' | 'dialogue' | 'conditions' | 'options';

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

export type DialogueOption = {
  id: string;
  text: string;
  targetId?: string;
  targetLabel?: string;
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
  conditions: DialogueCondition[];
  options: DialogueOption[];
  initial?: boolean;
  connectionHighlight?: 'source' | 'target' | 'both';
  editorSelected?: boolean;
  onConditionTargetClick?: (sourceId: string, conditionId: string) => void;
  onInspectorNavigate?: (nodeId: string, intent: NodeEditIntent) => void;
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
