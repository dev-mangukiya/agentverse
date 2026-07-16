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

const serviceIcons: Record<string, string> = {
  PostgreSQL: "🐘",
  SQLite: "📦",
  Redis: "⚡",
  Qdrant: "🔮",
  "LLM Provider": "🧠",
  Backend: "🖥️",
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

  const statusBarColor = (s: string) => {
    if (s === "ok") return "var(--green)";
    if (s === "loading") return "var(--yellow)";
    return "var(--red)";
  };

  const okCount = services.filter(s => s.status === "ok").length;

  return (
    <div className="glass-panel p-5 card-shine">
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>System Health</h3>
          {!loading && (
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {okCount}/{services.length} services operational
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-dot ${statusColor(overall)}`} />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: overall === "ok" ? "var(--green)" : overall === "checking" ? "var(--yellow)" : "var(--red)" }}
          >
            {overall === "ok" ? "Healthy" : overall === "checking" ? "Checking" : "Issues"}
          </span>
        </div>
      </div>

      <div className="space-y-2.5 relative z-10">
        {loading && (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="shimmer-loading h-12 rounded-xl" />
            ))}
          </div>
        )}

        {!loading && services.map((svc, i) => (
          <motion.div
            key={svc.name}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            className="flex items-center justify-between py-2.5 px-3.5 rounded-xl transition-all duration-200"
            style={{
              backgroundColor: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
              e.currentTarget.style.borderColor = "var(--border-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-raised)";
              e.currentTarget.style.borderColor = "var(--border-subtle)";
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm">{serviceIcons[svc.name] || "⚙️"}</span>
              <div>
                <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{svc.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {/* Status bar */}
              <div
                className="w-16 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--bg-hover)" }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: svc.status === "ok" ? "100%" : svc.status === "loading" ? "50%" : "15%" }}
                  transition={{ delay: i * 0.1 + 0.2, duration: 0.6, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: statusBarColor(svc.status),
                    boxShadow: `0 0 6px ${statusBarColor(svc.status)}`,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono font-medium w-16 text-right" style={{ color: "var(--text-faint)" }}>
                {svc.status === "loading" ? "checking…" : svc.status}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
