import DOMPurify from 'dompurify';
import katex from 'katex';
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: false
});

const CODE_PLACEHOLDER_PREFIX = '@@INTELLIGEN_CODE_';
const MATH_PLACEHOLDER_PREFIX = '@@INTELLIGEN_MATH_';
const HTML_BREAK_PLACEHOLDER_PREFIX = '@@INTELLIGEN_BR_';
const ALLOWED_BLOCK_ENVIRONMENTS = new Set([
  'aligned',
  'align',
  'align*',
  'cases',
  'matrix',
  'pmatrix',
  'bmatrix',
  'vmatrix',
  'Vmatrix',
  'equation',
  'equation*',
  'gather',
  'gather*'
]);

const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`\n]+`/g;
const DISPLAY_DOLLAR_PATTERN = /\$\$([\s\S]+?)\$\$/g;
const DISPLAY_BRACKET_PATTERN = /\\\[([\s\S]+?)\\\]/g;
const INLINE_PAREN_PATTERN = /\\\(([\s\S]+?)\\\)/g;
const INLINE_DOLLAR_PATTERN = /(^|[^\\])\$((?:\\\$|[^$\n])+?)\$/gm;
const BLOCK_ENVIRONMENT_PATTERN = /\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\1\}/g;
const HTML_BREAK_PATTERN = /<br\s*\/?>/gi;
const STRONG_MARKER_PATTERN = /\*\*([^*\n][^*\n]*?)\*\*/g;
const UNDERSCORE_STRONG_MARKER_PATTERN = /__([^_\n][^_\n]*?)__/g;
const LABELED_LIST_ITEM_PATTERN = /^(\s*)(?:[-*+]|\d+[.)])\s+(\*\*[^*\n]+?\*\*)(.*)$/;
const UNORDERED_LIST_ITEM_PATTERN = /^[-*+]\s+/;
const ORDERED_LIST_ITEM_PATTERN = /^\d+[.)]\s+/;

function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true }
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeDocumentSource(source) {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/\uFF04/g, '$')
    .replace(/\uFF3C/g, '\\')
    .replace(/\u2212/g, '-');
}

function createPlaceholder(prefix, index) {
  return `${prefix}${index}@@`;
}

function protectSegments(source, pattern, segments, prefix) {
  return source.replace(pattern, (match) => {
    const placeholder = createPlaceholder(prefix, segments.length);
    segments.push(match);
    return placeholder;
  });
}

function restoreSegments(source, segments, prefix) {
  let restored = source;
  segments.forEach((segment, index) => {
    restored = restored.split(createPlaceholder(prefix, index)).join(segment);
  });
  return restored;
}

