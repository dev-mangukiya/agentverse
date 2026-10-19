type FrameClock = {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
};

// Coalesce network bursts before parsing Markdown. Keep the exact text and
// flush synchronously on completion, including when background tabs pause RAF.
export function createTextBuffer(clock: FrameClock, publish: (text: string) => void) {
  let text = "";
  let published = "";
  let frame: number | null = null;
  let lastPaint = -Infinity;
  let closed = false;
  const flush = () => {
    if (frame !== null) clock.cancel(frame);
    frame = null;
    if (!closed && text !== published) {
      published = text;
      publish(text);
    }
  };
  const paint = (now: number) => {
    frame = null;
    if (closed) return;
    if (now - lastPaint < 32) {
      frame = clock.request(paint);
      return;
    }
    lastPaint = now;
    flush();
  };
  return {
    append(token: string) {
      if (closed || !token) return;
      text += token;
      if (frame === null) frame = clock.request(paint);
    },
    flush,
    cancel() {
      closed = true;
      if (frame !== null) clock.cancel(frame);
      frame = null;
    },
  };
}

// One moving target instead of restarting a native smooth scroll per token.
// Reading the target each frame also handles wrapping, images, and resizing.
export function createScrollFollower(
  clock: FrameClock,
  read: () => { top: number; bottom: number } | null,
  write: (top: number) => void,
  reducedMotion: () => boolean,
) {
  let frame: number | null = null;
  let lastTime: number | null = null;
  const stop = () => {
    if (frame !== null) clock.cancel(frame);
    frame = null;
    lastTime = null;
  };
  const paint = (now: number) => {
    const position = read();
    if (!position) { stop(); return; }
    const elapsed = lastTime === null ? 16 : Math.min(now - lastTime, 64);
    lastTime = now;
    const distance = position.bottom - position.top;
    if (reducedMotion() || Math.abs(distance) < 1) {
      write(position.bottom);
      stop();
      return;
    }
    write(position.top + distance * (1 - Math.exp(-elapsed / 65)));
    frame = clock.request(paint);
  };
  return {
    follow() {
      if (frame === null) frame = clock.request(paint);
    },
    jump() {
      stop();
      const position = read();
      if (position) write(position.bottom);
    },
    stop,
    get running() { return frame !== null; },
  };
}
