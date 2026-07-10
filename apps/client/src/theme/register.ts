/**
 * Enregistre l'implémentation procédurale comme kit ACTIF des 3 thèmes v0.
 *
 * Point d'intégration : la scène importe ce module (`import "./theme/register"`, ou
 * appelle `registerProceduralKits()`) au démarrage, puis résout la géométrie d'un objet
 * via `getThemeKit(node.theme)?.resolve(node.theme, obj.kind)`. Le MÊME kit sans état est
 * enregistré sous les trois clés : `resolve` s'appuie sur son argument `theme`, pas sur la
 * clé d'enregistrement.
 */

import { registerThemeKit } from "./ThemeKit";
import { PROCEDURAL_THEMES, proceduralThemeKit } from "./procedural";

/** Enregistre le kit procédural pour `project-hall`, `control-room`, `neutral`. Idempotent. */
export function registerProceduralKits(): void {
  for (const theme of PROCEDURAL_THEMES) {
    registerThemeKit(theme, proceduralThemeKit);
  }
}

// Enregistrement au chargement du module : `import "./theme/register"` suffit à activer les kits.
registerProceduralKits();
