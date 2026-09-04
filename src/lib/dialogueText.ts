export type InventoryEffectOperation = 'add' | 'remove';

export type ParsedInventoryEffect = {
  id: string;
  operation: InventoryEffectOperation;
  item: string;
};

export type ParsedOption = {
  id: string;
  text: string;
  targetLabel?: string;
  effects: ParsedInventoryEffect[];
  originalText: string;
  originalTargetLabel?: string;
  originalEffects: ParsedInventoryEffect[];
  raw: string;
  tail: string;
};

export type ParsedCondition = {
  id: string;
  items: string[];
  targetLabel?: string;
  originalItems: string[];
  originalTargetLabel?: string;
  raw: string;
  tail: string;
};

export type BodyToken =
  | { kind: 'text'; raw: string; content: string; inlineComment?: string }
  | { kind: 'option'; optionId: string }
  | { kind: 'condition'; conditionId: string }
  | { kind: 'raw'; raw: string };

export type ParsedNode = {
  id: string;
  title: string;
  originalTitle: string;
  rawHeader: string;
  headerTail: string;
  originalText: string;
  options: ParsedOption[];
  conditions: ParsedCondition[];
  tokens: BodyToken[];
};

export type ParsedScript = {
  filename: string;
  preamble: string[];
  nodes: ParsedNode[];
  newline: '\n' | '\r\n';
};

export type SerializableInventoryEffect = {
  operation: InventoryEffectOperation;
  item: string;
};

export type SerializableOption = {
  id: string;
  text: string;
  targetLabel?: string;
  effects: SerializableInventoryEffect[];
};

export type SerializableCondition = {
  id: string;
  items: string[];
  targetLabel?: string;
};

export type SerializableNode = {
  id: string;
  title: string;
  text: string;
  conditions: SerializableCondition[];
  options: SerializableOption[];
};

function splitInlineComment(line: string) {
  const index = line.indexOf("'");
  if (index < 0) return { code: line, comment: '' };

  return {
    code: line.slice(0, index),
    comment: line.slice(index)
  };
}

function parseHeader(line: string) {
  const { code, comment } = splitInlineComment(line);
  const match = code.match(/^\s*#\s*([^\s]+)(.*)$/);

  if (!match) {
    return {
      title: code.replace(/^\s*#\s*/, '').trim() || 'NODO',
      tail: comment ? ` ${comment}` : ''
    };
  }

  return {
    title: match[1],
    tail: `${match[2] ?? ''}${comment}`
  };
}

function parseEffectBlock(code: string, idPrefix: string) {
  const match = code.match(/\[([^\]]*)\]/);
  if (!match || match.index === undefined) return { effects: [] as ParsedInventoryEffect[], remaining: code };

  const tokens = match[1]
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0 || tokens.some((token) => !/^[+-].+/.test(token))) {
    return { effects: [] as ParsedInventoryEffect[], remaining: code };
  }

  const effects = tokens.map((token, index) => ({
    id: `${idPrefix}-effect-${index + 1}`,
    operation: token.startsWith('+') ? 'add' as const : 'remove' as const,
    item: token.slice(1)
  }));

  const prefix = code.slice(0, match.index);
  const suffix = code.slice(match.index + match[0].length);
  const remaining = `${prefix.trim() ? prefix : ''}${suffix}`;
  return { effects, remaining };
}

function cloneEffects(effects: ParsedInventoryEffect[]): ParsedInventoryEffect[] {
  return effects.map((effect) => ({ ...effect }));
}

