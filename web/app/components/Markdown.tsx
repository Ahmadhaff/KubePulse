import { Fragment, ReactNode } from 'react';

/**
 * Tiny, dependency-free Markdown renderer for chat replies.
 * Supports: paragraphs, #/##/### headings, - / * / 1. lists, ``` code blocks,
 * **bold**, *italic* and `inline code`. Renders React elements only (no raw HTML).
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      const key = blocks.length;
      blocks.push(
        <p key={key}>
          {paragraph.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {renderInline(line)}
            </Fragment>
          ))}
        </p>,
      );
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      const key = blocks.length;
      const items = list.items.map((item, i) => <li key={i}>{renderInline(item)}</li>);
      blocks.push(list.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      list = null;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code) {
        blocks.push(
          <pre key={blocks.length}>
            <code>{code.join('\n')}</code>
          </pre>,
        );
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <p key={blocks.length} className="md-heading">
          {renderInline(heading[2])}
        </p>,
      );
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  if (code) {
    blocks.push(
      <pre key={blocks.length}>
        <code>{(code as string[]).join('\n')}</code>
      </pre>,
    );
  }
  flushParagraph();
  flushList();

  return <div className="markdown">{blocks}</div>;
}
