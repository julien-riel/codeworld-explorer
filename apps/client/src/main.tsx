import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installDebugBridge } from "./debug/bridge";

// Pont de debug LECTURE SEULE, actif seulement avec `?debug` (aucun effet sinon).
installDebugBridge();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Élément racine #root introuvable");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
