/** Turn AI text into readable paragraphs and lists. React keeps all supplied text escaped. */
import type { ReactNode } from "react";
import "../styles/ai-text.css";

export function AiText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index++;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith("```"))
        code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(
        <pre key={blocks.length}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      blocks.push(
        <h4 key={blocks.length}>{inline(line.replace(/^#{1,6}\s+/, ""))}</h4>,
      );
      index++;
      continue;
    }
    const bullet = /^([-*•]|\d+[.)])\s+/.exec(line);
    if (bullet) {
      const ordered = /^\d/.test(bullet[1]);
      const entries: ReactNode[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = /^([-*•]|\d+[.)])\s+/.exec(current);
        if (!match || /^\d/.test(match[1]) !== ordered) break;
        entries.push(
          <li key={entries.length}>
            {inline(current.slice(match[0].length))}
          </li>,
        );
        index++;
      }
      blocks.push(
        ordered ? (
          <ol key={blocks.length}>{entries}</ol>
        ) : (
          <ul key={blocks.length}>{entries}</ul>
        ),
      );
      continue;
    }
    const paragraph = [line];
    index++;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6}\s|```|[-*•]\s|\d+[.)]\s)/.test(lines[index].trim())
    )
      paragraph.push(lines[index++].trim());
    for (const chunk of readableParagraphs(paragraph.join(" "))) {
      blocks.push(<p key={blocks.length}>{inline(chunk)}</p>);
    }
  }
  return <div className={`ai-text ${className}`}>{blocks}</div>;
}

// Support simple emphasis and code names without interpreting HTML or executing links.
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") && part.endsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

// Add paragraph breaks at sentence endings in old dense answers, without rewriting any words.
function readableParagraphs(text: string): string[] {
  if (text.length <= 420) return [text];
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/);
  const result: string[] = [];
  let paragraph = "";
  for (const sentence of sentences) {
    if (paragraph && paragraph.length + sentence.length > 420) {
      result.push(paragraph);
      paragraph = "";
    }
    paragraph += (paragraph ? " " : "") + sentence;
  }
  if (paragraph) result.push(paragraph);
  return result;
}
