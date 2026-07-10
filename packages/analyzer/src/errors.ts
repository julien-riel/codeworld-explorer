/**
 * Erreurs typées du pipeline d'analyse (sprint 2).
 *
 * Chaque défaillance PRÉVISIBLE (limite dépassée, lien sortant, chemin invalide)
 * est une erreur nommée, discriminée par sa classe. Le CLI les rattrape pour
 * afficher un message clair et sortir en code ≠ 0, SANS trace de pile brute
 * (PRD §27.3 : « dépassement → message clair, pas de plantage »). Une erreur non
 * typée reste un bug de l'analyseur, à corriger, jamais à masquer.
 */

/** Base commune : toutes portent un `code` anglais stable et un `message` français. */
export abstract class AnalyzeError extends Error {
  abstract readonly code: string;
}

/** Le chemin fourni n'existe pas, n'est pas un dossier, ou est illisible (PRD §22.2). */
export class InvalidRootError extends AnalyzeError {
  readonly code = "invalid-root";
  constructor(message: string) {
    super(message);
    this.name = "InvalidRootError";
  }
}

/**
 * Un lien symbolique pointe HORS de la racine analysée : refusé par sécurité
 * (PRD §22.2, « refuser les liens symboliques sortants »). Le contenu du dépôt
 * est une donnée non fiable ; on ne suit jamais une cible hors périmètre.
 */
export class OutgoingSymlinkError extends AnalyzeError {
  readonly code = "outgoing-symlink";
  constructor(
    readonly linkPath: string,
    readonly target: string,
  ) {
    super(
      `Lien symbolique sortant refusé : « ${linkPath} » pointe hors de la racine (« ${target} »).`,
    );
    this.name = "OutgoingSymlinkError";
  }
}

/** Une limite de PRD §27.3 est franchie (fichiers inventoriés / analysés). */
export class AnalysisLimitError extends AnalyzeError {
  readonly code = "limit-exceeded";
  constructor(
    readonly limit: string,
    readonly value: number,
    readonly max: number,
  ) {
    super(`Limite « ${limit} » dépassée : ${String(value)} > ${String(max)} (PRD §27.3).`);
    this.name = "AnalysisLimitError";
  }
}

/** Collision d'identifiants dérivés (contrat §4.3) : remède = augmenter `idHashLength`. */
export class IdCollisionError extends AnalyzeError {
  readonly code = "id-collision";
  constructor(readonly paths: readonly string[]) {
    super(
      `Collision d'identifiants pour des chemins distincts : ${paths.join(", ")} (contrat §4.3 : augmenter idHashLength).`,
    );
    this.name = "IdCollisionError";
  }
}

/** La configuration passée en `--config` est illisible ou non conforme. */
export class ConfigError extends AnalyzeError {
  readonly code = "invalid-config";
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * L'argument d'analyse ressemble à une URL de dépôt mais n'est pas une URL GitHub
 * publique reconnue (schéma, hôte ou forme `owner/repo` invalide). Au MVP, seul
 * GitHub public est cloné (PRD §21.1) ; les autres hôtes sont refusés explicitement.
 */
export class InvalidRepoUrlError extends AnalyzeError {
  readonly code = "invalid-repo-url";
  constructor(message: string) {
    super(message);
    this.name = "InvalidRepoUrlError";
  }
}

/**
 * Le clone superficiel a échoué (dépôt inexistant, réseau, `git` absent…). Le
 * message conserve la cause `git` sans exposer d'identifiants (le port de clone
 * neutralise les invites d'authentification, §22.2).
 */
export class GitCloneError extends AnalyzeError {
  readonly code = "git-clone-failed";
  constructor(message: string) {
    super(message);
    this.name = "GitCloneError";
  }
}
