"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface ActivityItem {
  agent: string;
  content: string;
  role: string;
  created_at: string | null;
}

const agentColors: Record<string, string> = {
  orchestrator: "var(--agent-orchestrator)",
  research: "var(--agent-research)",
  coding: "var(--agent-coding)",
  writer: "var(--agent-writer)",
  critic: "var(--agent-critic)",
  memory: "var(--agent-memory)",
  data: "var(--agent-data)",
};

const agentIcons: Record<string, string> = {
  orchestrator: "🧠",
  research: "🔬",
  coding: "💻",
  writer: "✍️",
  critic: "🔍",
  memory: "🧩",
  data: "📊",
};

function getColor(agentName: string): string {
  const lower = agentName.toLowerCase();
  for (const [key, color] of Object.entries(agentColors)) {
    if (lower.includes(key)) return color;
  }
  return "var(--text-muted)";
}

function getIcon(agentName: string): string {
  const lower = agentName.toLowerCase();
  for (const [key, icon] of Object.entries(agentIcons)) {
    if (lower.includes(key)) return icon;
  }
  return "🤖";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats`);
        if (res.ok) {
          const data = await res.json();
          setActivities(data.recent_activity || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
    const interval = setInterval(fetchActivity, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-panel p-5 card-shine">
      <div className="flex items-center justify-between mb-4 relative z-10">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Recent Activity</h3>
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: "var(--green)",
              boxShadow: "0 0 6px var(--green)",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Live</span>
        </div>
      </div>

      <div className="space-y-0 max-h-[280px] overflow-y-auto pr-1 relative z-10">
        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex gap-3 py-2">
                <div className="shimmer-loading w-7 h-7 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="shimmer-loading h-3 w-20 rounded" />
                  <div className="shimmer-loading h-3 w-40 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && activities.length === 0 && (
          <div className="text-center py-8 px-4">
            <div className="text-2xl mb-2">💬</div>
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>
              No activity yet — start a chat!
            </div>
          </div>
        )}

        <AnimatePresence>
          {activities.map((item, i) => {
            const color = getColor(item.agent);
            const icon = getIcon(item.agent);
            return (
              <motion.div
                key={`${item.created_at}-${i}`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="flex gap-3 py-2.5 group cursor-default transition-all duration-200 rounded-lg px-1 -mx-1"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div className="flex flex-col items-center">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${color} 12%, var(--bg-panel))`,
                      border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
                    }}
                  >
                    {icon}
                  </div>
                  {i < activities.length - 1 && (
                    <div
                      className="w-px flex-1 mt-1.5"
                      style={{
                        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 20%, transparent), transparent)`,
                      }}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{item.agent}</span>
                    <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{formatRelative(item.created_at)}</span>
                  </div>
                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "var(--text-muted)" }}>
                    {item.content}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
