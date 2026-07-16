"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200"
      style={{
        color: copied ? "var(--green)" : "var(--text-faint)",
        backgroundColor: copied ? "var(--green-dim)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!copied) e.currentTarget.style.backgroundColor = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!copied) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {copied ? (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h1 style={{ color: "var(--text-primary)" }} className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ color: "var(--text-primary)" }} className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ color: "var(--text-secondary)" }} className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h3>
  ),

  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),

  strong: ({ children }) => (
    <strong style={{ color: "var(--text-primary)" }} className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: "var(--text-secondary)" }} className="italic">{children}</em>
  ),

  ul: ({ children }) => (
    <ul className="mb-2 last:mb-0 space-y-1 pl-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 last:mb-0 space-y-1 pl-1 list-none counter-reset-[list-counter]"
      style={{ counterReset: "list-counter" }}
    >
      {children}
    </ol>
  ),
  li: ({ children, node }) => {
    // Detect if parent is an <ol> by checking if ordered prop exists
    const parentTag = node?.position ? undefined : undefined; // Not available in react-markdown
    // Instead, check if the node's parent is OL by looking for list counter styles
    // We use a data attribute approach: ol sets a class, li checks for it
    // Simpler approach: always render both, hide one via CSS

    // Check if this li is inside an ordered list
    // We can detect this because ol has counter-reset style
    // Fallback: always show bullet for ul, number for ol
    // react-markdown passes `ordered` via the list component context
    // but the li component doesn't get it directly.
    // Use a workaround: check if children has ordered number prefix
    return (
      <li
        className="flex gap-2 items-start markdown-li"
        style={{ counterIncrement: "list-counter" }}
      >
        <span
          className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0 markdown-bullet"
          style={{ backgroundColor: "var(--brand)" }}
        />
        <span
          className="mt-[1px] text-xs font-semibold flex-shrink-0 markdown-number"
          style={{ color: "var(--brand)", display: "none", minWidth: "16px" }}
        />
        <span className="flex-1">{children}</span>
      </li>
    );
  },

  code: ({ className, children }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded-md font-mono text-[0.85em]"
          style={{
            backgroundColor: "var(--bg-raised)",
            color: "var(--brand-text)",
            border: "1px solid var(--border-muted)",
          }}
        >
          {children}
        </code>
      );
    }
    const language = className?.replace("language-", "") || "";
    const codeText = String(children).replace(/\n$/, "");
    return (
      <div
        className="my-3 rounded-xl overflow-hidden group/code"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <div
          className="px-3 py-1.5 flex items-center justify-between"
          style={{ backgroundColor: "var(--bg-raised)", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span className="text-[10px] font-mono uppercase font-medium" style={{ color: "var(--text-faint)" }}>
            {language || "code"}
          </span>
          <CopyButton text={codeText} />
        </div>
        <pre className="p-4 overflow-x-auto" style={{ backgroundColor: "var(--bg-panel)" }}>
          <code className="text-xs font-mono leading-relaxed" style={{ color: "var(--text-secondary)" }}>{children}</code>
        </pre>
      </div>
    );
  },
  pre: ({ children }) => <>{children}</>,

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 transition-colors break-all"
      style={{ color: "var(--brand-text)" }}
    >
      {children}
    </a>
  ),

  blockquote: ({ children }) => (
    <blockquote
      className="my-2 pl-3 italic"
      style={{
        borderLeft: "2px solid var(--brand)",
        color: "var(--text-muted)",
        opacity: 0.8,
      }}
    >
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-3" style={{ borderColor: "var(--border-subtle)" }} />,

  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border-subtle)" }}>
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ backgroundColor: "var(--bg-raised)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-secondary)" }}>{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{children}</td>
  ),
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <style>{`
        ol.counter-reset-\\[list-counter\\] > .markdown-li .markdown-bullet,
        .markdown-body ol > .markdown-li .markdown-bullet { display: none !important; }
        ol.counter-reset-\\[list-counter\\] > .markdown-li .markdown-number,
        .markdown-body ol > .markdown-li .markdown-number { display: inline-block !important; }
        ol.counter-reset-\\[list-counter\\] > .markdown-li .markdown-number::before,
        .markdown-body ol > .markdown-li .markdown-number::before {
          content: counter(list-counter) ".";
          color: var(--brand);
        }
      `}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
