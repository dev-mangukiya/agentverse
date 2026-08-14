"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { BarChartIcon } from "../icons/Icons";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid,
} from "recharts";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface AgentMetric {
  name: string;
  label: string;
  color: string;
  total_messages: number;
  last_active: string | null;
  first_seen: string | null;
  avg_response_ms: number | null;
}

interface DailyData {
  date: string;
  label: string;
  count: number;
}

interface ToolUsage {
  tool: string;
  count: number;
}

interface AnalyticsData {
  agents: AgentMetric[];
  daily_messages: DailyData[];
  tool_usage: ToolUsage[];
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

export function AgentAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-48 rounded-2xl shimmer-loading" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="mt-4 p-6 rounded-2xl text-center"
        style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="mb-1" style={{ color: "var(--text-faint)" }}><BarChartIcon size={20} /></div>
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          Analytics data will appear here after conversations
        </div>
      </div>
    );
  }

  const totalMessages = data.agents.reduce((sum, a) => sum + a.total_messages, 0);
  const agentChartData = data.agents
    .sort((a, b) => b.total_messages - a.total_messages)
    .slice(0, 8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-4 space-y-4"
    >
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <span className="inline-flex items-center gap-1.5"><BarChartIcon size={16} /> Agent Analytics</span>
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}>
          Live
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Agent usage distribution */}
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
            Agent Usage Distribution
          </div>
          {agentChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={agentChartData} layout="vertical" margin={{ left: 60, right: 10, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-faint)" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--bg-hover)" }} />
                <Bar dataKey="total_messages" name="Messages" radius={[0, 6, 6, 0]} barSize={14}>
                  {agentChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-xs" style={{ color: "var(--text-faint)" }}>
              No agent data yet
            </div>
          )}
        </div>

        {/* Messages over time */}
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="text-xs font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
            Messages (Last 7 Days)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.daily_messages} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.3} />
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
                strokeWidth={2}
                fill="url(#msgGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {data.agents.map((agent, i) => (
          <motion.div
            key={agent.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl p-3 transition-all duration-200"
            style={{
              backgroundColor: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: agent.color, boxShadow: `0 0 6px ${agent.color}40` }}
              />
              <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {agent.name}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Messages</span>
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                  {agent.total_messages}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Avg Time</span>
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                  {formatMs(agent.avg_response_ms)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Last Active</span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {timeAgo(agent.last_active)}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
