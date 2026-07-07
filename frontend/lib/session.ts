/**
 * Anonymous browser session ID.
 *
 * Generates a unique ID per browser and persists it in localStorage.
 * Used to scope conversations so each visitor has their own chat history.
 * NOT a security mechanism — just isolation for a demo app.
 */

const SESSION_KEY = "agentverse_session_id";

function generateId(): string {
  // crypto.randomUUID() is available in all modern browsers
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "";

  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
