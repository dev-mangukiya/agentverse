"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DatabaseIcon, ZapIcon, SparklesIcon, BrainIcon, ServerIcon, SettingsIcon } from "../icons/Icons";

interface HealthService {
  name: string;
  status: "ok" | "unreachable" | "optional" | "loading";
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const serviceDisplayNames: Record<string, string> = {
  postgres: "PostgreSQL",
  sqlite: "SQLite",
  redis: "Redis",
  qdrant: "Qdrant",
  llm: "LLM Provider",
};

const serviceIcons: Record<string, React.ReactNode> = {
  PostgreSQL: <DatabaseIcon size={14} />,
  SQLite: <DatabaseIcon size={14} />,
  Redis: <ZapIcon size={14} />,
  Qdrant: <SparklesIcon size={14} />,
  "LLM Provider": <BrainIcon size={14} />,
  Backend: <ServerIcon size={14} />,
};

export function SystemHealth() {
  const [services, setServices] = useState<HealthService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/health`);
        const data = await res.json();
        if (data.services && typeof data.services === "object") {
          const mapped = Object.entries(data.services).map(([key, value]) => {
            const v = value as string;
            let status: HealthService["status"] = "unreachable";
            if (v === "ok" || v === "configured") status = "ok";
            else if (v === "not_running" || v === "not_configured" || v === "no_api_key") status = "optional";
            return { name: serviceDisplayNames[key] || key, status };
          }) as HealthService[];
          setServices(mapped);
        }
      } catch {
        setServices([{ name: "Backend", status: "unreachable" }]);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const statusDotColor = (s: string) => {
    if (s === "ok") return "var(--green)";
    if (s === "loading") return "var(--yellow)";
    if (s === "optional") return "var(--text-faint)";
    return "var(--red)";
  };

  const statusLabel = (s: string) => {
    if (s === "ok") return "ok";
    if (s === "loading") return "checking…";
    if (s === "optional") return "not configured";
    return "unreachable";
  };

  const okCount = services.filter(s => s.status === "ok").length;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>System Health</h3>
          {!loading && (
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {okCount}/{services.length} services operational
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="shimmer-loading h-10 rounded-xl" />
            ))}
          </div>
        )}

        {!loading && services.map((svc, i) => (
          <motion.div
            key={svc.name}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            className="flex items-center justify-between py-2 px-3 rounded-xl transition-colors duration-150"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div className="flex items-center gap-2.5">
              <span style={{ color: "var(--text-faint)" }}>{serviceIcons[svc.name] || <SettingsIcon size={14} />}</span>
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{svc.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: statusDotColor(svc.status) }}
              />
              <span className="text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>
                {statusLabel(svc.status)}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
