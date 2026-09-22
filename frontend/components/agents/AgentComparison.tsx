"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { getAuthHeaders } from "@/lib/auth";
import { getAgent, getAgentIcon, AGENT_REGISTRY } from "@/config/agents";
import { BotIcon, ScaleIcon } from "../icons/Icons";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface AgentOption {
  id: string;
  label: string;
  is_builtin: boolean;
}

interface ComparisonResult {
  agent: string;
  response: string;
  duration_ms: number;
  error?: string;
  critic_score?: number;
  critic_review?: string;
}

export function AgentComparison() {
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"agents" | "scoring">("agents");
  const [fetchingAgents, setFetchingAgents] = useState(true);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch agents from API on mount
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/agents`);
        if (res.ok) {
          const data = await res.json();
          const agents: AgentOption[] = (data.agents || [])
            .filter((a: any) => a.name !== "orchestrator")
            .map((a: any) => ({
              id: a.name,
              label: getAgent(a.name).displayName,
              is_builtin: a.is_builtin,
            }));
          setAllAgents(agents);
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

  const criticIncluded = selectedAgents.includes("critic");

  const handleCompare = async () => {
    if (!prompt.trim() || selectedAgents.length < 2) return;
    setLoading(true);
    setLoadingPhase("agents");
    setResults([]);
    setExpandedReview(null);

    try {
      // Show scoring phase indicator if critic is included
      if (criticIncluded) {
        // The backend handles both phases, but we show a phase transition
        // after a reasonable delay to indicate scoring is happening
        const phaseTimer = setTimeout(() => {
          setLoadingPhase("scoring");
        }, 3000); // After ~3s, most agents have responded; scoring begins

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
        clearTimeout(phaseTimer);

        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        } else {
          const nonCritic = selectedAgents.filter(a => a !== "critic");
          setResults(
            nonCritic.map((a) => ({
              agent: a,
              response: "Failed to get response from this agent.",
              duration_ms: 0,
              error: "API error",
            }))
          );
        }
      } else {
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
      }
    } catch {
      const agents = selectedAgents.filter(a => a !== "critic");
      setResults(
        (agents.length > 0 ? agents : selectedAgents).map((a) => ({
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

  const atLimit = selectedAgents.length >= 3;

  // Find highest critic score among results (for "Highest rated" badge)
  const highestScore = results.reduce((max, r) => {
    if (r.critic_score && r.critic_score > max) return r.critic_score;
    return max;
  }, 0);
  const hasAnyScore = results.some(r => r.critic_score != null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          Agent Comparison
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Run the same prompt through 2–3 agents and compare responses side-by-side
          {criticIncluded && (
            <span style={{ color: "var(--brand-text)" }}> — Critic will score each response</span>
          )}
        </p>
      </div>

      <div className="px-4 md:px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Select agents
          </div>
          <div className="text-[11px] font-medium tabular-nums" style={{ color: selectedAgents.length >= 2 ? "var(--text-muted)" : "var(--text-faint)" }}>
            {selectedAgents.length}/3
          </div>
        </div>
        {fetchingAgents ? (
          <div className="text-xs py-2" style={{ color: "var(--text-muted)" }}>Loading agents...</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allAgents.map((agent) => {
              const isSelected = selectedAgents.includes(agent.id);
              const info = getAgent(agent.id);
              const isDisabled = !isSelected && atLimit;
              return (
                <button
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  disabled={isDisabled}
                  className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium transition-colors duration-150"
                  style={{
                    background: isSelected ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "var(--bg-raised)",
                    border: `1.5px solid ${isSelected ? "var(--brand)" : "var(--border-subtle)"}`,
                    color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
                    opacity: isDisabled ? 0.4 : 1,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <span className="flex items-center" style={{ color: info.color }}>{info.icon}</span>
                  {agent.label}
                  {!agent.is_builtin && (
                    <span className="text-[8px] px-1 py-0.5 rounded-full uppercase font-bold" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}>
                      Custom
                    </span>
                  )}
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Prompt input */}
      <div className="px-4 md:px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
          Shared Prompt
        </div>
        <div className="flex flex-col md:flex-row gap-2">
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
            className="px-5 py-3 rounded-xl text-sm font-semibold transition-colors duration-150 w-full md:w-auto md:flex-shrink-0 md:self-end"
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
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {selectedAgents.filter(a => a !== "critic").map((id) => {
                  const info = getAgent(id);
                  return (
                    <motion.div
                      key={id}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: selectedAgents.indexOf(id) * 0.3 }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                      style={{ backgroundColor: `color-mix(in srgb, ${info.color} 12%, var(--bg-elevated))`, border: `2px solid color-mix(in srgb, ${info.color} 25%, transparent)` }}
                    >
                      <span style={{ color: info.color }}>{info.icon}</span>
                    </motion.div>
                  );
                })}
              </div>
              {/* Shimmer bar */}
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
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {loadingPhase === "agents"
                  ? "Running agents in parallel…"
                  : "Critic is scoring responses…"
                }
              </span>
              {criticIncluded && loadingPhase === "agents" && (
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  Critic scoring will begin after agents respond
                </span>
              )}
            </div>
          </div>
        )}

        {!loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="text-xs text-center max-w-[280px]" style={{ color: "var(--text-faint)" }}>
              Enter a prompt above to start
            </div>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className={`grid gap-4 ${results.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>
            {results.map((result, i) => {
              const info = getAgent(result.agent);
              const isHighest = hasAnyScore && result.critic_score === highestScore && highestScore > 0;
              return (
                <motion.div
                  key={result.agent}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-2xl overflow-hidden flex flex-col"
                  style={{
                    backgroundColor: "var(--bg-raised)",
                    border: `1px solid ${isHighest ? "color-mix(in srgb, var(--brand) 30%, var(--border-subtle))" : "var(--border-subtle)"}`,
                  }}
                >
                  {/* Subtle top accent */}
                  <div style={{
                    height: "2px",
                    background: `linear-gradient(90deg, ${info.color}80, ${info.color}20, transparent)`,
                  }} />
                  {/* Agent header */}
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center" style={{ color: info.color }}>{info.icon}</span>
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {info.displayName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Critic score badge */}
                      {result.critic_score != null && (
                        <button
                          onClick={() => setExpandedReview(expandedReview === result.agent ? null : result.agent)}
                          className="text-[10px] px-2 py-0.5 rounded-full font-semibold tabular-nums"
                          style={{
                            backgroundColor: isHighest ? "var(--brand-dim)" : "var(--bg-hover)",
                            color: isHighest ? "var(--brand-text)" : "var(--text-muted)",
                            border: isHighest ? "1px solid color-mix(in srgb, var(--brand) 20%, transparent)" : "1px solid transparent",
                            cursor: result.critic_review ? "pointer" : "default",
                          }}
                          title={result.critic_review ? "Click to view full review" : undefined}
                        >
                          {result.critic_score}/10
                        </button>
                      )}
                      {/* Highest rated badge */}
                      {isHighest && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: "var(--brand-dim)",
                            color: "var(--brand-text)",
                          }}
                        >
                          Highest rated
                        </span>
                      )}
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

                  {/* Expandable critic review */}
                  <AnimatePresence>
                    {expandedReview === result.agent && result.critic_review && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <div className="px-4 py-3 text-xs leading-relaxed" style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-elevated)" }}>
                          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-faint)" }}>
                            Critic Review
                          </div>
                          <MarkdownRenderer content={result.critic_review} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

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