function normalizeMathExpression(expression) {
  return expression
    .replace(/\u00A0/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/^\s+|\s+$/g, '')
    .replace(/^\{\}(?=[_^])/g, '')
    .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
    .replace(/\\text\s+\{/g, '\\text{')
    .replace(/\\mathrm\s+\{/g, '\\mathrm{')
    .replace(/\s+([_^])/g, '$1')
    .replace(/([_^])\s+\{/g, '$1{')
    .replace(/\s+\}/g, '}')
    .replace(/\{\s+/g, '{');
}

function createMathPlaceholder(expression, displayMode, mathSegments) {
  const placeholder = createPlaceholder(MATH_PLACEHOLDER_PREFIX, mathSegments.length);
  mathSegments.push({
    placeholder,
    expression: normalizeMathExpression(expression),
    displayMode
  });
  return placeholder;
}

function protectHtmlBreaks(source, htmlBreakSegments) {
  return source.replace(HTML_BREAK_PATTERN, () => {
    const placeholder = createPlaceholder(HTML_BREAK_PLACEHOLDER_PREFIX, htmlBreakSegments.length);
    htmlBreakSegments.push('<br />');
    return placeholder;
  });
}

function restoreHtmlBreaks(html, htmlBreakSegments) {
  let restored = html;
  htmlBreakSegments.forEach((segment, index) => {
    restored = restored.split(createPlaceholder(HTML_BREAK_PLACEHOLDER_PREFIX, index)).join(segment);
  });
  return restored;
}

function countLeadingWhitespace(value) {
  let count = 0;
  while (count < value.length && /\s/.test(value[count])) {
    count += 1;
  }
  return count;
}

function stripOneIndentLevel(value) {
  if (value.startsWith('\t')) {
    return value.slice(1);
  }
  if (value.startsWith('  ')) {
    return value.slice(2);
  }
  if (value.startsWith(' ')) {
    return value.slice(1);
  }
  return value;
}

function normalizeListStructure(source) {
  const lines = source.split('\n');
  const normalizedLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(LABELED_LIST_ITEM_PATTERN);
    if (!match) {
      normalizedLines.push(line);
      continue;
    }

    const [, indentation, label, tail] = match;
    const baseIndent = indentation.length;
    const normalizedTail = tail.trimStart();
    const normalizedLabelLine = `${indentation}${label}${normalizedTail ? ` ${normalizedTail}` : ''}`;

    if (normalizedLines.length > 0 && normalizedLines.at(-1) !== '') {
      normalizedLines.push('');
    }
    normalizedLines.push(normalizedLabelLine);

    const nestedLines = [];
    let nextIndex = index + 1;
    while (nextIndex < lines.length) {
      const nextLine = lines[nextIndex];
      if (!nextLine.trim()) {
        break;
      }
      if (countLeadingWhitespace(nextLine) <= baseIndent) {
        break;
      }
      nestedLines.push(stripOneIndentLevel(nextLine));
      nextIndex += 1;
    }

    if (nestedLines.length > 0) {
      normalizedLines.push('');
      normalizedLines.push(...nestedLines);
      if (nextIndex < lines.length && lines[nextIndex].trim()) {
        normalizedLines.push('');
      }
      index = nextIndex - 1;
      continue;
    }

    const followingLine = lines[index + 1];
    if (followingLine && followingLine.trim()) {
      normalizedLines.push('');
    }
  }

  return normalizedLines.join('\n');
}

function normalizeStrongMarkers(source) {
  return source
    .replace(STRONG_MARKER_PATTERN, (_, content) => `<strong>${content.trim()}</strong>`)
    .replace(UNDERSCORE_STRONG_MARKER_PATTERN, (_, content) => `<strong>${content.trim()}</strong>`);
}

function extractBlockMath(source, mathSegments) {
  let nextSource = source.replace(DISPLAY_DOLLAR_PATTERN, (_, expression) =>
    createMathPlaceholder(expression, true, mathSegments)
  );

  nextSource = nextSource.replace(DISPLAY_BRACKET_PATTERN, (_, expression) =>
    createMathPlaceholder(expression, true, mathSegments)
  );

  nextSource = nextSource.replace(BLOCK_ENVIRONMENT_PATTERN, (match, environment) => {
    if (!ALLOWED_BLOCK_ENVIRONMENTS.has(environment)) {
      return match;
    }
    return createMathPlaceholder(match, true, mathSegments);
  });

  return nextSource;
}

function extractInlineMath(source, mathSegments) {
  let nextSource = source.replace(INLINE_PAREN_PATTERN, (_, expression) =>
    createMathPlaceholder(expression, false, mathSegments)
  );

  nextSource = nextSource.replace(INLINE_DOLLAR_PATTERN, (match, prefix, expression) =>
    `${prefix}${createMathPlaceholder(expression, false, mathSegments)}`
  );

  return nextSource;
}

function renderMathSegment(segment) {
  try {
    return katex.renderToString(segment.expression, {
      displayMode: segment.displayMode,
      throwOnError: true,
      strict: 'ignore',
      output: 'html'
    });
  } catch {
    return `<span class="report-math-fallback">${escapeHtml(segment.expression)}</span>`;
  }
}

function restoreMathSegments(html, mathSegments) {
  let nextHtml = html;

  mathSegments.forEach((segment) => {
    nextHtml = nextHtml.split(segment.placeholder).join(renderMathSegment(segment));
  });

  return nextHtml;
}

export function renderReportMarkdown(markdown) {
  const source = typeof markdown === 'string' ? markdown.trim() : '';
  if (!source) {
    return '';
  }

  const codeSegments = [];
  const mathSegments = [];
  const htmlBreakSegments = [];

  let normalizedSource = normalizeDocumentSource(source);
  normalizedSource = protectSegments(normalizedSource, FENCED_CODE_PATTERN, codeSegments, CODE_PLACEHOLDER_PREFIX);
  normalizedSource = protectSegments(normalizedSource, INLINE_CODE_PATTERN, codeSegments, CODE_PLACEHOLDER_PREFIX);
  normalizedSource = extractBlockMath(normalizedSource, mathSegments);
  normalizedSource = extractInlineMath(normalizedSource, mathSegments);
  normalizedSource = protectHtmlBreaks(normalizedSource, htmlBreakSegments);
  normalizedSource = normalizeListStructure(normalizedSource);
  normalizedSource = normalizeStrongMarkers(normalizedSource);
  normalizedSource = restoreSegments(normalizedSource, codeSegments, CODE_PLACEHOLDER_PREFIX);

  const rawHtml = marked.parse(normalizedSource);
  const sanitizedHtml = sanitizeHtml(rawHtml);
  const mathRestoredHtml = restoreMathSegments(sanitizedHtml, mathSegments);
  const breakRestoredHtml = restoreHtmlBreaks(mathRestoredHtml, htmlBreakSegments);

  return sanitizeHtml(breakRestoredHtml);
}
