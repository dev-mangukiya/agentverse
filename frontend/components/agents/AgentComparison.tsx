"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { getSessionId } from "@/lib/session";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const AVAILABLE_AGENTS = [
  { id: "research", label: "Research Agent", color: "#10b981", icon: "🔬" },
  { id: "coding", label: "Coding Agent", color: "#3b82f6", icon: "💻" },
  { id: "writer", label: "Writer Agent", color: "#f59e0b", icon: "✍️" },
  { id: "critic", label: "Critic Agent", color: "#06b6d4", icon: "🎯" },
  { id: "data", label: "Data Agent", color: "#a855f7", icon: "📊" },
];

interface ComparisonResult {
  agent: string;
  response: string;
  duration_ms: number;
  error?: string;
}

export function AgentComparison() {
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["research", "coding"]);
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // Minimum 2 agents
        return prev.filter((a) => a !== id);
      }
      if (prev.length >= 3) return prev; // Maximum 3
      return [...prev, id];
    });
  };

  const handleCompare = async () => {
    if (!prompt.trim() || selectedAgents.length < 2) return;
    setLoading(true);
    setResults([]);

    try {
      const res = await fetch(`${API_URL}/api/v1/chat/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": getSessionId(),
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          agents: selectedAgents,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      } else {
        setResults(
          selectedAgents.map((a) => ({
            agent: a,
            response: "Failed to get response from this agent.",
            duration_ms: 0,
            error: "API error",
          }))
        );
      }
    } catch {
      setResults(
        selectedAgents.map((a) => ({
          agent: a,
          response: "Network error — could not reach the backend.",
          duration_ms: 0,
          error: "Network error",
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          ⚖️ Agent Comparison
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Run the same prompt through 2-3 agents and compare responses side-by-side
        </p>
      </div>

      {/* Agent selector */}
      <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
          Select 2-3 agents
        </div>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_AGENTS.map((agent) => {
            const isSelected = selectedAgents.includes(agent.id);
            return (
              <button
                key={agent.id}
                onClick={() => toggleAgent(agent.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200"
                style={{
                  backgroundColor: isSelected ? `${agent.color}15` : "var(--bg-raised)",
                  border: `1.5px solid ${isSelected ? agent.color : "var(--border-subtle)"}`,
                  color: isSelected ? agent.color : "var(--text-muted)",
                  boxShadow: isSelected ? `0 0 12px ${agent.color}20` : "none",
                }}
              >
                <span>{agent.icon}</span>
                {agent.label}
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Prompt input */}
      <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
          Shared Prompt
        </div>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCompare();
              }
            }}
            placeholder="Enter a prompt to send to all selected agents..."
            rows={2}
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
            style={{
              backgroundColor: "var(--input-bg)",
              border: "1px solid var(--input-border)",
              color: "var(--text-primary)",
            }}
          />
          <button
            onClick={handleCompare}
            disabled={!prompt.trim() || selectedAgents.length < 2 || loading}
            className="px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex-shrink-0 self-end"
            style={{
              backgroundColor: prompt.trim() && !loading ? "var(--brand)" : "var(--bg-raised)",
              color: prompt.trim() && !loading ? "white" : "var(--text-faint)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running...
              </div>
            ) : (
              "Compare"
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-2">
                {selectedAgents.map((id) => {
                  const agent = AVAILABLE_AGENTS.find((a) => a.id === id)!;
                  return (
                    <motion.div
                      key={id}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: selectedAgents.indexOf(id) * 0.3 }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                      style={{ backgroundColor: `${agent.color}20`, border: `2px solid ${agent.color}40` }}
                    >
                      {agent.icon}
                    </motion.div>
                  );
                })}
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Running agents in parallel...
              </span>
            </div>
          </div>
        )}

        {!loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-3xl mb-3">⚖️</div>
            <div className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Ready to compare
            </div>
            <div className="text-xs text-center max-w-[280px]" style={{ color: "var(--text-faint)" }}>
              Select agents, enter a prompt, and see how different agents respond to the same question
            </div>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className={`grid gap-4 ${results.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>
            {results.map((result, i) => {
              const agent = AVAILABLE_AGENTS.find((a) => a.id === result.agent);
              return (
                <motion.div
                  key={result.agent}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-2xl overflow-hidden flex flex-col"
                  style={{
                    backgroundColor: "var(--bg-raised)",
                    border: `1px solid ${agent?.color || "var(--border-subtle)"}30`,
                  }}
                >
                  {/* Agent header */}
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{
                      background: `linear-gradient(135deg, ${agent?.color || "#666"}10, transparent)`,
                      borderBottom: `1px solid ${agent?.color || "var(--border-subtle)"}20`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{agent?.icon || "🤖"}</span>
                      <span className="text-sm font-semibold" style={{ color: agent?.color || "var(--text-primary)" }}>
                        {agent?.label || result.agent}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.error ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--red-dim)", color: "var(--red)" }}>
                          Error
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}>
                          {(result.duration_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Response */}
                  <div className="px-4 py-3 flex-1 overflow-y-auto max-h-[400px] text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    <MarkdownRenderer content={result.response} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
