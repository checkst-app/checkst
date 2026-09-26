import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { isMobile } from "./lib/platform";
import "./styles/tokens.css";
import "./styles/app.css";

// The Android app has its own touch layout, loaded as a separate chunk.
const MobileApp = lazy(() => import("./mobile/MobileApp"));

// No browser context menu or reload shortcuts in the desktop app.
if (!import.meta.env.DEV) {
  window.addEventListener("contextmenu", (e) => {
    const el = e.target as HTMLElement;
    if (!el.closest("input, textarea")) e.preventDefault();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) e.preventDefault();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isMobile ? (
      <Suspense fallback={null}>
        <MobileApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
