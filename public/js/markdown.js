// Minimal markdown renderer with Zettelkasten extensions:
// [[wikilinks]] (with |alias), #tags, ==highlight==, task lists.
// Renders to HTML with all source text escaped first.
const Markdown = (() => {
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // resolveLink(target) -> note or null; injected by the app so the renderer
  // can mark existing vs. missing notes differently.
  let resolveLink = () => null;
  function setResolver(fn) { resolveLink = fn; }

  function inline(text) {
    // Protect code spans from further processing.
    const codes = [];
    text = text.replace(/`([^`\n]+)`/g, (_, c) => {
      codes.push(`<code>${c}</code>`);
      return `\u0000${codes.length - 1}\u0000`;
    });

    // Wikilinks: [[Target]] / [[Target|alias]]
    text = text.replace(/\[\[([^\]\[|\n]+)(?:\|([^\]\[\n]*))?\]\]/g, (_, target, alias) => {
      target = target.trim();
      const label = (alias || '').trim() || target;
      const note = resolveLink(target);
      const cls = note ? 'wikilink' : 'wikilink missing';
      const data = note ? note.id : target;
      return `<a class="${cls}" data-target="${data}" data-new="${note ? '' : '1'}">${label}</a>`;
    });

    // Images then links (http/https/# only).
    text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1">');
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Emphasis & friends.
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    text = text.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

    // Tags: #tag (letters/digits/_/-//), not inside a word.
    text = text.replace(/(^|[\s(>])#([\p{L}\p{N}_\/-]+)/gu,
      '$1<a class="tag-link" data-tag="$2">#$2</a>');

    // Restore code spans.
    text = text.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
    return text;
  }

  function render(md) {
    const lines = (md || '').split('\n');
    const out = [];
    let i = 0;
    let taskIndex = -1; // running index of task-list items, for click-to-toggle
    let listStack = []; // 'ul' | 'ol'

    const closeLists = (depth = 0) => {
      while (listStack.length > depth) out.push(`</${listStack.pop()}>`);
    };

    while (i < lines.length) {
      let raw = lines[i];

      // Fenced code block
      const fence = raw.match(/^```(\w*)\s*$/);
      if (fence) {
        closeLists();
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++; // skip closing fence
        out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
        continue;
      }

      const line = escapeHtml(raw);

      // Heading
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeLists();
        out.push(`<h${h[1].length} dir="auto">${inline(h[2])}</h${h[1].length}>`);
        i++; continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        closeLists();
        out.push('<hr>');
        i++; continue;
      }

      // Blockquote (consume the run)
      if (/^&gt;\s?/.test(line)) {
        closeLists();
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buf.push(inline(escapeHtml(lines[i]).replace(/^&gt;\s?/, '')));
          i++;
        }
        out.push(`<blockquote dir="auto">${buf.join('<br>')}</blockquote>`);
        continue;
      }

      // List item (2 spaces per nesting level)
      const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1;
        const kind = /[-*+]/.test(li[2]) ? 'ul' : 'ol';
        while (listStack.length > depth) out.push(`</${listStack.pop()}>`);
        while (listStack.length < depth) { listStack.push(kind); out.push(`<${kind}>`); }
        let body = li[3];
        const task = body.match(/^\[( |x|X)\]\s+(.*)$/);
        if (task) {
          taskIndex++;
          const checked = task[1].toLowerCase() === 'x';
          out.push(`<li class="task" dir="auto"><input type="checkbox" data-task="${taskIndex}" ${checked ? 'checked' : ''}> <span${checked ? ' class="done"' : ''}>${inline(task[2])}</span></li>`);
        } else {
          out.push(`<li dir="auto">${inline(body)}</li>`);
        }
        i++; continue;
      }

      // Blank line
      if (/^\s*$/.test(line)) {
        closeLists();
        i++; continue;
      }

      // Paragraph (consume the run of plain lines)
      closeLists();
      const buf = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,6}\s|```|>|(\s*([-*+]|\d+[.)])\s)|(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i])) {
        buf.push(escapeHtml(lines[i]));
        i++;
      }
      out.push(`<p dir="auto">${buf.map(inline).join('<br>')}</p>`);
    }
    closeLists();
    return out.join('\n');
  }

  // Toggle the Nth task checkbox in the raw markdown source.
  function toggleTask(md, index) {
    let n = -1;
    return md.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/gm, (m, pre, state) => {
      n++;
      if (n !== index) return m;
      return pre + (state === ' ' ? '[x]' : '[ ]');
    });
  }

  return { render, setResolver, toggleTask, escapeHtml };
})();
