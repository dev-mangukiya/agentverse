"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
}

const components: Components = {
  // Headings
  h1: ({ children }) => (
    <h1 className="text-lg font-bold text-white mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold text-white mt-3 mb-1.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-zinc-200 mt-2.5 mb-1 first:mt-0">{children}</h3>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),

  // Bold & Italic
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-zinc-300">{children}</em>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="mb-2 last:mb-0 space-y-1 pl-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 last:mb-0 space-y-1 pl-1 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-2 items-start">
      <span className="mt-2 w-1 h-1 rounded-full bg-brand-400 flex-shrink-0" />
      <span className="flex-1">{children}</span>
    </li>
  ),

  // Code
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="px-1.5 py-0.5 rounded-md bg-white/[0.08] text-brand-300 font-mono text-[0.85em] border border-white/[0.06]">
          {children}
        </code>
      );
    }
    // Block code
    const language = className?.replace("language-", "") || "";
    return (
      <div className="my-2 rounded-xl overflow-hidden border border-white/[0.06]">
        {language && (
          <div className="px-3 py-1 bg-white/[0.04] border-b border-white/[0.06]">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">{language}</span>
          </div>
        )}
        <pre className="p-3 overflow-x-auto bg-[rgba(10,10,15,0.6)]">
          <code className="text-xs font-mono text-zinc-300 leading-relaxed">{children}</code>
        </pre>
      </div>
    );
  },
  pre: ({ children }) => <>{children}</>,

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-400 hover:text-brand-300 underline underline-offset-2 decoration-brand-400/40 hover:decoration-brand-300/60 transition-colors"
    >
      {children}
    </a>
  ),

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-brand-500/40 text-zinc-400 italic">
      {children}
    </blockquote>
  ),

  // Horizontal rule
  hr: () => (
    <hr className="my-3 border-white/[0.08]" />
  ),

  // Table
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-white/[0.06]">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-white/[0.04] border-b border-white/[0.06]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-white/[0.04] last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-zinc-300">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-zinc-400">{children}</td>
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
