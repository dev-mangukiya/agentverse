/** Server-issued guest bearer token. Legacy random IDs are exchanged once. */
const SESSION_KEY = "agentverse_guest_token";
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
let pending: Promise<void> | null = null;
export function getSessionId(): string {
  return typeof window === "undefined" ? "" : localStorage.getItem(SESSION_KEY) || "";
}
export function ensureSession(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch(`${API_URL}/api/v1/auth/guest`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Session-ID": getSessionId() },
      body: JSON.stringify({ legacy_id: localStorage.getItem("agentverse_session_id") }),
    });
    if (!response.ok) throw new Error("Could not start a private session");
    const data = await response.json();
    localStorage.setItem(SESSION_KEY, data.token);
    localStorage.removeItem("agentverse_session_id");
  })().finally(() => { pending = null; });
  return pending;
}
