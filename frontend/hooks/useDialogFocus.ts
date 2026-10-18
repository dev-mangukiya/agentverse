"use client";

import { useEffect, useRef } from "react";

const activeDialogs: symbol[] = [];
const focusable = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep keyboard interaction in the topmost open dialog and restore its trigger. */
export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = Symbol("dialog");
    activeDialogs.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const elements = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(focusable) ?? []).filter(el => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (elements()[0] ?? ref.current)?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (activeDialogs[activeDialogs.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const items = elements();
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); ref.current?.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      const index = activeDialogs.indexOf(id);
      if (index >= 0) activeDialogs.splice(index, 1);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
