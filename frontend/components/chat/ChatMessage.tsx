"use client";

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { getAgent } from "@/config/agents";
import { getAuthHeaders } from "@/lib/auth";
import type { ChatMessageData } from "@/lib/chat-message";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const noSubscription = () => () => {};

export const ChatMessage = memo(function ChatMessage({ message, status, busy, onSend, onFeedback }: {
  message: ChatMessageData;
  status?: string;
  busy: boolean;
  onSend: (text: string) => void;
  onFeedback: (id: string | number, feedback: "up" | "down") => void;
}) {
  const fallback = useCallback(() => message.content, [message.content]);
  const content = useSyncExternalStore(message.liveText?.subscribe ?? noSubscription, message.liveText?.getSnapshot ?? fallback, fallback);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const user = message.role === "user";
  const stopped = message.interrupted || message.incomplete;
  const meta = message.agent_name ? getAgent(message.agent_name.toLowerCase()) : null;
  const approval = content.match(/\[APPROVAL_REQUIRED:([^:]+):(.*?)\]/);
  const download = content.match(/\[DOWNLOAD_LINK:([^:]+):([^\]]+)\]/);
  const cleanContent = content.replace(/\[DOWNLOAD_LINK:[^\]]+\]/g, "").replace(/\[APPROVAL_REQUIRED:[^\]]+\]/g, "").trim();
  const files = user ? content.match(/\[(?:File|Attached image|Attached document): ([^\]]+)\]/g) || [] : [];
  const userText = user ? content.replace(/(?:^|\n\n)\[(?:File|Attached image|Attached document): [^\]]+\](?:\n```[\s\S]*?```|\n[\s\S]*?(?=\n\n\[|$))?/g, "").trim() : "";
  const pending = message.awaiting || message.isStreaming;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cleanContent);
      setCopied(true);
      setActionError("");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch { setActionError("Couldn't copy. Select the text to copy it manually."); }
  };
  const feedback = async (value: "up" | "down") => {
    if (savingFeedback) return;
    setSavingFeedback(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/chat/messages/${message.id}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ feedback: value }),
      });
      if (!response.ok) throw new Error();
      onFeedback(message.id, value);
      setActionError("");
    } catch { setActionError("Couldn't save your feedback. Please try again."); }
    finally { setSavingFeedback(false); }
  };

  return <article className={`chat-message ${user ? "is-user" : message.role === "system" ? "is-system" : "is-assistant"} ${message.animateIn ? "is-new" : ""}`} aria-label={user ? "You" : message.role === "system" ? "Chat notice" : "AgentVerse reply"}>
    {user ? <div className="user-message-bubble">
      {userText && <div className="user-message-text">{userText}</div>}
      {files.length > 0 && <div className="message-attachments">{files.map((file, index) => <span key={index}>{file.replace(/\[(?:File|Attached image|Attached document): /, "").replace(/\]$/, "")}</span>)}</div>}
    </div> : <div className="assistant-message-body">
      {message.role !== "system" && <div className="assistant-message-label"><span className="assistant-mark" aria-hidden="true">✳</span><strong>AgentVerse</strong>{meta && message.agent_name !== "orchestrator" && <span className="assistant-specialty">{meta.displayName}</span>}</div>}
      {cleanContent && <MarkdownRenderer content={cleanContent}/>}
      {pending && <div className={`reply-progress ${cleanContent ? "has-content" : ""}`} role="status">
        <span className="response-dots" aria-hidden="true"><i/><i/><i/></span>
        <span>{cleanContent ? status === "Stopping…" ? status : "Writing…" : status || "Thinking…"}</span>
      </div>}
      {!pending && stopped && <p className="reply-stopped">{message.interrupted ? "Stopped" : "Response interrupted"}</p>}
      {approval && !pending && <div className="approval-card"><strong>Approval required</strong><p>{approval[2]}</p><code>{approval[1]}</code><div><button disabled={busy} onClick={() => onSend(`APPROVED action: ${approval[1]}`)}>Approve</button><button disabled={busy} onClick={() => onSend(`REJECTED action: ${approval[1]}`)}>Decline</button></div></div>}
      {message.role === "agent" && !pending && cleanContent && <div className="reply-actions">
        <button onClick={copy} aria-label={copied ? "Response copied" : "Copy response"}>{copied ? "Copied ✓" : "Copy"}</button>
        {!stopped && <><button onClick={() => feedback("up")} disabled={savingFeedback} aria-label="Helpful response" aria-pressed={message.feedback === "up"}>Helpful</button><button onClick={() => feedback("down")} disabled={savingFeedback} aria-label="Unhelpful response" aria-pressed={message.feedback === "down"}>Not helpful</button></>}
        {download && <a href={`${API_URL}/api/v1/documents/download/${download[1]}`} download={download[2]}>Download {download[2]}</a>}
      </div>}
      {actionError && <p className="reply-action-error" role="alert">{actionError}</p>}
      {!pending && message.critic_review && <details className="reply-review"><summary>Quality review{message.critic_score != null ? ` · ${message.critic_score}/10` : ""}</summary><MarkdownRenderer content={message.critic_review}/></details>}
    </div>}
  </article>;
});
