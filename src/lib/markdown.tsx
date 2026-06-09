import type { ReactNode } from 'react';

/* ============================================================
   Lightweight inline markdown → React JSX renderer.
   Handles the subset produced by LLM responses:
     bold, italic, inline code, h1-h3, ul/ol, code blocks,
     tables, horizontal rules, blockquotes, paragraphs.
   No external dependencies.
   ============================================================ */

type Child = ReactNode;

/* ── Inline span rendering ──────────────────────────────── */

function renderInline(text: string): ReactNode[] {
  // Split on bold, italic, inline-code tokens.
  // Regex: **bold**, *italic*, `code`, [link](url)
  const INLINE =
    /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;

  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={m.index}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={m.index}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <code
          key={m.index}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875em',
            background: 'var(--surface-3)',
            padding: '1px 5px',
            borderRadius: 4,
            color: 'var(--secondary)',
          }}
        >
          {m[4]}
        </code>,
      );
    } else if (m[5] !== undefined && m[6] !== undefined) {
      nodes.push(
        <a
          key={m.index}
          href={m[6]}
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: 'var(--primary)', textDecoration: 'underline' }}
        >
          {m[5]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

/* ── Block rendering ─────────────────────────────────────── */

interface Block {
  type:
    | 'h1' | 'h2' | 'h3'
    | 'p'
    | 'ul' | 'ol'
    | 'code-block'
    | 'blockquote'
    | 'table'
    | 'hr';
  content: string;
  lang?: string;
  items?: string[];
  rows?: string[][];
  header?: string[];
}

function tokenize(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const flush = (pLines: string[]) => {
    const text = pLines.join(' ').trim();
    if (text) blocks.push({ type: 'p', content: text });
  };

  let para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block
    if (trimmed.startsWith('```')) {
      if (para.length) { flush(para); para = []; }
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code-block', content: codeLines.join('\n'), lang });
      i++;
      continue;
    }

    // HR
    if (/^[-*_]{3,}$/.test(trimmed)) {
      if (para.length) { flush(para); para = []; }
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Heading
    const hm = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (hm) {
      if (para.length) { flush(para); para = []; }
      const level = hm[1].length;
      blocks.push({
        type: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3',
        content: hm[2],
      });
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      if (para.length) { flush(para); para = []; }
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        bqLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', content: bqLines.join('\n') });
      continue;
    }

    // Table
    if (/^\|.+\|$/.test(trimmed)) {
      if (para.length) { flush(para); para = []; }
      const tableLines: string[] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const [headerLine, , ...dataLines] = tableLines;
      const parseCells = (l: string) =>
        l.slice(1, -1).split('|').map((c) => c.trim());
      blocks.push({
        type:   'table',
        content: '',
        header:  headerLine ? parseCells(headerLine) : [],
        rows:    dataLines.map(parseCells),
      });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      if (para.length) { flush(para); para = []; }
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s/, ''));
        i++;
      }
      blocks.push({ type: 'ul', content: '', items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(trimmed)) {
      if (para.length) { flush(para); para = []; }
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push({ type: 'ol', content: '', items });
      continue;
    }

    // Blank line → paragraph break
    if (!trimmed) {
      if (para.length) { flush(para); para = []; }
      i++;
      continue;
    }

    para.push(line);
    i++;
  }

  if (para.length) flush(para);
  return blocks;
}

/* ── React renderer ──────────────────────────────────────── */

const CODE_BLOCK_STYLE: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--glass-border)',
  borderRadius: 10,
  padding: '14px 16px',
  overflow: 'auto',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125em',
  lineHeight: 1.65,
  color: 'var(--sub)',
  whiteSpace: 'pre',
  margin: '12px 0',
};

const TABLE_STYLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.875em',
  margin: '10px 0',
};

const TH_STYLE: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '1px solid var(--glass-border-strong)',
  color: 'var(--sub)',
  whiteSpace: 'nowrap',
};

const TD_STYLE: React.CSSProperties = {
  padding: '7px 12px',
  borderBottom: '1px solid var(--glass-border)',
  verticalAlign: 'top',
};

function renderBlock(block: Block, idx: number): Child {
  switch (block.type) {
    case 'h1':
      return (
        <h2 key={idx} style={{ fontSize: '1.25em', fontWeight: 700, margin: '20px 0 8px' }}>
          {renderInline(block.content)}
        </h2>
      );
    case 'h2':
      return (
        <h3 key={idx} style={{ fontSize: '1.1em', fontWeight: 650, margin: '16px 0 6px' }}>
          {renderInline(block.content)}
        </h3>
      );
    case 'h3':
      return (
        <h4 key={idx} style={{ fontSize: '1em', fontWeight: 600, margin: '14px 0 5px' }}>
          {renderInline(block.content)}
        </h4>
      );
    case 'p':
      return (
        <p key={idx} style={{ margin: '6px 0', lineHeight: 1.7 }}>
          {renderInline(block.content)}
        </p>
      );
    case 'ul':
      return (
        <ul key={idx} style={{ margin: '8px 0', paddingLeft: 20, listStyleType: 'disc' }}>
          {block.items?.map((item, j) => (
            <li key={j} style={{ margin: '3px 0', lineHeight: 1.6 }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={idx} style={{ margin: '8px 0', paddingLeft: 22 }}>
          {block.items?.map((item, j) => (
            <li key={j} style={{ margin: '3px 0', lineHeight: 1.6 }}>
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
    case 'code-block':
      return (
        <pre key={idx} style={CODE_BLOCK_STYLE}>
          {block.content}
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote
          key={idx}
          style={{
            borderLeft: '3px solid var(--primary)',
            paddingLeft: 14,
            margin: '10px 0',
            color: 'var(--sub)',
            fontStyle: 'italic',
          }}
        >
          {renderInline(block.content)}
        </blockquote>
      );
    case 'table':
      return (
        <div key={idx} style={{ overflowX: 'auto', margin: '10px 0' }}>
          <table style={TABLE_STYLE}>
            {block.header && block.header.length > 0 && (
              <thead>
                <tr>
                  {block.header.map((h, j) => (
                    <th key={j} style={TH_STYLE}>
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows?.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={TD_STYLE}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return (
        <hr
          key={idx}
          style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '14px 0' }}
        />
      );
    default:
      return null;
  }
}

/* ── Public component ────────────────────────────────────── */

interface Props {
  content: string;
  /** When true, renders plain text without block parsing (for in-progress tokens). */
  inline?: boolean;
}

export function Markdown({ content, inline }: Props): React.ReactElement {
  if (inline) {
    return <>{renderInline(content)}</>;
  }
  const blocks = tokenize(content);
  return <>{blocks.map(renderBlock)}</>;
}
