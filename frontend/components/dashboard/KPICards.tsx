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
      // Ease out cubic
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
    gradient: "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #7c3aed 100%)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 3C6.477 3 2 6.925 2 11.75c0 2.278.98 4.35 2.59 5.88L3 21l4.5-1.45A10.3 10.3 0 0 0 12 20.5c5.523 0 10-3.925 10-8.75S17.523 3 12 3Z" stroke="white" strokeWidth="1.5"/>
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
    gradient: "linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    getValue: (s: Stats) => s.messages.total,
    getDisplayValue: (s: Stats) => s.messages.total.toString(),
    getSubtext: (s: Stats) => {
      const diff = s.messages.today - s.messages.yesterday;
      return `${diff >= 0 ? "+" : ""}${diff} vs yesterday`;
    },
    isNumeric: true,
  },
  {
    key: "agent_responses",
    label: "Agent Responses",
    gradient: "linear-gradient(135deg, #a855f7 0%, #9333ea 50%, #7c3aed 100%)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="white" strokeWidth="1.5"/>
        <path d="M5 20a7 7 0 0 1 14 0" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    getValue: (s: Stats) => s.messages.agent_total,
    getDisplayValue: (s: Stats) => s.messages.agent_total.toString(),
    getSubtext: (s: Stats) => `${s.messages.agent_today} today`,
    isNumeric: true,
  },
  {
    key: "uptime",
    label: "Uptime",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5"/>
        <path d="M12 7v5l3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpiConfig.map((kpi, i) => (
        <motion.div
          key={kpi.key}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: i * 0.1, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="glass-panel p-5 group card-shine"
          style={{ position: "relative" }}
        >
          {/* Decorative gradient orb in background */}
          <div
            className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{
              background: kpi.gradient,
              filter: "blur(30px)",
            }}
          />

          <div className="relative z-10">
            <div className="flex items-start justify-between mb-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {kpi.label}
              </span>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
                style={{
                  background: kpi.gradient,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
              >
                {kpi.icon}
              </div>
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
          </div>
        </motion.div>
      ))}
    </div>
  );
}
