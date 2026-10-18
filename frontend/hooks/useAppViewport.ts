"use client";
import { useEffect } from "react";

export function useAppViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      // Do not fight pinch zoom.
      if (viewport && viewport.scale !== 1) return;
      document.documentElement.style.setProperty("--app-height", `${viewport?.height ?? window.innerHeight}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--app-height");
    };
  }, []);
}
