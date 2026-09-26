import { useEffect, useRef } from "react";

// Android's back button walks the WebView history. Every open screen or sheet pushes an
// entry and closes itself on popstate; closing it in the UI removes the entry again.
const handlers: (() => void)[] = [];
let skip = 0;

window.addEventListener("popstate", () => {
  if (skip > 0) {
    skip--;
    return;
  }
  handlers.pop()?.();
});

export function useBack(open: boolean, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    const handler = () => ref.current();
    handlers.push(handler);
    history.pushState({ checkst: handlers.length }, "");
    return () => {
      const i = handlers.lastIndexOf(handler);
      if (i < 0) return; // already closed by the back button
      handlers.splice(i, 1);
      skip++;
      history.back();
    };
  }, [open]);
}
