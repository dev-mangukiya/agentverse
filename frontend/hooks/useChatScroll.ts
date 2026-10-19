"use client";

import { useCallback, useEffect, useRef, type RefObject, type MutableRefObject } from "react";
import { createScrollFollower } from "@/lib/chat-motion";

export function useChatScroll(
  viewportRef: RefObject<HTMLDivElement>,
  contentRef: RefObject<HTMLDivElement>,
  followingRef: MutableRefObject<boolean>,
  showLatest: (visible: boolean) => void,
  conversationId: string | null,
  loading: boolean,
) {
  const followerRef = useRef<ReturnType<typeof createScrollFollower> | null>(null);
  const jumpOnResize = useRef(true);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    jumpOnResize.current = true;
    followerRef.current?.stop();
  }, [conversationId]);

  useEffect(() => {
    if (loading) jumpOnResize.current = true;
  }, [loading]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const follower = createScrollFollower(
      { request: requestAnimationFrame, cancel: cancelAnimationFrame },
      () => viewport.clientHeight ? {
        top: viewport.scrollTop,
        bottom: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      } : null,
      top => { viewport.scrollTop = top; },
      () => preference.matches,
    );
    followerRef.current = follower;
    const detach = () => {
      previousTop = viewport.scrollTop;
      followingRef.current = false;
      follower.stop();
      showLatest(true);
    };
    let previousTop = viewport.scrollTop;
    const onScroll = () => {
      const movingDown = viewport.scrollTop > previousTop;
      previousTop = viewport.scrollTop;
      if (follower.running) return;
      const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 24;
      if (!atBottom) followingRef.current = false;
      else if (movingDown) followingRef.current = true;
      showLatest(!followingRef.current);
    };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) detach(); };
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const onTouchMove = (event: TouchEvent) => {
      const nextY = event.touches[0]?.clientY ?? touchY;
      if (nextY > touchY) detach();
      touchY = nextY;
    };
    const onPointerDown = (event: PointerEvent) => {
      // Let dragging the native scrollbar take over even during an animation.
      const rect = viewport.getBoundingClientRect();
      if (event.clientX >= rect.left + viewport.clientWidth || event.button === 1) detach();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) detach();
    };
    const observer = new ResizeObserver(() => {
      if (loadingRef.current || !followingRef.current || !viewport.clientHeight) return;
      if (jumpOnResize.current) {
        follower.jump();
        jumpOnResize.current = false;
      } else follower.follow();
    });
    observer.observe(viewport);
    observer.observe(content);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: true });
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      follower.stop();
      followerRef.current = null;
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("keydown", onKeyDown);
    };
  }, [viewportRef, contentRef, followingRef, showLatest]);

  return useCallback(() => {
    followingRef.current = true;
    showLatest(false);
    followerRef.current?.follow();
  }, [followingRef, showLatest]);
}