function parseOptionLine(line: string, id: string): ParsedOption {
  const { code, comment } = splitInlineComment(line);
  const afterEquals = code.replace(/^\s*=\s*/, '');
  const jumpIndex = afterEquals.indexOf('>');

  let textPart = afterEquals;
  let targetLabel: string | undefined;
  let effectArea = '';

  if (jumpIndex >= 0) {
    textPart = afterEquals.slice(0, jumpIndex);
    const destinationPart = afterEquals.slice(jumpIndex + 1).trimStart();
    const destinationMatch = destinationPart.match(/^([^\s\[]+)(.*)$/);

    if (destinationMatch) {
      targetLabel = destinationMatch[1];
      effectArea = destinationMatch[2] ?? '';
    }
  } else {
    const effectStart = afterEquals.indexOf('[');
    if (effectStart >= 0) {
      textPart = afterEquals.slice(0, effectStart);
      effectArea = afterEquals.slice(effectStart);
    }
  }

  const parsedEffects = parseEffectBlock(effectArea, id);
  const effects = parsedEffects.effects;
  const text = textPart.trim();
  const tail = `${parsedEffects.remaining}${comment}`;

  return {
    id,
    text,
    targetLabel,
    effects,
    originalText: text,
    originalTargetLabel: targetLabel,
    originalEffects: cloneEffects(effects),
    raw: line,
    tail
  };
}

function parseConditionLine(line: string, id: string): ParsedCondition | null {
  const { code, comment } = splitInlineComment(line);
  const jumpIndex = code.indexOf('>');

  // El runtime ignora una condición sin salto. La dejamos raw para no reinterpretarla.
  if (jumpIndex < 0) return null;

  const conditionPart = code.slice(0, jumpIndex).trim();
  const items = conditionPart
    .split(/\s+/)
    .filter((token) => token.startsWith('?'))
    .map((token) => token.slice(1).trim())
    .filter(Boolean);

  const destinationPart = code.slice(jumpIndex + 1).trimStart();
  const destinationMatch = destinationPart.match(/^([^\s\[]+)(.*)$/);
  if (items.length === 0 || !destinationMatch) return null;

  const targetLabel = destinationMatch[1];
  const tail = `${destinationMatch[2] ?? ''}${comment}`;

  return {
    id,
    items,
    targetLabel,
    originalItems: [...items],
    originalTargetLabel: targetLabel,
    raw: line,
    tail
  };
}

export function parseDialogueText(text: string, filename = 'guion.txt'): ParsedScript {
  const newline: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const preamble: string[] = [];
  const nodes: ParsedNode[] = [];

  let current: ParsedNode | null = null;
  let nodeIndex = 0;
  let optionIndex = 0;
  let conditionIndex = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith('#')) {
      nodeIndex += 1;
      const parsedHeader = parseHeader(line);
      current = {
        id: `loaded-node-${nodeIndex}`,
        title: parsedHeader.title,
        originalTitle: parsedHeader.title,
        rawHeader: line,
        headerTail: parsedHeader.tail,
        originalText: '',
        options: [],
        conditions: [],
        tokens: []
      };
      nodes.push(current);
      continue;
    }

    if (!current) {
      preamble.push(line);
      continue;
    }

    if (trimmed.startsWith('=')) {
      optionIndex += 1;
      const option = parseOptionLine(line, `loaded-opt-${optionIndex}`);
      current.options.push(option);
      current.tokens.push({ kind: 'option', optionId: option.id });
      continue;
    }

    if (trimmed.startsWith('?')) {
      conditionIndex += 1;
      const condition = parseConditionLine(line, `loaded-cond-${conditionIndex}`);
      if (condition) {
        current.conditions.push(condition);
        current.tokens.push({ kind: 'condition', conditionId: condition.id });
      } else {
        current.tokens.push({ kind: 'raw', raw: line });
      }
      continue;
    }

    if (
      trimmed === '' ||
      trimmed.startsWith("'") ||
      trimmed.startsWith('>') ||
      trimmed.startsWith('@') ||
      trimmed.startsWith('[') ||
      line.includes('[')
    ) {
      current.tokens.push({ kind: 'raw', raw: line });
      continue;
    }

    const { code, comment } = splitInlineComment(line);
    const content = code.trim();

    if (!content) {
      current.tokens.push({ kind: 'raw', raw: line });
      continue;
    }

    current.tokens.push({
      kind: 'text',
      raw: line,
      content,
      inlineComment: comment || undefined
    });
  }

  for (const node of nodes) {
    node.originalText = node.tokens
      .filter((token): token is Extract<BodyToken, { kind: 'text' }> => token.kind === 'text')
      .map((token) => token.content)
      .join('\n');
  }

  return { filename, preamble, nodes, newline };
}

