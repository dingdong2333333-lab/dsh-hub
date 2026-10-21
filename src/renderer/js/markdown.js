/** Minimal, dependency-free Markdown renderer for Skill and README previews. */
import { escapeHtml } from './ui.js';

export function renderMarkdown(markdown) {
  let text = String(markdown || '').replace(/\r\n?/g, '\n');
  const codeBlocks = [];
  text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const token = `\u0000CODE${codeBlocks.length}\u0000`;
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang.trim() || 'text')}">${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`);
    return `\n${token}\n`;
  });

  const lines = escapeHtml(text).split('\n');
  const html = [];
  let inUl = false;
  let inOl = false;
  let paragraph = [];

  const closeList = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeBlocks = () => { flushParagraph(); closeList(); };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) { closeBlocks(); continue; }
    const codeMatch = /^\u0000CODE(\d+)\u0000$/.exec(line.trim());
    if (codeMatch) {
      closeBlocks();
      html.push(codeBlocks[Number(codeMatch[1])] || '');
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      closeBlocks();
      const level = Math.min(line.match(/^#+/)[0].length, 6);
      html.push(`<h${level}>${inline(line.replace(/^#{1,6}\s+/, ''))}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeBlocks();
      html.push('<hr>');
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeBlocks();
      html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    const ulMatch = /^[-*+]\s+(.*)$/.exec(line);
    if (ulMatch) {
      flushParagraph();
      if (!inUl) { closeList(); html.push('<ul>'); inUl = true; }
      html.push(`<li>${inline(ulMatch[1])}</li>`);
      continue;
    }
    const olMatch = /^\d+[.)]\s+(.*)$/.exec(line);
    if (olMatch) {
      flushParagraph();
      if (!inOl) { closeList(); html.push('<ol>'); inOl = true; }
      html.push(`<li>${inline(olMatch[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  closeBlocks();
  return html.join('\n');
}

function inline(input) {
  let text = input;
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
    return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  return text;
}
