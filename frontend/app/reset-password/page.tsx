"use client";
import { useState } from "react";
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl mb-6">Reset your password</h1><form onSubmit={async e => {
    e.preventDefault(); setBusy(true);
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      if (!response.ok) throw new Error("This link is invalid or expired, or the password exceeds 72 bytes.");
      history.replaceState(null, "", "/reset-password"); setPassword(""); setStatus("Password changed. Return to AgentVerse to sign in.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not reset your password."); }
    finally { setBusy(false); }
  }}><label htmlFor="password">New password</label><input id="password" className="block border rounded-lg p-3 w-full my-3 text-black" required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/><button disabled={busy} className="border rounded-lg px-4 py-2">{busy ? "Saving…" : "Change password"}</button></form><p role="status" className="my-4">{status}</p><a href="/">Return to AgentVerse</a></main>;
}
