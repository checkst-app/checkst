import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { AppIcon } from "./ui";

export function TitleBar({ title, onClose, maximizable = true }: { title: string; onClose?: () => void; maximizable?: boolean }) {
  const { t } = useT();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const w = getCurrentWindow();
    w.isMaximized().then(setMaximized).catch(() => {});
    const un = w.onResized(() => {
      w.isMaximized().then(setMaximized).catch(() => {});
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <AppIcon size={18} radius={5} />
        <span className="titlebar-title" data-tauri-drag-region>
          {title}
        </span>
      </div>
      <div className="caption-buttons">
        <button type="button" className="caption-btn" title={t("window.minimize")} onClick={() => getCurrentWindow().minimize()}>
          <Minus size={14} />
        </button>
        {maximizable && (
          <button type="button" className="caption-btn" title={t("window.maximize")} onClick={() => getCurrentWindow().toggleMaximize()}>
            {maximized ? <Copy size={11} style={{ transform: "scaleX(-1)" }} /> : <Square size={11} />}
          </button>
        )}
        <button type="button" className="caption-btn caption-close" title={t("window.close")} onClick={() => (onClose ? onClose() : getCurrentWindow().close())}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
