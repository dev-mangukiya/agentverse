"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquareIcon } from "../icons/Icons";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface ActivityItem {
  agent: string;
  content: string;
  role: string;
  created_at: string | null;
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

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

/** Remove bracket placeholders like [Recipient Name/Email] */
function cleanContent(text: string): string {
  let cleaned = stripMarkdown(text);
  // Replace [placeholder text] with ellipsis
  cleaned = cleaned.replace(/\[[A-Z][^\]]{3,60}\]/g, "…");
  // Collapse multiple ellipsis
  cleaned = cleaned.replace(/…(\s*…)+/g, "…");
  return cleaned.trim();
}

/** Deduplicate: if consecutive entries are within 2s and one is orchestrator, drop orchestrator */
function deduplicateActivity(items: ActivityItem[]): ActivityItem[] {
  if (items.length <= 1) return items;
  const result: ActivityItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const curr = items[i];
    const next = items[i + 1];
    if (
      next &&
      curr.created_at &&
      next.created_at &&
      Math.abs(new Date(curr.created_at).getTime() - new Date(next.created_at).getTime()) < 2000 &&
      curr.agent.toLowerCase().includes("orchestrator")
    ) {
      // Skip orchestrator entry, keep the worker's output
      continue;
    }
    result.push(curr);
  }
  return result;
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

  const dedupedActivities = useMemo(() => deduplicateActivity(activities), [activities]);

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Recent Activity</h3>
      </div>

      <div className="space-y-0 max-h-[280px] overflow-y-auto pr-1">
        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex gap-3 py-2">
                <div className="shimmer-loading w-6 h-6 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="shimmer-loading h-3 w-20 rounded" />
                  <div className="shimmer-loading h-3 w-40 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && dedupedActivities.length === 0 && (
          <div className="text-center py-8 px-4">
            <div className="mb-2" style={{ color: "var(--text-faint)" }}><MessageSquareIcon size={24} /></div>
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>
              No activity yet — start a chat!
            </div>
          </div>
        )}

        <AnimatePresence>
          {dedupedActivities.map((item, i) => (
            <motion.div
              key={`${item.created_at}-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              className="flex gap-3 py-2.5 transition-colors duration-150 rounded-lg px-1 -mx-1"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div className="flex flex-col items-center">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    color: "var(--text-faint)",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{item.agent}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{formatRelative(item.created_at)}</span>
                </div>
                <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "var(--text-muted)" }}>
                  {cleanContent(item.content)}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
