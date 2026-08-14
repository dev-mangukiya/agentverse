"use client";

import { useEffect, useRef } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const PING_INTERVAL = 4 * 60 * 1000; // 4 minutes

/**
 * Silent heartbeat that pings the backend health endpoint every 4 minutes
 * while the app is open. This keeps Render's free tier from spinning down.
 * 
 * - Only pings when the tab is visible (pauses when hidden)
 * - Uses AbortController for clean cancellation
 * - Silent — never shows errors to the user
 */
export function useKeepAlive() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ping = async () => {
      // Don't ping when the tab is hidden
      if (document.hidden) return;
      
      try {
        controllerRef.current?.abort();
        controllerRef.current = new AbortController();
        
        await fetch(`${API_URL}/health`, {
          method: "GET",
          signal: controllerRef.current.signal,
          cache: "no-store",
        });
      } catch {
        // Silent — we don't care about failures
      }
    };

    // Initial ping after a short delay (don't block page load)
    const initialTimer = setTimeout(ping, 5000);

    // Then every 4 minutes
    intervalRef.current = setInterval(ping, PING_INTERVAL);

    // Pause/resume on tab visibility change
    const onVisibilityChange = () => {
      if (!document.hidden) {
        ping(); // Ping immediately when tab becomes visible
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      controllerRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
