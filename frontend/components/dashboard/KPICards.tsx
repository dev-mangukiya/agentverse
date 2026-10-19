"use client";

import { useState, useEffect } from "react";
import {
  WorkspaceIcon,
  type WorkspaceIconName,
} from "@/components/workspace/WorkspaceIcon";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");
interface Stats {
  conversations: { total: number; today: number };
  messages: {
    total: number;
    today: number;
    agent_total: number;
    agent_today: number;
  };
  llm: { provider: string; model: string; configured: boolean };
}

export function KPICards({ onStartTask }: { onStartTask?: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Could not load activity");
        const data = await res.json();
        if (!controller.signal.aborted) {
          setStats(data);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [retry]);

  const cards: {
    label: string;
    icon: WorkspaceIconName;
    value?: number | string;
    detail?: string;
    tone: string;
  }[] = [
    {
      label: "Conversations",
      icon: "history",
      value: stats?.conversations.total,
      detail: `${stats?.conversations.today ?? 0} started today`,
      tone: "mint",
    },
    {
      label: "Messages",
      icon: "pen",
      value: stats?.messages.total,
      detail: `${stats?.messages.today ?? 0} exchanged today`,
      tone: "peach",
    },
    {
      label: "Team responses",
      icon: "team",
      value: stats?.messages.agent_total,
      detail: `${stats?.messages.agent_today ?? 0} responses today`,
      tone: "lavender",
    },
    {
      label: "AI provider",
      icon: "spark",
      value: stats?.llm.configured ? "Configured" : "Add a key",
      detail: stats?.llm.configured
        ? stats.llm.provider
        : "Finish setup to start creating",
      tone: "butter",
    },
  ];
  if (!loading && !stats)
    return (
      <div role="alert" className="directory-error">
        Your activity is unavailable.{" "}
        <button className="underline" onClick={() => setRetry((n) => n + 1)}>
          Try again
        </button>
      </div>
    );

  return (
    <>
      {failed && stats && (
        <p role="status" className="insights-stale">
          Showing the last available activity.{" "}
          <button className="underline" onClick={() => setRetry((n) => n + 1)}>
            Refresh
          </button>
        </p>
      )}
      <div className="studio-kpi-grid" aria-busy={loading}>
        {cards.map((card) => (
          <div key={card.label} className={`studio-kpi tone-${card.tone}`}>
            <div className="kpi-heading">
              <span>{card.label}</span>
              <span className="starter-icon">
                <WorkspaceIcon name={card.icon} size={18} />
              </span>
            </div>
            {loading || !stats ? (
              <div className="shimmer-loading h-10 w-24 rounded-lg my-3" />
            ) : (
              <>
                <strong
                  className={typeof card.value === "string" ? "kpi-status" : ""}
                >
                  {typeof card.value === "number"
                    ? card.value.toLocaleString()
                    : card.value}
                </strong>
                <p>{card.detail}</p>
              </>
            )}
          </div>
        ))}
      </div>
      {!loading && stats?.conversations.total === 0 && (
        <div className="insights-first-task">
          <div>
            <h2>Your first idea starts the story.</h2>
            <p>
              Try a question, a rough draft, or a problem you’ve been meaning to
              solve.
            </p>
          </div>
          {onStartTask && (
            <button className="studio-primary" onClick={onStartTask}>
              Start a task
              <WorkspaceIcon name="arrow" size={17} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
