export type ParsedOption = {
  id: string;
  text: string;
  targetLabel?: string;
  originalText: string;
  originalTargetLabel?: string;
  raw: string;
  tail: string;
};

export type BodyToken =
  | { kind: 'text'; raw: string; content: string; inlineComment?: string }
  | { kind: 'option'; optionId: string }
  | { kind: 'raw'; raw: string };

export type ParsedNode = {
  id: string;
  title: string;
  originalTitle: string;
  rawHeader: string;
  headerTail: string;
  originalText: string;
  options: ParsedOption[];
  tokens: BodyToken[];
};

export type ParsedScript = {
  filename: string;
  preamble: string[];
  nodes: ParsedNode[];
  newline: '\n' | '\r\n';
};

export type SerializableOption = {
  id: string;
  text: string;
  targetLabel?: string;
};

export type SerializableNode = {
  id: string;
  title: string;
  text: string;
  options: SerializableOption[];
};

function splitInlineComment(line: string) {
  const index = line.indexOf("'");
  if (index < 0) {
    return { code: line, comment: '' };
  }

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

function parseOptionLine(line: string, id: string): ParsedOption {
  const { code, comment } = splitInlineComment(line);
  const afterEquals = code.replace(/^\s*=\s*/, '');
  const jumpIndex = afterEquals.indexOf('>');

  let textPart = afterEquals;
  let targetLabel: string | undefined;
  let tailBeforeComment = '';

  if (jumpIndex >= 0) {
    textPart = afterEquals.slice(0, jumpIndex);
    const destinationPart = afterEquals.slice(jumpIndex + 1).trimStart();
    const destinationMatch = destinationPart.match(/^([^\s\[]+)(.*)$/);

    if (destinationMatch) {
      targetLabel = destinationMatch[1];
      tailBeforeComment = destinationMatch[2] ?? '';
    }
  } else {
    const effectMatch = textPart.match(/^(.*?)(\s*\[[^\]]*\]\s*)$/);
    if (effectMatch) {
      textPart = effectMatch[1];
      tailBeforeComment = effectMatch[2];
    }
  }

  const text = textPart.trim();
  const tail = `${tailBeforeComment}${comment}`;

  return {
    id,
    text,
    targetLabel,
    originalText: text,
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

    if (
      trimmed === '' ||
      trimmed.startsWith("'") ||
      trimmed.startsWith('?') ||
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

function serializeLoadedOption(option: SerializableOption, parsed: ParsedOption) {
  const sameText = option.text === parsed.originalText;
  const sameTarget = (option.targetLabel ?? '') === (parsed.originalTargetLabel ?? '');

  if (sameText && sameTarget) {
    return parsed.raw;
  }

  const destination = option.targetLabel ? ` > ${option.targetLabel}` : '';
  return `= ${option.text}${destination}${parsed.tail}`;
}

function serializeNewNode(node: SerializableNode): string[] {
  const lines = [`# ${node.title}`];

  if (node.text) {
    lines.push(...node.text.split('\n'));
  }

  if (node.options.length > 0) {
    if (node.text) lines.push('');
    for (const option of node.options) {
      const destination = option.targetLabel ? ` > ${option.targetLabel}` : '';
      lines.push(`= ${option.text}${destination}`);
    }
  }

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
    const tokenOptionIds = new Set<string>();
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

    for (const option of current.options) {
      if (tokenOptionIds.has(option.id)) continue;
      const destination = option.targetLabel ? ` > ${option.targetLabel}` : '';
      output.push(`= ${option.text}${destination}`);
    }
  }

  const newNodes = currentNodes.filter((node) => !parsedIds.has(node.id));
  for (const node of newNodes) {
    if (output.length > 0 && output.at(-1) !== '') output.push('');
    output.push(...serializeNewNode(node));
  }

  return output.join(newline);
}
