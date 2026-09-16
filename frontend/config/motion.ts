/**
 * Central motion tokens for Framer Motion animations.
 *
 * IMPORTANT: Duration values here (in seconds) must stay in sync with
 * the CSS custom properties in app/globals.css (in milliseconds):
 *   --duration-instant  ↔  DURATION.instant
 *   --duration-fast     ↔  DURATION.fast
 *   --duration-base     ↔  DURATION.base
 */

import type { Transition, Variants } from "framer-motion";

/* ─── Duration (seconds) ─────────────────────────────────── */
export const DURATION = {
  instant: 0.1,   // hover/press feedback
  fast: 0.18,     // most state transitions
  base: 0.26,     // panel/route transitions
} as const;

/* ─── Easing ─────────────────────────────────────────────── */
export const EASE = {
  /** Decelerate — for things entering/appearing */
  out: [0.16, 1, 0.3, 1] as const,
  /** Symmetric — for state toggles */
  inOut: [0.4, 0, 0.2, 1] as const,
};

/* ─── Transitions ────────────────────────────────────────── */
export const transition: Record<string, Transition> = {
  instant: { duration: DURATION.instant, ease: EASE.out },
  fast:    { duration: DURATION.fast,    ease: EASE.out },
  base:    { duration: DURATION.base,    ease: EASE.out },
  layout:  { duration: DURATION.base,    ease: EASE.inOut },
};

/* ─── Reusable Variants ──────────────────────────────────── */

/** Route/panel enter — opacity + subtle y slide. Exit is opacity-only (no y shift). */
export const fadeSlideIn: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit:    { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.inOut } },
};

/** Stagger container — use on parent, children use rowItem */
export const stagger: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.05,
    },
  },
};

/** Staggered row/item — used as child of stagger parent */
export const rowItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.fast, ease: EASE.out },
  },
};

/** Tactile press feedback — use with whileTap */
export const press = { scale: 0.97 };

/** Scale-in for checkmarks, badges, etc. */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1, transition: transition.fast },
  exit:    { opacity: 0, scale: 0, transition: { duration: DURATION.instant } },
};
