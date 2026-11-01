import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Mediator } from "./app/mediator";
import { Remote } from "./app/remote";
import { browserImages } from "./runtime/crop";
import { Root } from "./views/Root";

const CLOCK_MS = 30_000;

function start() {
  const container = document.getElementById("root");
  if (!container) throw new Error("#root が見つかりません。");
  const forge = window.forge;
  const mediator = new Mediator({
    forge,
    images: browserImages,
    schedule: (ms, task) => void window.setTimeout(task, ms),
    now: () => Date.now(),
  });
  forge.onCommand((command) => mediator.dispatch({ type: "menu", command }));
  window.setInterval(() => mediator.dispatch({ type: "clock", now: Date.now() }), CLOCK_MS);
  mediator.dispatch({ type: "app/start" });
  const remote = new Remote(mediator, { schedule: (ms, task) => void window.setTimeout(task, ms) });
  forge.onRemote(remote.handle);
  createRoot(container).render(
    <StrictMode>
      <Root mediator={mediator} />
    </StrictMode>,
  );
}

start();
