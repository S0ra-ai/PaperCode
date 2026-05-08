import { renderReportMarkdown } from './report-markdown';

const REFERENCES_HEADING_PATTERN = /^#{1,3}\s*[\d.]*\s*(?:参考文献|references|bibliography)\s*$/gim;
const CITATION_PATTERN = /\[(\d+)\](?!\()/g;
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`\n]+`/g;
const SKIP_CITATION_TAGS = new Set(['A', 'BUTTON', 'CODE', 'PRE', 'SCRIPT', 'STYLE']);
const TEXT_NODE = 4;

function stripProtectedSegments(source) {
  return String(source || '')
    .replace(FENCED_CODE_PATTERN, ' ')
    .replace(INLINE_CODE_PATTERN, ' ');
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findLastReferencesHeading(markdown) {
  const source = String(markdown || '');
  let match = null;
  let nextMatch;

  REFERENCES_HEADING_PATTERN.lastIndex = 0;
  while ((nextMatch = REFERENCES_HEADING_PATTERN.exec(source)) !== null) {
    match = nextMatch;
  }

  if (!match) {
    return null;
  }

  return {
    raw: match[0],
    index: match.index
  };
}

function splitReportSections(markdown) {
  const source = String(markdown || '').trim();
  if (!source) {
    return [];
  }

  const parts = source.split(/(?=^# )/m).filter((part) => part.trim());
  if (!parts.length) {
    return [];
  }

  return parts.map((sectionMarkdown, index) => {
    const headingMatch = sectionMarkdown.match(/^#\s+(.+)$/m);
    return {
      index,
      heading: headingMatch?.[1]?.trim() || `章节 ${index + 1}`,
      markdown: sectionMarkdown.trim()
    };
  });
}

function collectCitationCounts(markdown) {
  const counts = {};
  const protectedSource = stripProtectedSegments(markdown);
  let match;

  CITATION_PATTERN.lastIndex = 0;
  while ((match = CITATION_PATTERN.exec(protectedSource)) !== null) {
    const number = Number(match[1]);
    counts[number] = (counts[number] || 0) + 1;
  }

  return counts;
}

function parseSourceYear(sourceYear) {
  const normalized = normalizeWhitespace(sourceYear).replace(/\.+$/, '');
  if (!normalized) {
    return { source: '', year: '' };
  }

  const yearMatch = normalized.match(/(?:^|,\s*)(\d{4}|N\/A)$/i);
  if (!yearMatch) {
    return { source: normalized, year: '' };
  }

  const year = yearMatch[1];
  const source = normalized
    .replace(new RegExp(`(?:,\\s*)?${escapeRegExp(year)}\\s*$`, 'i'), '')
    .replace(/[.,\s]+$/g, '')
    .trim();

  return {
    source,
    year: /^n\/a$/i.test(year) ? '' : year
  };
}

function parseReferenceBlock(block) {
  const normalizedBlock = String(block || '')
    .trim()
    .replace(/\r\n?/g, '\n');

  if (!normalizedBlock) {
    return null;
  }

  const headerMatch = normalizedBlock.match(/^\[(\d+)\]\s*([\s\S]+)$/);
  if (!headerMatch) {
    return null;
  }

  const number = Number(headerMatch[1]);
  const rawContent = normalizeWhitespace(headerMatch[2]);
  const urlMatch = rawContent.match(/(https?:\/\/\S+)\s*$/i);
  const url = urlMatch?.[1] || '';
  const contentWithoutUrl = normalizeWhitespace(
    url ? rawContent.slice(0, urlMatch.index) : rawContent
  ).replace(/\.+$/, '');
  const sentenceParts = contentWithoutUrl
    .split(/\.\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  let authors = '';
  let title = '';
  let sourceYear = '';

  if (sentenceParts.length >= 3) {
    const [firstPart, secondPart, ...remainingParts] = sentenceParts;
    authors = firstPart;
    title = secondPart;
    sourceYear = remainingParts.join('. ');
  } else if (sentenceParts.length === 2) {
    const [firstPart, secondPart] = sentenceParts;
    if (/\b\d{4}\b/.test(secondPart) || /,/.test(secondPart)) {
      title = firstPart;
      sourceYear = secondPart;
    } else {
      authors = firstPart;
      title = secondPart;
    }
  } else if (sentenceParts.length === 1) {
    title = sentenceParts[0];
  }

  const { source, year } = parseSourceYear(sourceYear);

  return {
    number,
    authors,
    title: title || contentWithoutUrl || `引用 [${number}]`,
    source,
    year,
    url,
    rawText: rawContent
  };
}

function ensureReferenceEntries(referenceEntries, citationCounts, sections) {
  const byNumber = new Map(referenceEntries.map((entry) => [entry.number, entry]));
  const numbers = new Set([
    ...Object.keys(citationCounts).map((value) => Number(value)),
    ...byNumber.keys()
  ]);

  return [...numbers]
    .sort((left, right) => left - right)
    .map((number) => {
      const usageCount = citationCounts[number] || 0;
      const sectionUsages = sections
        .filter((section) => section.citationCounts[number])
        .map((section) => ({
          index: section.index,
          heading: section.heading,
          count: section.citationCounts[number]
        }));
      const baseEntry = byNumber.get(number) || {
        number,
        authors: '',
        title: `引用 [${number}]`,
        source: '',
        year: '',
        url: '',
        rawText: '',
        missing: true
      };

      return {
        ...baseEntry,
        missing: Boolean(baseEntry.missing),
        usageCount,
        repeated: usageCount > 1,
        sectionUsages
      };
    });
}

function shouldSkipCitationReplacement(element) {
  let current = element;
  while (current) {
    if (SKIP_CITATION_TAGS.has(current.tagName)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function createCitationButton(number, { sectionIndex, sectionTitle, citationCounts, activeCitationNumber }) {
  const button = globalThis.document.createElement('button');
  button.type = 'button';
  button.className = 'workspace-preview-citation-chip';
  if ((citationCounts[number] || 0) > 1) {
    button.classList.add('workspace-preview-citation-chip-repeated');
  }
  if (Number(activeCitationNumber) === number) {
    button.classList.add('workspace-preview-citation-chip-active');
  }
  button.dataset.citationNumber = String(number);
  button.dataset.citationSectionIndex = String(sectionIndex);
  if (sectionTitle) {
    button.dataset.citationSectionTitle = sectionTitle;
  }
  button.setAttribute('aria-label', `查看引用 [${number}] 详情`);
  button.textContent = `[${number}]`;
  return button;
}

function injectCitationButtons(html, options) {
  if (!html || typeof globalThis.document === 'undefined') {
    return html;
  }

  const template = globalThis.document.createElement('template');
  template.innerHTML = html;

  const walker = globalThis.document.createTreeWalker(template.content, TEXT_NODE);
  const textNodes = [];
  let textNode;

  while ((textNode = walker.nextNode())) {
    if (!textNode.nodeValue?.includes('[')) {
      continue;
    }

    const parentElement = textNode.parentElement;
    if (!parentElement || shouldSkipCitationReplacement(parentElement)) {
      continue;
    }

    textNodes.push(textNode);
  }

  textNodes.forEach((node) => {
    const source = node.nodeValue || '';
    const fragment = globalThis.document.createDocumentFragment();
    let lastIndex = 0;
    let changed = false;
    let match;

    CITATION_PATTERN.lastIndex = 0;
    while ((match = CITATION_PATTERN.exec(source)) !== null) {
      const number = Number(match[1]);
      if (match.index > lastIndex) {
        fragment.append(globalThis.document.createTextNode(source.slice(lastIndex, match.index)));
      }

      fragment.append(createCitationButton(number, options));
      lastIndex = match.index + match[0].length;
      changed = true;
    }

    if (!changed) {
      return;
    }

    if (lastIndex < source.length) {
      fragment.append(globalThis.document.createTextNode(source.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  });

  return template.innerHTML;
}

export function parseReportEvidence(markdown) {
  const source = typeof markdown === 'string' ? markdown.trim() : '';
  if (!source) {
    return {
      bodyMarkdown: '',
      referencesHeading: '',
      referencesMarkdown: '',
      sections: [],
      references: [],
      citationCounts: {},
      totalCitationMentions: 0
    };
  }

  const referencesHeading = findLastReferencesHeading(source);
  const bodyMarkdown = (referencesHeading ? source.slice(0, referencesHeading.index) : source).trim();
  const referencesMarkdown = referencesHeading
    ? source.slice(referencesHeading.index + referencesHeading.raw.length).trim()
    : '';

  const sections = splitReportSections(bodyMarkdown).map((section) => {
    const citationCounts = collectCitationCounts(section.markdown);
    return {
      ...section,
      citationCounts,
      citationNumbers: Object.keys(citationCounts).map((value) => Number(value)),
      citationMentions: Object.values(citationCounts).reduce((sum, count) => sum + count, 0)
    };
  });

  const citationCounts = collectCitationCounts(bodyMarkdown);
  const referenceEntries = referencesMarkdown
    ? referencesMarkdown
      .split(/\n{2,}/)
      .map(parseReferenceBlock)
      .filter(Boolean)
    : [];

  return {
    bodyMarkdown,
    referencesHeading: referencesHeading?.raw?.replace(/^#{1,3}\s*/, '').trim() || '',
    referencesMarkdown,
    sections,
    references: ensureReferenceEntries(referenceEntries, citationCounts, sections),
    citationCounts,
    totalCitationMentions: Object.values(citationCounts).reduce((sum, count) => sum + count, 0)
  };
}

export function renderEvidenceSectionHtml(markdown, options = {}) {
  const html = renderReportMarkdown(markdown);
  return injectCitationButtons(html, options);
}
