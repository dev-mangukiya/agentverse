"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { getAuthHeaders } from "@/lib/auth";
import { MicroscopeIcon, CodeIcon, PenIcon, TargetIcon, BarChartIcon, ScaleIcon, BotIcon, FileTextIcon, FilePlusIcon } from "../icons/Icons";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const agentIconMap: Record<string, React.ReactNode> = {
  research: <MicroscopeIcon size={16} />,
  coding: <CodeIcon size={16} />,
  writer: <PenIcon size={16} />,
  critic: <TargetIcon size={16} />,
  data_analyst: <BarChartIcon size={16} />,
  data: <BarChartIcon size={16} />,
  doc_reader: <FileTextIcon size={16} />,
  doc_generator: <FilePlusIcon size={16} />,
};

// Colors for built-in agents; custom agents get assigned from the palette
const BUILTIN_COLORS: Record<string, string> = {
  research: "#10b981",
  coding: "#3b82f6",
  writer: "#f59e0b",
  critic: "#06b6d4",
  data_analyst: "#a855f7",
  data: "#a855f7",
  doc_reader: "#f97316",
  doc_generator: "#14b8a6",
};

const COLOR_PALETTE = [
  "#ec4899", "#8b5cf6", "#ef4444", "#84cc16", "#f43f5e",
  "#6366f1", "#22d3ee", "#eab308", "#d946ef", "#0ea5e9",
];

interface AgentOption {
  id: string;
  label: string;
  color: string;
  is_builtin: boolean;
}

interface ComparisonResult {
  agent: string;
  response: string;
  duration_ms: number;
  error?: string;
}

export function AgentComparison() {
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingAgents, setFetchingAgents] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch agents from API on mount
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/agents`);
        if (res.ok) {
          const data = await res.json();
          let colorIdx = 0;
          const agents: AgentOption[] = (data.agents || [])
            .filter((a: any) => a.name !== "orchestrator") // Orchestrator can't be compared directly
            .map((a: any) => {
              // Use the agent's "name" as the compare ID (matches backend agent_classes keys)
              // data_analyst maps to "data" in the backend compare endpoint
              const id = a.name === "data_analyst" ? "data" : a.name;
              const color = BUILTIN_COLORS[a.name] || BUILTIN_COLORS[id] || COLOR_PALETTE[colorIdx++ % COLOR_PALETTE.length];
              return {
                id,
                label: a.is_builtin
                  ? `${a.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} Agent`
                  : `${a.emoji || "🤖"} ${a.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
                color,
                is_builtin: a.is_builtin,
              };
            });
          setAllAgents(agents);
          // Default selection: first 2 agents
          if (agents.length >= 2) {
            setSelectedAgents([agents[0].id, agents[1].id]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch agents for comparison", err);
      } finally {
        setFetchingAgents(false);
      }
    };
    fetchAgents();
  }, []);

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
          ...getAuthHeaders(),
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

  const getAgent = (id: string) => allAgents.find((a) => a.id === id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          <span className="inline-flex items-center gap-1.5"><ScaleIcon size={16} /> Agent Comparison</span>
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
        {fetchingAgents ? (
          <div className="text-xs py-2" style={{ color: "var(--text-muted)" }}>Loading agents...</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allAgents.map((agent) => {
              const isSelected = selectedAgents.includes(agent.id);
              return (
                <button
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200"
                  style={{
                    background: isSelected ? `${agent.color}15` : "var(--glass-bg)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: `1.5px solid ${isSelected ? agent.color : "var(--glass-border)"}`,
                    color: isSelected ? agent.color : "var(--text-muted)",
                    boxShadow: isSelected ? `0 0 16px ${agent.color}20` : "none",
                  }}
                >
                  <span className="flex items-center">{agentIconMap[agent.id] || <BotIcon size={14} />}</span>
                  {agent.label}
                  {!agent.is_builtin && (
                    <span className="text-[8px] px-1 py-0.5 rounded-full uppercase font-bold" style={{ backgroundColor: `${agent.color}20`, color: agent.color }}>
                      Custom
                    </span>
                  )}
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
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
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {selectedAgents.map((id) => {
                  const agent = getAgent(id);
                  return (
                    <motion.div
                      key={id}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: selectedAgents.indexOf(id) * 0.3 }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                      style={{ backgroundColor: `${agent?.color || "#666"}20`, border: `2px solid ${agent?.color || "#666"}40` }}
                    >
                      {agentIconMap[id] || <BotIcon size={14} />}
                    </motion.div>
                  );
                })}
              </div>
              {/* Gemini-style shimmer bar */}
              <div
                className="rounded-full overflow-hidden"
                style={{ width: "180px", height: "4px", backgroundColor: "var(--bg-raised)" }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(90deg, transparent, var(--aurora-1), var(--aurora-2), var(--aurora-3), transparent)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s ease-in-out infinite",
                  }}
                />
              </div>
              <span className="text-xs font-medium gradient-text">
                Running agents in parallel...
              </span>
            </div>
          </div>
        )}

        {!loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3" style={{ color: "var(--text-faint)" }}><ScaleIcon size={32} /></div>
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
              const agent = getAgent(result.agent);
              return (
                <motion.div
                  key={result.agent}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-2xl overflow-hidden flex flex-col"
                  style={{
                    background: "var(--glass-bg)",
                    backdropFilter: "blur(20px) saturate(1.3)",
                    WebkitBackdropFilter: "blur(20px) saturate(1.3)",
                    border: `1px solid ${agent?.color || "var(--glass-border)"}30`,
                  }}
                >
                  {/* Gradient top accent */}
                  <div style={{
                    height: "3px",
                    background: `linear-gradient(90deg, ${agent?.color || "var(--brand)"}80, ${agent?.color || "var(--brand)"}20, transparent)`,
                  }} />
                  {/* Agent header */}
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{
                      background: `linear-gradient(135deg, ${agent?.color || "#666"}08, transparent)`,
                      borderBottom: `1px solid ${agent?.color || "var(--border-subtle)"}15`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center">{agentIconMap[result.agent] || <BotIcon size={16} />}</span>
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
