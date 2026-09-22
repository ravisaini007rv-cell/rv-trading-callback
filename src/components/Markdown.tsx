"use client";

import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import Mermaid from "./Mermaid";

function CopyButton({ getText }: { getText: () => string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--text)]"
    >
      {done ? "Copied ✓" : "Copy"}
    </button>
  );
}

function extractText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  const el = node as { props?: { children?: unknown } };
  if (el.props?.children !== undefined) return extractText(el.props.children);
  return "";
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre({ children }) {
            const code = extractText(children);
            const language =
              (children as { props?: { className?: string } } | undefined)?.props
                ?.className?.match(/language-([\w+-]+)/)?.[1] ?? "";
            if (language === "mermaid") return <Mermaid chart={code} />;
            const lang =
              (children as { props?: { className?: string } } | undefined)?.props
                ?.className?.match(/language-([\w+-]+)/)?.[1] ?? "code";
            return (
              <div className="my-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[#0d1117]">
                <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel-2)] px-3 py-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    {lang}
                  </span>
                  <CopyButton getText={() => code} />
                </div>
                <pre>{children}</pre>
              </div>
            );
          },
          a(props) {
            return <a {...props} target="_blank" rel="noreferrer" />;
          },
          img(props) {
            return (
              <img
                {...props}
                alt={props.alt ?? ""}
                className="max-h-96 rounded-xl border border-[var(--line)]"
              />
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
