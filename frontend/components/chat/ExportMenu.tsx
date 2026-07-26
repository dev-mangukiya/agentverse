"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string | number;
  role: "user" | "agent" | "system" | "tool";
  agent_name?: string;
  content: string;
  created_at?: string;
  contributing_agents?: string[];
  pipeline_duration_ms?: number;
}

interface ExportMenuProps {
  messages: Message[];
  conversationTitle?: string;
}

type ExportFormat = "markdown" | "json" | "text";

const formats: { id: ExportFormat; label: string; icon: string; desc: string }[] = [
  { id: "markdown", label: "Markdown", icon: "📝", desc: "Formatted .md file" },
  { id: "json", label: "JSON", icon: "📦", desc: "Structured data" },
  { id: "text", label: "Plain Text", icon: "📄", desc: "Simple .txt file" },
];

function generateMarkdown(messages: Message[], title: string): string {
  let md = `# ${title}\n\n`;
  md += `*Exported from AgentVerse on ${new Date().toLocaleString()}*\n\n---\n\n`;

  for (const msg of messages) {
    if (msg.role === "user") {
      md += `## 👤 You\n\n${msg.content}\n\n`;
    } else if (msg.role === "agent") {
      const agent = msg.agent_name ? `🤖 ${msg.agent_name.charAt(0).toUpperCase() + msg.agent_name.slice(1)} Agent` : "🤖 Agent";
      md += `## ${agent}\n\n${msg.content}\n\n`;
      if (msg.pipeline_duration_ms) {
        md += `*Pipeline: ${(msg.pipeline_duration_ms / 1000).toFixed(1)}s*`;
        if (msg.contributing_agents?.length) {
          md += ` *| Agents: ${msg.contributing_agents.join(", ")}*`;
        }
        md += "\n\n";
      }
    } else if (msg.role === "system") {
      md += `> ⚠️ ${msg.content}\n\n`;
    }
    md += "---\n\n";
  }

  return md;
}

function generateJSON(messages: Message[], title: string): string {
  return JSON.stringify(
    {
      title,
      exported_at: new Date().toISOString(),
      message_count: messages.length,
      messages: messages.map((m) => ({
        role: m.role,
        agent_name: m.agent_name || null,
        content: m.content,
        created_at: m.created_at || null,
        contributing_agents: m.contributing_agents || [],
        pipeline_duration_ms: m.pipeline_duration_ms || null,
      })),
    },
    null,
    2
  );
}

function generatePlainText(messages: Message[], title: string): string {
  let text = `${title}\nExported: ${new Date().toLocaleString()}\n${"=".repeat(50)}\n\n`;

  for (const msg of messages) {
    if (msg.role === "user") {
      text += `[You]\n${msg.content}\n\n`;
    } else if (msg.role === "agent") {
      const agent = msg.agent_name ? `${msg.agent_name.charAt(0).toUpperCase() + msg.agent_name.slice(1)} Agent` : "Agent";
      text += `[${agent}]\n${msg.content}\n`;
      if (msg.pipeline_duration_ms) {
        text += `(Pipeline: ${(msg.pipeline_duration_ms / 1000).toFixed(1)}s)\n`;
      }
      text += "\n";
    } else if (msg.role === "system") {
      text += `[System] ${msg.content}\n\n`;
    }
    text += `${"-".repeat(40)}\n\n`;
  }

  return text;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportMenu({ messages, conversationTitle }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleExport = (format: ExportFormat) => {
    const title = conversationTitle || "AgentVerse Chat";
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeTitle = title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);

    switch (format) {
      case "markdown":
        downloadFile(generateMarkdown(messages, title), `${safeTitle}_${timestamp}.md`, "text/markdown");
        break;
      case "json":
        downloadFile(generateJSON(messages, title), `${safeTitle}_${timestamp}.json`, "application/json");
        break;
      case "text":
        downloadFile(generatePlainText(messages, title), `${safeTitle}_${timestamp}.txt`, "text/plain");
        break;
    }
    setOpen(false);
  };

  if (!messages.length) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
        style={{
          color: "var(--text-muted)",
          backgroundColor: "transparent",
          border: "1px solid transparent",
        }}
        title="Export conversation"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          e.currentTarget.style.borderColor = "var(--border-subtle)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.borderColor = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-52 rounded-xl shadow-xl overflow-hidden z-50"
            style={{
              backgroundColor: "var(--bg-panel)",
              border: "1px solid var(--border-muted)",
            }}
          >
            <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                Export as
              </span>
            </div>
            {formats.map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => handleExport(fmt.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <span className="text-base">{fmt.icon}</span>
                <div>
                  <div className="text-sm font-medium">{fmt.label}</div>
                  <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>{fmt.desc}</div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
