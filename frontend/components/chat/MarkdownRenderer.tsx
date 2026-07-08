"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
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
    <ol className="mb-2 last:mb-0 space-y-1 pl-1 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-2 items-start">
      <span className="mt-2 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--brand)" }} />
      <span className="flex-1">{children}</span>
    </li>
  ),

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
    return (
      <div
        className="my-2 rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        {language && (
          <div
            className="px-3 py-1"
            style={{ backgroundColor: "var(--bg-raised)", borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span className="text-[10px] font-mono uppercase" style={{ color: "var(--text-faint)" }}>{language}</span>
          </div>
        )}
        <pre className="p-3 overflow-x-auto" style={{ backgroundColor: "var(--bg-panel)" }}>
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
    <div className="my-2 overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border-subtle)" }}>
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
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