function rewriteRawDestinations(raw: string, renameByOriginal: Map<string, string>) {
  const { code, comment } = splitInlineComment(raw);
  const rewritten = code.replace(/(>\s*)([^\s\[]+)/g, (full, prefix: string, label: string) => {
    const renamed = renameByOriginal.get(label.toLowerCase());
    return renamed ? `${prefix}${renamed}` : full;
  });

  return `${rewritten}${comment}`;
}

function sameEffects(a: SerializableInventoryEffect[], b: ParsedInventoryEffect[]) {
  return a.length === b.length && a.every((effect, index) =>
    effect.operation === b[index]?.operation && effect.item === b[index]?.item
  );
}

function serializeEffects(effects: SerializableInventoryEffect[]) {
  const tokens = effects
    .filter((effect) => effect.item.trim())
    .map((effect) => `${effect.operation === 'add' ? '+' : '-'}${effect.item.trim()}`);
  return tokens.length ? ` [${tokens.join(', ')}]` : '';
}

function serializeLoadedOption(option: SerializableOption, parsed: ParsedOption) {
  const sameText = option.text === parsed.originalText;
  const sameTarget = (option.targetLabel ?? '') === (parsed.originalTargetLabel ?? '');
  const sameInventoryEffects = sameEffects(option.effects, parsed.originalEffects);

  if (sameText && sameTarget && sameInventoryEffects) return parsed.raw;

  const destination = option.targetLabel ? ` > ${option.targetLabel}` : '';
  return `= ${option.text}${destination}${serializeEffects(option.effects)}${parsed.tail}`;
}

function sameItems(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function serializeLoadedCondition(condition: SerializableCondition, parsed: ParsedCondition) {
  const unchangedItems = sameItems(condition.items, parsed.originalItems);
  const unchangedTarget = (condition.targetLabel ?? '') === (parsed.originalTargetLabel ?? '');

  if (unchangedItems && unchangedTarget) return parsed.raw;

  const items = condition.items.filter(Boolean).map((item) => `?${item}`).join(' ');
  const destination = condition.targetLabel ? ` > ${condition.targetLabel}` : '';
  return `${items}${destination}${parsed.tail}`;
}

function serializeNewNode(node: SerializableNode): string[] {
  const lines = [`# ${node.title}`];
  const groups: string[][] = [];

  if (node.text) groups.push(node.text.split('\n'));

  if (node.conditions.length > 0) {
    groups.push(node.conditions.map((condition) => {
      const items = condition.items.filter(Boolean).map((item) => `?${item}`).join(' ');
      const destination = condition.targetLabel ? ` > ${condition.targetLabel}` : '';
      return `${items}${destination}`;
    }));
  }

  if (node.options.length > 0) {
    groups.push(node.options.map((option) => {
      const destination = option.targetLabel ? ` > ${option.targetLabel}` : '';
      return `= ${option.text}${destination}${serializeEffects(option.effects)}`;
    }));
  }

  groups.forEach((group, index) => {
    if (index > 0) lines.push('');
    lines.push(...group);
  });

  return lines;
}

export function serializeDialogueText(
  parsed: ParsedScript | null,
  currentNodes: SerializableNode[]
): string {
  const newline = parsed?.newline ?? '\n';

  if (!parsed) {
    const lines = ['@autor', ''];
    currentNodes.forEach((node, index) => {
      if (index > 0) lines.push('');
      lines.push(...serializeNewNode(node));
    });
    return lines.join(newline);
  }

  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  const parsedIds = new Set(parsed.nodes.map((node) => node.id));
  const renameByOriginal = new Map(
    parsed.nodes.map((node) => [
      node.originalTitle.toLowerCase(),
      currentById.get(node.id)?.title ?? node.originalTitle
    ])
  );
  const output = [...parsed.preamble];

  for (const parsedNode of parsed.nodes) {
    const current = currentById.get(parsedNode.id);
    if (!current) continue;

    const header = current.title === parsedNode.originalTitle
      ? parsedNode.rawHeader
      : `# ${current.title}${parsedNode.headerTail}`;

    output.push(header);

    const textChanged = current.text !== parsedNode.originalText;
    const currentOptions = new Map(current.options.map((option) => [option.id, option]));
    const currentConditions = new Map(current.conditions.map((condition) => [condition.id, condition]));
    const tokenOptionIds = new Set<string>();
    const tokenConditionIds = new Set<string>();
    let emittedChangedText = false;

    for (const token of parsedNode.tokens) {
      if (token.kind === 'raw') {
        output.push(rewriteRawDestinations(token.raw, renameByOriginal));
        continue;
      }

      if (token.kind === 'text') {
        if (!textChanged) {
          output.push(token.raw);
          continue;
        }

        if (!emittedChangedText) {
          if (current.text) output.push(...current.text.split('\n'));

          const preservedComments = parsedNode.tokens
            .filter((item): item is Extract<BodyToken, { kind: 'text' }> => item.kind === 'text' && Boolean(item.inlineComment))
            .map((item) => item.inlineComment as string);

          output.push(...preservedComments);
          emittedChangedText = true;
        }
        continue;
      }

      if (token.kind === 'condition') {
        tokenConditionIds.add(token.conditionId);
        const currentCondition = currentConditions.get(token.conditionId);
        const parsedCondition = parsedNode.conditions.find((condition) => condition.id === token.conditionId);

        if (currentCondition && parsedCondition) {
          output.push(serializeLoadedCondition(currentCondition, parsedCondition));
        }
        continue;
      }

      tokenOptionIds.add(token.optionId);
      const currentOption = currentOptions.get(token.optionId);
      const parsedOption = parsedNode.options.find((option) => option.id === token.optionId);

      if (currentOption && parsedOption) {
        output.push(serializeLoadedOption(currentOption, parsedOption));
      }
    }

    if (textChanged && !emittedChangedText && current.text) {
      output.push(...current.text.split('\n'));
    }

    for (const condition of current.conditions) {
      if (tokenConditionIds.has(condition.id)) continue;
      const items = condition.items.filter(Boolean).map((item) => `?${item}`).join(' ');
      const destination = condition.targetLabel ? ` > ${condition.targetLabel}` : '';
      output.push(`${items}${destination}`);
    }

    for (const option of current.options) {
      if (tokenOptionIds.has(option.id)) continue;
      const destination = option.targetLabel ? ` > ${option.targetLabel}` : '';
      output.push(`= ${option.text}${destination}${serializeEffects(option.effects)}`);
    }
  }

  const newNodes = currentNodes.filter((node) => !parsedIds.has(node.id));
  for (const node of newNodes) {
    if (output.length > 0 && output.at(-1) !== '') output.push('');
    output.push(...serializeNewNode(node));
  }

  return output.join(newline);
}
