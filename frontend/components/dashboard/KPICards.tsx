"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface Stats {
  conversations: { total: number; today: number };
  messages: { total: number; today: number; yesterday: number; agent_total: number; agent_today: number };
  uptime: string;
  llm: { provider: string; model: string; configured: boolean };
}

const kpiConfig = [
  {
    key: "conversations",
    label: "Total Chats",
    color: "from-[#6366f1] to-[#4f46e5]",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 3C6.477 3 2 6.925 2 11.75c0 2.278.98 4.35 2.59 5.88L3 21l4.5-1.45A10.3 10.3 0 0 0 12 20.5c5.523 0 10-3.925 10-8.75S17.523 3 12 3Z" stroke="white" strokeWidth="1.5"/>
      </svg>
    ),
    getValue: (s: Stats) => s.conversations.total.toString(),
    getSubtext: (s: Stats) => `+${s.conversations.today} today`,
  },
  {
    key: "messages",
    label: "Messages Sent",
    color: "from-[#10b981] to-[#059669]",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    getValue: (s: Stats) => s.messages.total.toString(),
    getSubtext: (s: Stats) => {
      const diff = s.messages.today - s.messages.yesterday;
      return `${diff >= 0 ? "+" : ""}${diff} vs yesterday`;
    },
  },
  {
    key: "agent_responses",
    label: "Agent Responses",
    color: "from-[#a855f7] to-[#9333ea]",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="white" strokeWidth="1.5"/>
        <path d="M5 20a7 7 0 0 1 14 0" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    getValue: (s: Stats) => s.messages.agent_total.toString(),
    getSubtext: (s: Stats) => `${s.messages.agent_today} today`,
  },
  {
    key: "uptime",
    label: "Uptime",
    color: "from-[#f59e0b] to-[#d97706]",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5"/>
        <path d="M12 7v5l3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    getValue: (s: Stats) => s.uptime,
    getSubtext: (s: Stats) => `${s.llm.provider} · ${s.llm.model.split('/').pop()?.slice(0, 20) || s.llm.model}`,
  },
];

export function KPICards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats`);
        if (res.ok) setStats(await res.json());
      } catch {
        // silently fail; show skeleton
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpiConfig.map((kpi, i) => (
        <motion.div
          key={kpi.key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.4 }}
          className="glass-panel p-5 group hover:border-white/[0.1] transition-all duration-300"
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {kpi.label}
            </span>
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity`}>
              {kpi.icon}
            </div>
          </div>
          {loading || !stats ? (
            <>
              <div className="h-7 w-16 rounded-md bg-white/[0.06] animate-pulse mb-1" />
              <div className="h-3 w-24 rounded-md bg-white/[0.04] animate-pulse" />
            </>
          ) : (
            <>
              <div className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{kpi.getValue(stats)}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{kpi.getSubtext(stats)}</div>
            </>
          )}
        </motion.div>
      ))}
    </div>
  );
}
