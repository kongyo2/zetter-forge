import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

async function start() {
  // ブラウザだけで開いたとき（開発中の画面確認）は、保存先をメモリにした代用ブリッジを使う
  if (import.meta.env.DEV && !("forge" in window)) await import("./devBridge");
  const container = document.getElementById("root");
  if (!container) throw new Error("#root が見つかりません。");
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
