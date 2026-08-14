"use client";

import { useEffect } from "react";

interface KeyboardShortcutActions {
  focusInput?: () => void;
  newChat?: () => void;
  toggleSidebar?: () => void;
  closeModal?: () => void;
}

/**
 * Global keyboard shortcuts:
 * - Cmd/Ctrl+K → Focus chat input
 * - Cmd/Ctrl+N → New conversation
 * - Cmd/Ctrl+/ → Toggle sidebar
 * - Escape → Close any open modal/panel
 */
export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;

      // Don't interfere with input fields (except for Escape)
      const target = e.target as HTMLElement;
      const isInInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "Escape") {
        actions.closeModal?.();
        return;
      }

      if (!isMetaOrCtrl) return;

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        actions.focusInput?.();
      } else if (e.key === "n" || e.key === "N") {
        if (!isInInput) {
          e.preventDefault();
          actions.newChat?.();
        }
      } else if (e.key === "/") {
        e.preventDefault();
        actions.toggleSidebar?.();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
