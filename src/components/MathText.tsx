"use client";

// Renders text that may contain LaTeX math alongside plain prose.
// Supported delimiters: $...$ and \(...\) for inline math, $$...$$ and
// \[...\] for display math. Everything else is rendered as plain text.
// Invalid LaTeX renders as an error marker instead of throwing.

import { useMemo } from "react";
import katex from "katex";

type Token = { type: "text" | "inline" | "display"; value: string };

const ESCAPE_HTML = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function findDelimiterEnd(input: string, from: number, delimiter: string): number {
  let i = from;
  while (i < input.length) {
    if (input[i] === "\\") {
      i += 2;
      continue;
    }
    if (input.startsWith(delimiter, i)) return i;
    i += 1;
  }
  return -1;
}

/** Split source text into plain/math tokens (exported for import previews). */
export function parseMath(input: string): Token[] {
  const tokens: Token[] = [];
  let text = "";
  let i = 0;

  const flush = () => {
    if (text) tokens.push({ type: "text", value: text });
    text = "";
  };

  while (i < input.length) {
    const ch = input[i];

    // \( ... \) and \[ ... \]
    if (ch === "\\" && i + 1 < input.length) {
      const next = input[i + 1];
      if (next === "(" || next === "[") {
        const closer = next === "(" ? "\\)" : "\\]";
        const end = input.indexOf(closer, i + 2);
        if (end !== -1) {
          const value = input.slice(i + 2, end);
          if (value.trim()) {
            flush();
            tokens.push({ type: next === "(" ? "inline" : "display", value });
            i = end + 2;
            continue;
          }
        }
      }
      text += ch + next;
      i += 2;
      continue;
    }

    // $ ... $ and $$ ... $$
    if (ch === "$") {
      const display = input[i + 1] === "$";
      const delimiter = display ? "$$" : "$";
      const open = i + delimiter.length;
      const end = findDelimiterEnd(input, open, delimiter);
      if (end !== -1) {
        const value = input.slice(open, end);
        // Single-$ math must not start/end with whitespace so currency
        // like "$5 each" stays plain text.
        if (value.trim() && (display || (!/^\s/.test(value) && !/\s$/.test(value)))) {
          flush();
          tokens.push({ type: display ? "display" : "inline", value });
          i = end + delimiter.length;
          continue;
        }
      }
    }

    text += ch;
    i += 1;
  }
  flush();
  return tokens;
}

function renderMath(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
      output: "htmlAndMathml",
    });
  } catch {
    return ESCAPE_HTML(value);
  }
}

export default function MathText({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  const source = children ?? "";
  const tokens = useMemo(() => {
    if (!source.includes("$") && !source.includes("\\(") && !source.includes("\\[")) return null;
    return parseMath(source);
  }, [source]);

  if (!tokens) return <span className={className}>{source}</span>;

  return (
    <span className={className}>
      {tokens.map((token, i) =>
        token.type === "text" ? (
          <span key={i}>{token.value}</span>
        ) : (
          <span
            key={i}
            className={token.type === "display" ? "my-2 block overflow-x-auto text-center" : ""}
            dangerouslySetInnerHTML={{ __html: renderMath(token.value, token.type === "display") }}
          />
        )
      )}
    </span>
  );
}
