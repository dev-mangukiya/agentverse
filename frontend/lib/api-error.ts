/** Turn FastAPI validation payloads into renderable, useful form errors. */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) return fallback;
  const detail = (payload as { detail: unknown }).detail;
  if (typeof detail === "string") return detail || fallback;
  if (Array.isArray(detail)) {
    const messages = detail.flatMap(item => item && typeof item.msg === "string" ? [item.msg] : []);
    return messages.join("; ") || fallback;
  }
  if (detail && typeof detail === "object" && "msg" in detail && typeof detail.msg === "string") return detail.msg;
  return fallback;
}
