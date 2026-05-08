import { describe, expect, it } from 'vitest';

import { parseReportEvidence, renderEvidenceSectionHtml } from './report-evidence';

describe('parseReportEvidence', () => {
  it('extracts references and citation usage from report markdown', () => {
    const evidence = parseReportEvidence([
      '# 1 引言',
      '',
      '这里使用了核心综述 [1] 和方法来源 [2]。',
      '链接写法 [1](https://example.com) 不应被当成引用。',
      '代码片段 `忽略 [3]` 也不应计入。',
      '',
      '# 2 结果',
      '',
      '进一步分析再次引用 [1]。',
      '',
      '# 6 参考文献',
      '',
      '[1] LeCun Y, Bengio Y. Deep Learning Survey. Nature, 2015. https://doi.org/10.1234',
      '',
      '[2] Vaswani A. Attention Is All You Need. NeurIPS, 2017. https://arxiv.org/abs/1706.03762'
    ].join('\n'));

    expect(evidence.referencesHeading).toBe('6 参考文献');
    expect(evidence.totalCitationMentions).toBe(3);
    expect(evidence.sections).toHaveLength(2);
    expect(evidence.sections[0].citationNumbers).toEqual([1, 2]);
    expect(evidence.sections[1].citationNumbers).toEqual([1]);
    expect(evidence.references).toHaveLength(2);

    expect(evidence.references[0]).toMatchObject({
      number: 1,
      authors: 'LeCun Y, Bengio Y',
      title: 'Deep Learning Survey',
      source: 'Nature',
      year: '2015',
      url: 'https://doi.org/10.1234',
      usageCount: 2,
      repeated: true
    });
    expect(evidence.references[1]).toMatchObject({
      number: 2,
      title: 'Attention Is All You Need',
      source: 'NeurIPS',
      year: '2017',
      usageCount: 1
    });
  });

  it('creates a placeholder reference when the markdown body cites a missing entry', () => {
    const evidence = parseReportEvidence([
      '# 1 Summary',
      '',
      'Only one citation is visible here [4].'
    ].join('\n'));

    expect(evidence.references).toHaveLength(1);
    expect(evidence.references[0]).toMatchObject({
      number: 4,
      title: '引用 [4]',
      missing: true,
      usageCount: 1
    });
  });
});

describe('renderEvidenceSectionHtml', () => {
  it('wraps markdown citations in clickable chips while leaving code untouched', () => {
    const html = renderEvidenceSectionHtml('正文引用 [1]，代码 `忽略 [2]`。', {
      sectionIndex: 1,
      sectionTitle: '方法',
      citationCounts: { 1: 2 },
      activeCitationNumber: 1
    });

    expect(html).toContain('workspace-preview-citation-chip');
    expect(html).toContain('workspace-preview-citation-chip-repeated');
    expect(html).toContain('workspace-preview-citation-chip-active');
    expect(html).toContain('data-citation-number="1"');
    expect(html).toContain('data-citation-section-index="1"');
    expect(html).toContain('data-citation-section-title="方法"');
    expect(html).toContain('<code>忽略 [2]</code>');
    expect(html).not.toContain('data-citation-number="2"');
  });
});
