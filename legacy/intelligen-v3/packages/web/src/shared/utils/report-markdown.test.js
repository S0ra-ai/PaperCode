import { describe, expect, it } from 'vitest';

import { renderReportMarkdown } from './report-markdown';

describe('renderReportMarkdown', () => {
  it('renders common report structures into HTML', () => {
    const html = renderReportMarkdown([
      '# Report Title',
      '',
      '## Findings',
      '',
      '- item 1',
      '- item 2',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |'
    ].join('\n'));

    expect(html).toContain('<h1>Report Title</h1>');
    expect(html).toContain('<h2>Findings</h2>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<table>');
  });

  it('renders inline and display formulas with katex', () => {
    const html = renderReportMarkdown([
      'Structure data: ${}^{1}\\text{H-NMR}$ and ${}^{29}\\text{Si-NMR}$ spectra.',
      '',
      '$$\\frac{G\'}{RT} = v_c$$'
    ].join('\n'));

    expect(html).toContain('class="katex"');
    expect(html).toContain('H-NMR');
    expect(html).toContain('Si-NMR');
    expect(html).not.toContain('${}^{1}\\text{H-NMR}$');
  });

  it('preserves formulas inside markdown tables', () => {
    const html = renderReportMarkdown([
      '| Metric | Formula |',
      '| --- | --- |',
      '| Crosslink density | $v_c = \\frac{G\'}{RT}$ |'
    ].join('\n'));

    expect(html).toContain('<table>');
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('\\frac{G\'}{RT}');
  });

  it('normalizes double-escaped latex commands before rendering', () => {
    const html = renderReportMarkdown('Permittivity is $\\\\varepsilon_r$ and loss is $\\\\tan\\\\delta$.');

    expect(html).toContain('class="katex"');
    expect(html).not.toContain('\\\\varepsilon_r');
    expect(html).not.toContain('\\\\tan\\\\delta');
  });

  it('does not render formulas inside code blocks or inline code', () => {
    const html = renderReportMarkdown([
      'Code sample: `$not_math$`',
      '',
      '```md',
      '$still_not_math$',
      '```'
    ].join('\n'));

    expect(html).toContain('<code>$not_math$</code>');
    expect(html).toContain('$still_not_math$');
    expect(html).not.toContain('class="katex"');
  });

  it('falls back gracefully when formula syntax is broken', () => {
    const html = renderReportMarkdown('Broken formula: $\\frac{a}{b$');

    expect(html).toContain('report-math-fallback');
    expect(html).toContain('\\frac{a}{b');
  });

  it('sanitizes unsafe html from the markdown body', () => {
    const html = renderReportMarkdown('Hello<script>alert(1)</script><img src=x onerror=alert(1) />');

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror=');
    expect(html).toContain('<p>Hello<img src="x"></p>');
  });

  it('does not leave literal strong markers in prose', () => {
    const html = renderReportMarkdown('为了确保产出可验证成果，需要形成研究的**“负面清单”(即不做什么) **。');

    expect(html).toContain('<strong>“负面清单”(即不做什么)</strong>');
    expect(html).not.toContain('**“负面清单”(即不做什么)**');
    expect(html).not.toContain('**“负面清单”(即不做什么) **');
  });

  it('normalizes labeled list items into cleaner report sections', () => {
    const html = renderReportMarkdown([
      '- **任务目标：** 基于前两年机理，提出抑制界面电荷积聚的改性方案并验证。',
      '- **使用数据：**',
      '  - 改性材料的电导率温度特性。',
      '  - 长时耐压试验数据。'
    ].join('\n'));

    expect(html).toContain('<p><strong>任务目标：</strong> 基于前两年机理，提出抑制界面电荷积聚的改性方案并验证。</p>');
    expect(html).toContain('<p><strong>使用数据：</strong></p>');
    expect(html).toContain('<ul>');
    expect(html).not.toContain('<li><strong>使用数据：</strong></li>');
  });

  it('restores html break tags instead of exposing them as code', () => {
    const html = renderReportMarkdown('| 维度 | 说明 |\n| --- | --- |\n| 使用数据 | 1. 结构数据<br>2. 流变数据 |');

    expect(html).toContain('<br');
    expect(html).not.toContain('&lt;br');
  });

  it('restores html break tags in report paragraphs instead of exposing them as raw code', () => {
    const html = renderReportMarkdown('第一步：建立样本库。<br>第二步：完成参数标定。<br/>第三步：验证边界条件。');

    expect(html).toContain('<br');
    expect(html).not.toContain('&lt;br');
    expect(html).not.toContain('&amp;lt;br');
  });

  it('keeps mixed real-world report fragments free of raw markdown artifacts', () => {
    const html = renderReportMarkdown([
      '为了确保项目在有限资助周期内产出可验证的成果，需要形成研究的**“负面清单”(即不做什么) **。',
      '',
      '- **使用数据：**',
      '  - 结构数据：${}^{1}\\text{H-NMR}$ 与 ${}^{29}\\text{Si-NMR}$ 谱图。',
      '  - 流变数据：储能模量 $G\'$ 与损耗模量 $G\'\'$ 曲线。<br>补充说明：用于计算交联密度 $v_c = \\frac{G\'}{RT}$。',
      '',
      '- **阶段性成果：** 形成一种抗界面空间电荷积聚的配方原型。'
    ].join('\n'));

    expect(html).not.toContain('**');
    expect(html).not.toContain('&lt;br');
    expect(html).toContain('<strong>“负面清单”(即不做什么)</strong>');
    expect(html).toContain('class="katex"');
    expect(html).toContain('<ul>');
    expect(html).toContain('<br');
  });
});
