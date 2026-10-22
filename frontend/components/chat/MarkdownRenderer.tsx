"use client";

import { Children, isValidElement, memo, useEffect, useRef, useState, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors duration-150"
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

  ul: ({ children }) => <ul className="reply-list unordered">{children}</ul>,
  ol: ({ children, start }) => <ol start={start} className="reply-list ordered">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,

  code: ({ children }) => <code className="reply-inline-code">{children}</code>,
  pre: ({ children }) => {
    // The pre element, not a language class, identifies a code block.
    // Unlabelled and still-streaming fences must retain their whitespace too.
    const code = Children.toArray(children).find(isValidElement) as ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;
    const text = String(code?.props.children ?? "").replace(/\n$/, "");
    const language = code?.props.className?.replace("language-", "") || "code";
    return <div className="reply-code-block">
      <div className="reply-code-heading"><span>{language}</span><CopyButton text={text}/></div>
      <pre tabIndex={0} aria-label={`${language} code`}><code>{code?.props.children ?? children}</code></pre>
    </div>;
  },

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

const remarkPlugins = [remarkGfm];

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
