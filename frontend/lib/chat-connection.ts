/** Accept both an origin and the legacy /ws setting used by deployed clients. */
export function chatSocketUrl(apiUrl: string, configuredUrl: string | undefined, conversationId: string): string {
  const url = new URL(configuredUrl?.trim() || apiUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";
  if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid chat connection URL");
  }
  const base = url.pathname.replace(/\/+$/, "").replace(/(?:\/api\/v1\/chat)?\/ws$/, "");
  url.pathname = `${base}/api/v1/chat/ws/${encodeURIComponent(conversationId)}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
