/**
 * Minimal, dependency-free Markdown → HTML renderer for node descriptions.
 * Source is HTML-escaped first, so the only tags in the output are the ones
 * this function emits — safe to inject with dangerouslySetInnerHTML.
 *
 * Supported: headings, bold, italic, inline code, fenced code, links, images,
 * unordered/ordered lists, blockquotes, horizontal rules, paragraphs.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2" />')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let listType: 'ul' | 'ol' | '' = ''
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = '' } }

  while (i < lines.length) {
    const line = lines[i]

    // fenced code block
    if (/^```/.test(line)) {
      closeList()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(escapeHtml(lines[i])); i++ }
      i++ // closing fence
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`)
      continue
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }

    if (/^\s*([-*_])\1\1+\s*$/.test(line)) { closeList(); out.push('<hr/>'); i++; continue }

    const bq = /^>\s?(.*)$/.exec(line)
    if (bq) { closeList(); out.push(`<blockquote>${inline(bq[1])}</blockquote>`); i++; continue }

    const ul = /^\s*[-*+]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (ul || ol) {
      const t: 'ul' | 'ol' = ul ? 'ul' : 'ol'
      if (listType !== t) { closeList(); out.push(`<${t}>`); listType = t }
      out.push(`<li>${inline(ul ? ul[1] : ol![1])}</li>`)
      i++
      continue
    }

    if (/^\s*$/.test(line)) { closeList(); i++; continue }

    // paragraph: gather consecutive plain lines
    closeList()
    const para = [line]
    i++
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6}\s|>|```|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])
    ) { para.push(lines[i]); i++ }
    out.push(`<p>${para.map(inline).join('<br/>')}</p>`)
  }

  closeList()
  return out.join('\n')
}
