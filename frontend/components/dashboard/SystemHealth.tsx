"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface HealthService {
  name: string;
  status: "ok" | "unreachable" | "loading";
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function SystemHealth() {
  const [services, setServices] = useState<HealthService[]>([
    { name: "PostgreSQL", status: "loading" },
    { name: "Redis", status: "loading" },
    { name: "Qdrant", status: "loading" },
  ]);
  const [overall, setOverall] = useState<string>("checking");

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        const data = await res.json();
        setOverall(data.status);
        setServices([
          { name: "PostgreSQL", status: data.services.postgres },
          { name: "Redis", status: data.services.redis },
          { name: "Qdrant", status: data.services.qdrant },
        ]);
      } catch {
        setOverall("offline");
        setServices([
          { name: "PostgreSQL", status: "unreachable" },
          { name: "Redis", status: "unreachable" },
          { name: "Qdrant", status: "unreachable" },
        ]);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (s: string) => {
    if (s === "ok") return "status-dot--ok";
    if (s === "loading") return "status-dot--pending";
    return "status-dot--error";
  };

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">System Health</h3>
        <span className={`status-dot ${statusColor(overall)}`} />
      </div>

      <div className="space-y-3">
        {services.map((svc, i) => (
          <motion.div
            key={svc.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]"
          >
            <div className="flex items-center gap-3">
              <span className={`status-dot ${statusColor(svc.status)}`} />
              <span className="text-sm text-zinc-300">{svc.name}</span>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              {svc.status === "loading" ? "checking..." : svc.status}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
