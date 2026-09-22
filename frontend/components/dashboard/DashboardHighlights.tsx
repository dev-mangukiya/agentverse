"use client";

/**
 * Dashboard Highlights Card — 2-3 derived facts from existing data.
 *
 * Only renders highlights with available=true. No overstated framing —
 * "busiest day" is just the day name + count, no "🔥 Busiest day yet!".
 *
 * Sources:
 *   - Fastest agent: messages.created_at (user→agent timestamp pairs)
 *   - Most active day: messages.created_at grouped by date
 *   - Highest rated: messages.feedback per messages.agent_name
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getAgent, getAgentIcon } from "@/config/agents";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface Highlight {
  id: string;
  label: string;
  value: string | null;
  detail: string;
  source: string;
  available: boolean;
}

// Map highlight IDs to understated icons (inline SVGs, no new icon imports)
const HIGHLIGHT_ICONS: Record<string, React.ReactNode> = {
  fastest_agent: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  busiest_day: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  highest_rated: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  ),
};

export function DashboardHighlights() {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHighlights = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats/highlights`);
        if (res.ok) {
          const data = await res.json();
          setHighlights(data.highlights || []);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchHighlights();
    const interval = setInterval(fetchHighlights, 60000); // Less frequent — derived data
    return () => clearInterval(interval);
  }, []);

  // Only show available highlights
  const available = highlights.filter(h => h.available);

  if (loading) {
    return (
      <div className="shimmer-loading h-16 rounded-2xl" />
    );
  }

  // Don't render the card at all if no highlights are available
  if (available.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-faint)" }}>
        Highlights
      </div>
      <div className={`grid gap-3 ${available.length === 1 ? "grid-cols-1" : available.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
        {available.map((h, i) => {
          const isAgent = (h.id === "fastest_agent" || h.id === "highest_rated") && h.value;
          const agentInfo = isAgent ? getAgent(h.value!) : null;

          return (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {/* Icon */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: agentInfo ? `color-mix(in srgb, ${agentInfo.color} 12%, var(--bg-elevated))` : "var(--bg-hover)",
                  color: agentInfo ? agentInfo.color : "var(--text-faint)",
                }}
              >
                {isAgent && agentInfo ? getAgentIcon(h.value!, 14) : HIGHLIGHT_ICONS[h.id] || HIGHLIGHT_ICONS.busiest_day}
              </div>
              {/* Text */}
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  {h.label}
                </div>
                <div className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {isAgent && agentInfo ? agentInfo.displayName : h.value}
                </div>
                <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                  {h.detail}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
