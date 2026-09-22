"use client";

/**
 * Feedback Leaderboard — agents ranked by thumbs-up ratio.
 *
 * Source: messages.feedback ('up'/'down') per messages.agent_name
 * Low-sample agents (< min_threshold) are shown de-emphasized rather than hidden.
 * Empty state renders when no feedback data exists at all.
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getAgent, getAgentIcon } from "@/config/agents";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface LeaderboardEntry {
  agent_name: string;
  thumbs_up: number;
  thumbs_down: number;
  total_feedback: number;
  approval_rate: number;
  low_sample: boolean;
}

interface LeaderboardData {
  agents: LeaderboardEntry[];
  min_threshold: number;
  has_data: boolean;
}

export function FeedbackLeaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats/feedback-leaderboard`);
        if (res.ok) setData(await res.json());
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Agent Feedback Rankings
          </span>
        </div>
        <div className="px-4 pb-4">
          <div className="shimmer-loading h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  // Empty state — no feedback data at all
  if (!data || !data.has_data) {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Agent Feedback Rankings
          </span>
        </div>
        <div className="px-4 pb-5 text-center">
          <div className="flex justify-center gap-1 mb-2 text-lg" style={{ color: "var(--text-faint)" }}>
            <span>👍</span><span>👎</span>
          </div>
          <div className="text-xs" style={{ color: "var(--text-faint)" }}>
            Rate agent responses with 👍/👎 to see rankings here
          </div>
          <div className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
            Source: messages.feedback — minimum {data?.min_threshold || 5} ratings to rank
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Agent Feedback Rankings
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          min {data.min_threshold} ratings to rank
        </span>
      </div>

      {/* ── Desktop table ────────────────────────────────── */}
      <div className="hidden md:block">
        {/* Header */}
        <div
          className="grid gap-0 px-4"
          style={{
            gridTemplateColumns: "28px 2fr 1fr 1fr 1fr",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider py-2" style={{ color: "var(--text-faint)" }}>#</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider py-2" style={{ color: "var(--text-faint)" }}>Agent</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider py-2 text-right" style={{ color: "var(--text-faint)" }}>👍</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider py-2 text-right" style={{ color: "var(--text-faint)" }}>👎</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider py-2 text-right" style={{ color: "var(--text-faint)" }}>Approval</div>
        </div>
        {/* Rows */}
        {data.agents.map((entry, i) => {
          const info = getAgent(entry.agent_name);
          const isLow = entry.low_sample;
          return (
            <motion.div
              key={entry.agent_name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.035, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="grid gap-0 px-4 analytics-row"
              style={{
                gridTemplateColumns: "28px 2fr 1fr 1fr 1fr",
                borderBottom: i < data.agents.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                opacity: isLow ? 0.55 : 1,
              }}
            >
              <div className="py-2.5">
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-faint)" }}>
                  {i + 1}
                </span>
              </div>
              <div className="py-2.5 flex items-center gap-2">
                <span className="flex items-center" style={{ color: info.color }}>{getAgentIcon(entry.agent_name, 14)}</span>
                <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                  {info.displayName}
                </span>
                {isLow && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}>
                    {entry.total_feedback} rated
                  </span>
                )}
              </div>
              <div className="py-2.5 text-right">
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--green)" }}>
                  {entry.thumbs_up}
                </span>
              </div>
              <div className="py-2.5 text-right">
                <span className="text-xs font-semibold tabular-nums" style={{ color: entry.thumbs_down > 0 ? "var(--red)" : "var(--text-faint)" }}>
                  {entry.thumbs_down}
                </span>
              </div>
              <div className="py-2.5 text-right">
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  {Math.round(entry.approval_rate * 100)}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Mobile cards ──────────────────────────────────── */}
      <div className="md:hidden px-3 pb-3 space-y-2">
        {data.agents.map((entry, i) => {
          const info = getAgent(entry.agent_name);
          const isLow = entry.low_sample;
          return (
            <motion.div
              key={entry.agent_name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.035, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl p-3"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                opacity: isLow ? 0.55 : 1,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-faint)" }}>#{i + 1}</span>
                  <span className="flex items-center" style={{ color: info.color }}>{getAgentIcon(entry.agent_name, 13)}</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{info.displayName}</span>
                </div>
                {isLow && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}>
                    {entry.total_feedback} rated
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-faint)" }}>👍</div>
                  <div className="text-xs font-semibold tabular-nums" style={{ color: "var(--green)" }}>{entry.thumbs_up}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-faint)" }}>👎</div>
                  <div className="text-xs font-semibold tabular-nums" style={{ color: entry.thumbs_down > 0 ? "var(--red)" : "var(--text-faint)" }}>{entry.thumbs_down}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-faint)" }}>Approval</div>
                  <div className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>{Math.round(entry.approval_rate * 100)}%</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
