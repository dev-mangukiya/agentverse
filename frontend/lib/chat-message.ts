import type { createLiveText } from "./chat-motion";

export interface ChatMessageData {
  id: string | number;
  role: "user" | "agent" | "system" | "tool";
  renderKey?: string;
  animateIn?: boolean;
  isStreaming?: boolean;
  incomplete?: boolean;
  interrupted?: boolean;
  awaiting?: boolean;
  liveText?: ReturnType<typeof createLiveText>;
  agent_name?: string;
  content: string;
  tool_name?: string;
  created_at?: string;
  contributing_agents?: string[];
  pipeline_duration_ms?: number;
  feedback?: "up" | "down" | null;
  critic_score?: number | null;
  critic_review?: string | null;
  review_status?: "not_requested" | "pending" | "completed" | "partial" | "failed" | "unavailable" | "skipped_busy";
}
