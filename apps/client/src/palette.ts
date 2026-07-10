/**
 * Palette produit unique (PRD §9.5, §10.3, §23.2).
 *
 * Un seul jeu de couleurs nommées, partagé par la scène 3D et l'interface 2D, pour
 * garantir la cohérence visuelle inter-zones (PRD §10.3). Chaque teinte porte un
 * NOM sémantique : le code ne manipule jamais un hex nu.
 *
 * Accessibilité (PRD §23.2) : les couples texte/fond sont choisis pour un contraste
 * conforme WCAG AA (≥ 4.5:1 pour le texte courant, ≥ 3:1 pour les grands éléments) ;
 * les ratios approximatifs sont notés en commentaire. RÈGLE DURE : ne jamais coder
 * une information par la SEULE couleur — chaque état (sélection, favori, erreur…)
 * doit s'accompagner d'une forme, d'un libellé ou d'une icône côté rendu.
 */

/**
 * La palette. Fond sombre par défaut (l'explorateur 3D vit en pénombre), teintes
 * désaturées pour un rendu low-poly reposant (PRD §9.5).
 */
export const PALETTE = {
  // ── Fonds et surfaces (du plus profond au plus clair) ──
  /** Fond de scène / ciel ; base de tout contraste. */
  void: "#0e1116",
  /** Surface de panneau 2D posée sur `void`. */
  surface: "#161b22",
  /** Surface surélevée (carte de galerie, entête de panneau). */
  surfaceRaised: "#1f2630",
  /** Trait de séparation / bordure discrète (≥ 3:1 sur `surface`). */
  border: "#303a46",
  /** Lignes de grille au sol de la scène, très discrètes. */
  grid: "#242c36",

  // ── Texte (sur `void`/`surface`) ──
  /** Texte principal ; ~13:1 sur `void`, ~12:1 sur `surface`. */
  textPrimary: "#e6edf3",
  /** Texte secondaire / métadonnées ; ~7:1 sur `void`. */
  textMuted: "#9aa4b2",
  /** Texte désactivé ; ~4.6:1 sur `void`, réservé au non-essentiel. */
  textFaint: "#6b7684",

  // ── Accent primaire (marque, liens, éléments actifs) ──
  /** Accent produit (bleu). ~6:1 sur `void`. */
  accent: "#4c9aff",
  /** Accent atténué (survol léger, remplissage de piste). */
  accentMuted: "#2c5a99",
  /** Texte/icône posé SUR un aplat `accent` (contraste inversé, ~8:1). */
  onAccent: "#06121f",

  // ── États d'interaction (toujours doublés d'une forme/icône côté rendu) ──
  /** Anneau de focus clavier (PRD §23.1) ; jaune vif, ~10:1 sur `void`. */
  focus: "#ffd166",
  /** Objet/salle sélectionné (violet) — accompagné d'un liseré, jamais couleur seule. */
  selection: "#a371f7",
  /** Survol (halo froid léger). */
  hover: "#6ea8fe",
  /** Favori (or) — accompagné d'une icône étoile, jamais couleur seule. */
  favorite: "#f2cc60",

  // ── États sémantiques (doublés d'un libellé/icône) ──
  /** Erreur (version de schéma refusée, échec de chargement). ~5:1 sur `void`. */
  danger: "#ff6b6b",
  /** Avertissement. */
  warning: "#f0a202",
  /** Succès / disponible. */
  success: "#56d364",
  /** Information neutre. */
  info: "#58a6ff",

  // ── Accents de thème architectural (PRD §10, ThemeId v0) ──
  /** `project-hall` — hall d'accueil, bleu institutionnel. */
  themeProjectHall: "#6ea8fe",
  /** `control-room` — salle de contrôle, ambre-rouge technique. */
  themeControlRoom: "#ff7b72",
  /** `neutral` — zones ordinaires, gris désaturé. */
  themeNeutral: "#8b949e",
} as const;

/** Nom d'une couleur de la palette (clé de `PALETTE`). */
export type PaletteColorName = keyof typeof PALETTE;

/** Valeur hexadécimale d'une couleur de la palette. */
export type PaletteColor = (typeof PALETTE)[PaletteColorName];

/** Résout un nom de palette en hex ; typé pour interdire tout nom hors palette. */
export function color(name: PaletteColorName): PaletteColor {
  return PALETTE[name];
}

/**
 * Accent de thème par `ThemeId` v0. Les valeurs hors v0 retombent sur `themeNeutral`,
 * de sorte qu'aucun thème réservé (phase 1) ne casse le rendu.
 */
export const THEME_ACCENT: Readonly<Record<string, PaletteColorName>> = {
  "project-hall": "themeProjectHall",
  "control-room": "themeControlRoom",
  neutral: "themeNeutral",
};

/** Retourne le nom de palette de l'accent d'un thème (défaut : `themeNeutral`). */
export function themeAccentName(theme: string): PaletteColorName {
  return THEME_ACCENT[theme] ?? "themeNeutral";
}
