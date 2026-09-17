"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { getAgent } from "@/config/agents";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface AgentMetric {
  name: string;
  label: string;
  color: string;
  total_messages: number;
  last_active: string | null;
  first_seen: string | null;
  avg_response_ms: number | null;
  p50_response_ms: number | null;
  p95_response_ms: number | null;
  response_sample_count: number;
}

interface DailyData {
  date: string;
  label: string;
  count: number;
}

interface AnalyticsData {
  agents: AgentMetric[];
  daily_messages: DailyData[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  const hr = Math.floor(diff / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatMs(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatus(lastActive: string | null, totalMessages: number): "active" | "idle" | "working" {
  if (!lastActive) return "idle";
  const delta = (Date.now() - new Date(lastActive).getTime()) / 1000;
  if (delta < 300) return "working";
  if (totalMessages > 0) return "active";
  return "idle";
}

const statusColors: Record<string, string> = {
  active: "var(--green)",
  working: "var(--yellow)",
  idle: "var(--text-faint)",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 rounded-lg shadow-lg text-xs"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-muted)",
        color: "var(--text-primary)",
      }}
    >
      <div className="font-medium">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || "var(--text-muted)" }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

type SortKey = "name" | "total_messages" | "avg_response_ms" | "last_active";

export function AgentAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("total_messages");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats/agent-analytics`);
        if (res.ok) {
          setData(await res.json());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  const sortedAgents = useMemo(() => {
    if (!data) return [];
    const agents = [...data.agents];
    agents.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "total_messages":
          cmp = a.total_messages - b.total_messages;
          break;
        case "avg_response_ms":
          cmp = (a.avg_response_ms || 0) - (b.avg_response_ms || 0);
          break;
        case "last_active":
          const aTime = a.last_active ? new Date(a.last_active).getTime() : 0;
          const bTime = b.last_active ? new Date(b.last_active).getTime() : 0;
          cmp = aTime - bTime;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return agents;
  }, [data, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortHeader = ({ label, field, align }: { label: string; field: SortKey; align?: string }) => (
    <div
      role="columnheader"
      className={`text-[10px] font-semibold uppercase tracking-wider py-2.5 px-3 cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color: sortKey === field ? "var(--text-secondary)" : "var(--text-faint)" }}
      onClick={() => handleSort(field)}
    >
      {label}
      {sortKey === field && (
        <span className="ml-1 text-[9px]">{sortAsc ? "↑" : "↓"}</span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4 mt-4">
        <div className="h-48 rounded-2xl shimmer-loading" />
        <div className="h-64 rounded-2xl shimmer-loading" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="mt-4 p-6 rounded-2xl text-center"
        style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          Analytics data will appear here after conversations
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-4 space-y-4"
    >
      {/* Messages over time */}
      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
          Messages — Last 7 Days
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data.daily_messages} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-faint)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-faint)" }} axisLine={false} tickLine={false} width={30} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              name="Messages"
              stroke="var(--brand)"
              strokeWidth={1.5}
              fill="url(#msgGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Agent performance — CSS-only responsive layout */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="px-4 pt-4 pb-2">
          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Agent Performance
          </span>
        </div>

        {/* ── Desktop: grid table (hidden below md:) ──────────────── */}
        <div className="hidden md:block overflow-x-auto">
          {/* Header row */}
          <div
            role="row"
            className="grid gap-0"
            style={{
              gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <SortHeader label="Agent" field="name" />
            <SortHeader label="Messages" field="total_messages" align="right" />
            <SortHeader label="Response Time" field="avg_response_ms" align="right" />
            <SortHeader label="Last Active" field="last_active" align="right" />
            <div
              role="columnheader"
              className="text-[10px] font-semibold uppercase tracking-wider py-2.5 px-3 text-right"
              style={{ color: "var(--text-faint)" }}
            >
              Status
            </div>
          </div>
          {/* Data rows */}
          <div role="rowgroup">
            {sortedAgents.map((agent, i) => {
              const status = getStatus(agent.last_active, agent.total_messages);
              return (
                <motion.div
                  key={agent.name}
                  role="row"
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    layout: { duration: 0.26, ease: [0.4, 0, 0.2, 1] },
                    opacity: { duration: 0.18, delay: i * 0.035 },
                    y: { duration: 0.18, delay: i * 0.035 },
                  }}
                  className="grid gap-0 analytics-row rounded-lg"
                  style={{
                    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                    borderBottom: i < sortedAgents.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                  }}
                >
                  <div role="cell" className="py-2.5 px-3">
                    <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                      {getAgent(agent.name).displayName}
                    </span>
                  </div>
                  <div role="cell" className="py-2.5 px-3 text-right">
                    <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {agent.total_messages}
                    </span>
                  </div>
                  <div role="cell" className="py-2.5 px-3 text-right">
                    {agent.p50_response_ms != null && agent.p95_response_ms != null ? (
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                        <span style={{ color: "var(--text-secondary)" }}>{formatMs(agent.p50_response_ms)}</span>
                        <span className="mx-0.5" style={{ color: "var(--text-faint)" }}>/</span>
                        <span>{formatMs(agent.p95_response_ms)}</span>
                        <span className="text-[9px] ml-1" style={{ color: "var(--text-faint)" }}>p50/p95</span>
                      </span>
                    ) : (
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
                        {formatMs(agent.avg_response_ms)}
                        {agent.avg_response_ms != null && (
                          <span className="text-[9px] ml-1" title={`Only ${agent.response_sample_count} samples — need ≥20 for percentiles`}>avg</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div role="cell" className="py-2.5 px-3 text-right">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {timeAgo(agent.last_active)}
                    </span>
                  </div>
                  <div role="cell" className="py-2.5 px-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <motion.span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.18 }}
                        style={{ backgroundColor: statusColors[status] }}
                      />
                      <span className="text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>
                        {status}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ── Mobile: stacked cards (hidden at md: and above) ─────── */}
        <div className="md:hidden px-3 pb-3 space-y-2">
          {/* Sort controls for mobile */}
          <div className="flex items-center gap-2 py-2 overflow-x-auto">
            {(["name", "total_messages", "avg_response_ms", "last_active"] as SortKey[]).map((field) => {
              const labels: Record<SortKey, string> = { name: "Name", total_messages: "Msgs", avg_response_ms: "Avg", last_active: "Recent" };
              return (
                <button
                  key={field}
                  onClick={() => handleSort(field)}
                  className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1.5 rounded-lg flex-shrink-0"
                  style={{
                    backgroundColor: sortKey === field ? "var(--brand-dim)" : "var(--bg-hover)",
                    color: sortKey === field ? "var(--brand-text)" : "var(--text-faint)",
                    border: `1px solid ${sortKey === field ? "color-mix(in srgb, var(--brand) 20%, transparent)" : "transparent"}`,
                  }}
                >
                  {labels[field]}
                  {sortKey === field && <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>}
                </button>
              );
            })}
          </div>
          {sortedAgents.map((agent, i) => {
            const status = getStatus(agent.last_active, agent.total_messages);
            const info = getAgent(agent.name);
            return (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.035, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl p-3"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {/* Card header: agent name + status */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {info.displayName}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: statusColors[status] }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>
                      {status}
                    </span>
                  </div>
                </div>
                {/* Card body: stat pairs */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-faint)" }}>Messages</div>
                    <div className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>{agent.total_messages}</div>
                  </div>
                  <div>
                    {agent.p50_response_ms != null ? (
                      <>
                        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-faint)" }}>p50 / p95</div>
                        <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                          <span style={{ color: "var(--text-secondary)" }}>{formatMs(agent.p50_response_ms)}</span>
                          <span className="mx-0.5" style={{ color: "var(--text-faint)" }}>/</span>
                          {formatMs(agent.p95_response_ms)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-faint)" }}>Avg Resp</div>
                        <div className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>{formatMs(agent.avg_response_ms)}</div>
                      </>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-faint)" }}>Last Active</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{timeAgo(agent.last_active)}</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
