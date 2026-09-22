"use client";

import { useEffect } from "react";

interface KeyboardShortcutActions {
  openCommandPalette?: () => void;
  newChat?: () => void;
  toggleSidebar?: () => void;
  closeModal?: () => void;
  openShortcuts?: () => void;
}

/**
 * Global keyboard shortcuts:
 * - Cmd/Ctrl+K → Open Command Palette
 * - Cmd/Ctrl+N → New conversation
 * - Cmd/Ctrl+/ → Toggle sidebar
 * - ?          → Open keyboard shortcuts overlay
 * - Escape     → Close any open modal/panel
 */
export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;

      // Don't interfere with input fields (except for Escape and Cmd shortcuts)
      const target = e.target as HTMLElement;
      const isInInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "Escape") {
        actions.closeModal?.();
        return;
      }

      if (isMetaOrCtrl) {
        if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          actions.openCommandPalette?.();
        } else if (e.key === "n" || e.key === "N") {
          if (!isInInput) {
            e.preventDefault();
            actions.newChat?.();
          }
        } else if (e.key === "/") {
          e.preventDefault();
          actions.toggleSidebar?.();
        }
        return;
      }

      // "?" key — open shortcuts overlay (only when not in input)
      if ((e.key === "?" || (e.key === "/" && e.shiftKey)) && !isInInput) {
        e.preventDefault();
        actions.openShortcuts?.();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
