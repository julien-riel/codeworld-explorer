import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuration Vite minimale (PRD 19.2/19.4). La caméra FPS, l'UI et le store
// seront ajoutés par d'autres agents.
export default defineConfig({
  plugins: [react()],
});
