"use client";

import { motion } from "framer-motion";

const activities = [
  {
    agent: "Orchestrator",
    action: "Created execution plan with 4 steps",
    time: "2s ago",
    color: "bg-brand-500",
  },
  {
    agent: "Research",
    action: 'Searching web for "LangGraph best practices"',
    time: "5s ago",
    color: "bg-emerald-500",
  },
  {
    agent: "Coding",
    action: "Generated Python module: graph_builder.py",
    time: "12s ago",
    color: "bg-purple-500",
  },
  {
    agent: "Critic",
    action: "Review passed — score 0.89 / 1.0",
    time: "18s ago",
    color: "bg-pink-500",
  },
  {
    agent: "Writer",
    action: "Drafted summary report (342 words)",
    time: "25s ago",
    color: "bg-amber-500",
  },
  {
    agent: "Memory",
    action: "Stored 3 new embeddings in Qdrant",
    time: "30s ago",
    color: "bg-cyan-500",
  },
];

export function ActivityFeed() {
  return (
    <div className="glass-panel p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Live Activity</h3>

      <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
        {activities.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex gap-3 py-2"
          >
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full ${item.color} mt-1.5 flex-shrink-0`} />
              {i < activities.length - 1 && (
                <div className="w-px flex-1 bg-white/[0.06] mt-1" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-zinc-300">{item.agent}</span>
                <span className="text-[10px] text-zinc-600">{item.time}</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed truncate">
                {item.action}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
