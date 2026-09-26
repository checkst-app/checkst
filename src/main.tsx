import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/app.css";

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
    <App />
  </React.StrictMode>,
);
