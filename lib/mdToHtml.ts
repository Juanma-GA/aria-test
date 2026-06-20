export function mdToHtml(md: string): string {
  const inline = (text: string) =>
    text
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

  const lines = md.split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableHasHead = false;

  const closeList = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
      tableHasHead = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    // Detect table row (lenient: only require starting |)
    const isTableRow = t.startsWith('|') && t.length > 1;
    const isTableSep = /^\|[\s|:-]+\|?$/.test(t);

    // Close open structures when context changes
    if (!isTableRow && !isTableSep) closeTable();
    if (!t.startsWith('- ') && !t.startsWith('* ')) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
    }
    if (!/^\d+\.\s/.test(t)) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
    }

    if (t.startsWith('#### ')) {
      out.push(`<h4>${inline(t.slice(5))}</h4>`);
    } else if (t.startsWith('### ')) {
      out.push(`<h3>${inline(t.slice(4))}</h3>`);
    } else if (t.startsWith('## ')) {
      out.push(`<h2>${inline(t.slice(3))}</h2>`);
    } else if (t.startsWith('# ')) {
      out.push(`<h1>${inline(t.slice(2))}</h1>`);
    } else if (t === '---' || t === '***' || t === '___') {
      out.push('<hr>');
    } else if (t.startsWith('> ')) {
      out.push(`<blockquote>${inline(t.slice(2))}</blockquote>`);
    } else if (t.startsWith('- ') || t.startsWith('* ')) {
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inline(t.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(t)) {
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inline(t.replace(/^\d+\.\s/, ''))}</li>`);
    } else if (isTableSep) {
      // skip separator line (already handled header)
    } else if (isTableRow) {
      const rowContent = t.endsWith('|') ? t.slice(1, -1) : t.slice(1);
      const cells = rowContent
        .split('|')
        .map((c) => c.trim())
        .filter((c, idx, arr) => !(idx === arr.length - 1 && c === ''));
      const nextLine = lines[i + 1]?.trim() ?? '';
      const nextIsSep = /^\|[\s|:-]+\|?$/.test(nextLine);

      if (nextIsSep && !inTable) {
        // header row
        out.push('<table>');
        out.push(
          '<thead><tr>' +
            cells.map((c) => `<th>${inline(c)}</th>`).join('') +
            '</tr></thead>',
        );
        out.push('<tbody>');
        inTable = true;
        tableHasHead = true;
        i++; // skip sep line
      } else {
        if (!inTable) {
          out.push('<table><tbody>');
          inTable = true;
        }
        out.push(
          '<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>',
        );
      }
    } else if (t === '') {
      out.push('');
    } else {
      out.push(`<p>${inline(t)}</p>`);
    }
  }

  closeList();
  closeTable();

  return out.join('\n');
}
