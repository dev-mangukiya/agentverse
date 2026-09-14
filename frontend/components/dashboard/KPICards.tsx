"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface Stats {
  conversations: { total: number; today: number };
  messages: { total: number; today: number; yesterday: number; agent_total: number; agent_today: number };
  uptime: string;
  llm: { provider: string; model: string; configured: boolean };
}

function AnimatedNumber({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<ReturnType<typeof requestAnimationFrame>>();

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = value;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    };

    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value, duration]);

  return <>{display}</>;
}

const kpiConfig = [
  {
    key: "conversations",
    label: "Total Chats",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M12 3C6.477 3 2 6.925 2 11.75c0 2.278.98 4.35 2.59 5.88L3 21l4.5-1.45A10.3 10.3 0 0 0 12 20.5c5.523 0 10-3.925 10-8.75S17.523 3 12 3Z" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    getValue: (s: Stats) => s.conversations.total,
    getDisplayValue: (s: Stats) => s.conversations.total.toString(),
    getSubtext: (s: Stats) => `+${s.conversations.today} today`,
    isNumeric: true,
  },
  {
    key: "messages",
    label: "Messages Sent",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    getValue: (s: Stats) => s.messages.total,
    getDisplayValue: (s: Stats) => s.messages.total.toString(),
    getSubtext: (s: Stats) => `+${s.messages.today} today`,
    isNumeric: true,
  },
  {
    key: "agent_responses",
    label: "Agent Responses",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    getValue: (s: Stats) => s.messages.agent_total,
    getDisplayValue: (s: Stats) => s.messages.agent_total.toString(),
    getSubtext: (s: Stats) => `+${s.messages.agent_today} today`,
    isNumeric: true,
  },
  {
    key: "uptime",
    label: "Uptime",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    getValue: (s: Stats) => 0,
    getDisplayValue: (s: Stats) => s.uptime,
    getSubtext: (s: Stats) => `${s.llm.provider} · ${s.llm.model.split('/').pop()?.slice(0, 20) || s.llm.model}`,
    isNumeric: false,
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {kpiConfig.map((kpi, i) => (
        <motion.div
          key={kpi.key}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: i * 0.1, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-2xl p-4 md:p-5 transition-colors duration-200"
          style={{
            backgroundColor: "var(--bg-raised)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-3">
            <span style={{ color: "var(--text-faint)" }}>{kpi.icon}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {kpi.label}
            </span>
          </div>
          {loading || !stats ? (
            <>
              <div className="shimmer-loading h-8 w-20 rounded-lg mb-2" />
              <div className="shimmer-loading h-3.5 w-28 rounded-md" />
            </>
          ) : (
            <>
              <div className="text-2xl font-bold mb-1.5 tracking-tight" style={{ color: "var(--text-primary)" }}>
                {kpi.isNumeric ? (
                  <AnimatedNumber value={kpi.getValue(stats)} />
                ) : (
                  kpi.getDisplayValue(stats)
                )}
              </div>
              <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{kpi.getSubtext(stats)}</div>
            </>
          )}
        </motion.div>
      ))}
    </div>
  );
}
