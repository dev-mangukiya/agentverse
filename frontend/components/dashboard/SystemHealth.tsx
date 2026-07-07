"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface HealthService {
  name: string;
  status: "ok" | "unreachable" | "loading";
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const serviceDisplayNames: Record<string, string> = {
  postgres: "PostgreSQL",
  sqlite: "SQLite",
  redis: "Redis",
  qdrant: "Qdrant",
  llm: "LLM Provider",
};

export function SystemHealth() {
  const [services, setServices] = useState<HealthService[]>([]);
  const [overall, setOverall] = useState<string>("checking");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        const data = await res.json();
        setOverall(data.status);
        if (data.services && typeof data.services === "object") {
          const mapped = Object.entries(data.services).map(([key, value]) => ({
            name: serviceDisplayNames[key] || key,
            status: (value as string) === "ok" || (value as string) === "configured" ? "ok" : "unreachable",
          })) as HealthService[];
          setServices(mapped);
        }
      } catch {
        setOverall("offline");
        setServices([{ name: "Backend", status: "unreachable" }]);
      } finally {
        setLoading(false);
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
