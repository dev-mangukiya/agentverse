"use client";

import { motion } from "framer-motion";

interface PromptTemplate {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  icon: React.ReactNode;
  color: string;
}

const TEMPLATES: PromptTemplate[] = [
  {
    id: "research",
    title: "Research a Topic",
    subtitle: "Find current information online",
    prompt: "Research the latest developments in ",
    color: "var(--agent-research, #3b82f6)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  {
    id: "code",
    title: "Write Code",
    subtitle: "Scripts, functions, and debugging",
    prompt: "Write a Python script that ",
    color: "var(--agent-coding, #10b981)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: "write",
    title: "Write Content",
    subtitle: "Essays, emails, reports, blogs",
    prompt: "Write a professional ",
    color: "var(--agent-writer, #f59e0b)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: "analyze",
    title: "Analyze Data",
    subtitle: "Statistics, charts, insights",
    prompt: "Analyze the following data and provide insights: ",
    color: "var(--agent-data, #8b5cf6)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" />
      </svg>
    ),
  },
  {
    id: "summarize",
    title: "Summarize",
    subtitle: "Condense articles, docs, or text",
    prompt: "Summarize the following: ",
    color: "var(--agent-critic, #ec4899)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: "explain",
    title: "Explain a Concept",
    subtitle: "Clear explanations of complex topics",
    prompt: "Explain in simple terms how ",
    color: "#06b6d4",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    id: "document",
    title: "Generate Document",
    subtitle: "Reports, proposals, documentation",
    prompt: "Generate a detailed document about ",
    color: "#f97316",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
  },
  {
    id: "compare",
    title: "Compare Options",
    subtitle: "Pros/cons, feature comparisons",
    prompt: "Compare the pros and cons of ",
    color: "#14b8a6",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
];

interface PromptTemplatesProps {
  onSelect?: (prompt: string) => void;
  onInsert?: (prompt: string) => void;
  onClose?: () => void;
}

export function PromptTemplates({ onSelect, onInsert, onClose }: PromptTemplatesProps) {
  const handleSelect = (prompt: string) => {
    onSelect?.(prompt);
    onInsert?.(prompt);
    onClose?.();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 md:px-8 py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center mb-8"
      >
        <h2
          className="text-xl md:text-2xl font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          What can I help you with?
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Choose a template below or type your own message
        </p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
        {TEMPLATES.map((template, i) => (
          <motion.button
            key={template.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.3 }}
            onClick={() => handleSelect(template.prompt)}
            className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all duration-200 group"
            style={{
              backgroundColor: "var(--bg-panel)",
              border: "1px solid var(--border-subtle)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = template.color;
              e.currentTarget.style.boxShadow = `0 0 16px ${template.color}15`;
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-subtle)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: `color-mix(in srgb, ${template.color} 12%, var(--bg-panel))`,
                color: template.color,
              }}
            >
              {template.icon}
            </div>
            <div>
              <div className="text-xs font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
                {template.title}
              </div>
              <div className="text-[10px] mt-0.5 leading-tight" style={{ color: "var(--text-faint)" }}>
                {template.subtitle}
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
