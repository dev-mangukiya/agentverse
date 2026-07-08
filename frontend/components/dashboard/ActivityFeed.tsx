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
  orchestrator: "#4285f4",
  research: "#34a853",
  coding: "#ea4335",
  writer: "#fbbc04",
  critic: "#06b6d4",
  memory: "#8b5cf6",
  data: "#a855f7",
};

function getColor(agentName: string): string {
  const lower = agentName.toLowerCase();
  for (const [key, color] of Object.entries(agentColors)) {
    if (lower.includes(key)) return color;
  }
  return "#9aa0a6";
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
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#e8eaed]">Recent Activity</h3>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34a853] animate-pulse" />
          <span className="text-[10px] text-[#9aa0a6]">Live</span>
        </div>
      </div>

      <div className="space-y-0 max-h-[280px] overflow-y-auto pr-1">
        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex gap-3 py-2">
                <div className="w-2 h-2 rounded-full bg-white/[0.06] mt-1.5 flex-shrink-0 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-20 rounded bg-white/[0.06] animate-pulse" />
                  <div className="h-3 w-40 rounded bg-white/[0.04] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && activities.length === 0 && (
          <div className="text-center text-xs text-[#5f6368] py-8">
            No activity yet — start a chat!
          </div>
        )}

        <AnimatePresence>
          {activities.map((item, i) => {
            const color = getColor(item.agent);
            return (
              <motion.div
                key={`${item.created_at}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex gap-3 py-2"
              >
                <div className="flex flex-col items-center">
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {i < activities.length - 1 && (
                    <div className="w-px flex-1 bg-white/[0.05] mt-1" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-[#c4c7c5]">{item.agent}</span>
                    <span className="text-[10px] text-[#5f6368]">{formatRelative(item.created_at)}</span>
                  </div>
                  <p className="text-xs text-[#9aa0a6] leading-relaxed line-clamp-2">
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
