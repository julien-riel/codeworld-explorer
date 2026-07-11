# Plan de réalisation — CodeWorld Explorer

**Version :** 1.0
**Date :** 9 juillet 2026
**Référence :** PRD v3.0
**Horizon couvert :** Phase 0 (prototype gameplay) et Phase 1 (MVP). La phase 2 n'est planifiée qu'après le GO du pilote.

---

## 1. Hypothèses de planification

- **Équipe :** 2 à 3 développeurs polyvalents TypeScript. Un profil à l'aise avec Three.js/R3F, un profil à l'aise avec l'analyse statique et l'outillage Node. Pas de rôle artiste dédié : la direction artistique est un travail de curation (PRD 10.4).
- **Cadence :** sprints de 2 semaines, démo systématique en fin de sprint.
- **Durée estimée :** 4 sprints pour la phase 0 (8 semaines), 5 sprints pour la phase 1 (10 semaines), soit environ 18 semaines jusqu'au pilote. À 2 développeurs, prévoir 20 à 22 semaines.
- **Principe directeur :** le jalon GO/NO-GO de fin de phase 0 est réel. Si la spatialisation ne démontre aucun gain sur les tâches tests, la phase 1 n'est pas lancée telle quelle.

Si la composition de l'équipe diffère, ajuster les affectations des lots B et C (les deux seuls réellement parallélisables) plutôt que le séquencement.

## 2. Lots de travail (workstreams)

| Lot | Contenu | Sections PRD |
|---|---|---|
| **A — Contrat et layout** | Schéma `world.json`, validation Zod, moteur de layout en fonction pure, tests de snapshot | 18, 19.2, FR-026/027 |
| **B — Client 3D** | Scène R3F, contrôles, UI 2D, recherche, panneaux, mini-carte, visite guidée | 9, 11, 14.3–14.7, 19.4 |
| **C — Pipeline** | CLI, clone, ts-morph, classification, résumés IA, index, cache | 12, 13, 14.1–14.2, 19.3, 20 |
| **D — Assets et thèmes** | Curation CC0, pipeline `gltf-transform`, manifeste de provenance, thèmes | 9.5, 10, FR-029 |
| **E — Validation** | Corpus de référence, protocole d'étude, instrumentation, tests comparatifs | 24, 31 |

Le lot A est le chemin critique du démarrage : B et C en dépendent tous deux. Il doit être stabilisé (pas figé) dès le sprint 1.

## 3. Phase 0 — Prototype gameplay (sprints 1 à 4)

**Objectif de phase :** prouver que la spatialisation aide au moins un cas d'usage concret, avec des mondes fabriqués à la main. Aucun pipeline complet, aucune IA obligatoire.

### Sprint 1 — Fondations

- Monorepo pnpm : `packages/world-schema`, `packages/analyzer` (coquille), `apps/client`.
- Schéma `world.json` v0 : Manifest, SourceNode, WorldLayout, SpatialNode. Validation Zod.
- Moteur de layout v0 : fonction pure arbre → salles rectangulaires reliées par portes, graine déterministe, premiers tests de snapshot.
- Client : canvas R3F, sol, murs génériques, caméra FPS (WASD + souris), confinement aux zones sans moteur physique.
- CI GitHub Actions : lint, tests, snapshots.
- **Livrable de démo :** on marche dans un monde généré depuis un `world.json` écrit à la main.

### Sprint 2 — Boucle d'exploration

- Générateur embryonnaire : script qui produit un `world.json` depuis une arborescence locale réelle (sans analyse de symboles ni IA).
- Objets de fichiers sélectionnables : survol, clic, étiquettes.
- Panneau de code 2D superposé : contenu du fichier, coloration (Monaco lazy), lien GitHub.
- Architecture deux arbres React (scène / UI) et store Zustand en place.
- Fil d'Ariane cliquable et bouton Hall principal.
- **Livrable de démo :** ouvrir un vrai dépôt cloné, marcher jusqu'à un fichier, lire son code, revenir au hall.

### Sprint 3 — Anti-friction et thèmes

- Recherche client (MiniSearch) sur chemins et noms de fichiers, avec téléportation.
- Mini-carte et point-and-click.
- Pipeline d'assets `gltf-transform` : normalisation, palette, Meshopt; manifeste de provenance.
- Trois thèmes en géométries instanciées à partir de kits Kenney : hall, salle de contrôle, espace générique.
- Options de confort : réduction des mouvements, vitesse, désactivation des transitions.
- Budgets de rendu mesurés (draw calls, instances, FPS) sur deux mondes tests.
- **Livrable de démo :** règles anti-friction du PRD 9.4 vérifiables — deux actions max depuis la recherche.

### Sprint 4 — Test comparatif et GO/NO-GO

- Préparer 2 ou 3 mondes soignés (dépôts réels de tailles différentes).
- Protocole du lot E : cinq questions d'orientation, comparaison GitHub seul vs prototype, 6 à 8 participants suffisent à ce stade.
- Corrections d'ergonomie issues des premières sessions.
- Décision documentée : **GO / PIVOT / NO-GO** avec les données du test.
- **Livrable de phase :** rapport de test + décision. Critère indicatif : les participants répondent au moins aussi vite qu'avec GitHub et jugent majoritairement la carte et la téléportation utiles.

## 4. Phase 1 — MVP (sprints 5 à 9)

**Objectif de phase :** pipeline complet, client complet, galerie de 12 à 20 mondes, étude pilote formelle.

### Sprint 5 — Analyseur TypeScript

- CLI `codeworld analyze <url>` : métadonnées GitHub, clone superficiel, inventaire, exclusions, limites (PRD 27.3).
- Parsing ts-morph : symboles, exports, imports résolus.
- Cache filesystem par hash de contenu; journal de progression par étape.
- Écriture d'artefacts conformes au schéma, contenus de fichiers adressés par hash.
- **Livrable :** un dépôt réel analysé en une commande, monde explorable dans le client sans modification de celui-ci.

### Sprint 6 — Classification et déterminisme

- Couches 1 à 3 de classification : configuration YAML, règles déterministes, heuristiques d'analyse statique; scores et preuves dans l'artefact.
- Couche 4 (classification LLM des cas ambigus) **reportée au sprint 7** avec la couche sémantique, seule dépendance IA (décision ADR-0006). L'infrastructure reste prête : `decisionSource: "ai"` et l'emplacement `ai` du hash de config sont réservés.
- Tests de reproductibilité : deux exécutions → artefacts identiques (FR-026); refus propre des schémas inconnus côté client (FR-027).
- Mapping catégorie → thème branché; taxonomie complète avec repli `unknown`.
- **Livrable :** classification correcte à vue d'œil sur 5 dépôts variés (couches 1-3, sources de décision visibles en revue de code).

### Sprint 7 — Couche sémantique

- Couche 4 de classification (reportée du sprint 6, ADR-0006) : classification LLM des cas ambigus, température 0, modèle épinglé, cache de verdicts committé (PRD 12.6); vérification effective de FR-028.
- Résumés IA en lot : dépôt, dossiers, fichiers; citations de sources; invalidation par commit; étape entièrement facultative (artefact valide sans elle).
- Visite guidée générée : 3 à 7 arrêts depuis README, points d'entrée et classifications; navigation séquentielle dans le client, pause et sortie libre.
- Index de recherche enrichi : symboles exportés, filtres par catégorie et type.
- Affichage des imports directs du fichier sélectionné (profondeur 1, masqués par défaut).
- **Livrable :** parcours complet du persona Alex — visite guidée, recherche d'un symbole, lecture d'un résumé sourcé.

### Sprint 8 — Thèmes complets, galerie et finition

- Extension à dix thèmes + générique, curation KayKit/Quaternius complémentaire, dans les budgets de rendu.
- Galerie statique : fiches des dépôts (commit, licence, technologies, vignette).
- Favoris, récents et préférences persistés localement.
- Accessibilité de base : navigation clavier, mode sans déplacement libre, contrastes, tailles de texte (PRD 23).
- Instrumentation analytique légère des métriques produit (PRD 24.2).
- **Livrable :** produit utilisable de bout en bout par un externe sans accompagnement.

### Sprint 9 — Corpus, durcissement et pilote

- Génération et publication du corpus complet de 12 à 20 dépôts; régénération en CI.
- Robustesse pipeline : encodages, chemins hostiles, dépôts malformés, gros fichiers; détection de secrets exclus de l'IA et de l'artefact.
- Vérification des critères d'acceptation (PRD 17) et des budgets de performance sur tout le corpus.
- Étude pilote formelle (PRD 31.2) : trois conditions, questions standardisées, mesure de la North Star.
- **Livrable de phase :** MVP conforme à la définition de terminé (PRD 34) + rapport pilote alimentant la décision de phase 2.

## 5. Chemin critique et dépendances

```
Schéma v0 + layout (S1) ──► Client explorable (S1–S2) ──► Anti-friction + thèmes (S3) ──► Test GO/NO-GO (S4)
        │
        └──► Analyseur (S5) ──► Classification (S6) ──► Sémantique IA (S7) ──► Corpus + pilote (S9)
                                                              Thèmes/galerie (S8) ────────┘
```

- Le schéma peut évoluer après le sprint 1, mais chaque changement passe par `world-schema` avec bump de version et migration des mondes de test — jamais de champ ad hoc.
- Les sprints 5 à 7 (pipeline) et le travail continu sur le client peuvent avancer en parallèle à 3 développeurs; à 2, le client se met en pause relative pendant les sprints 5 et 6.
- L'étape IA (S6 couche 4, S7) est la seule dépendance externe (fournisseur de modèle). Elle est conçue pour être débranchable : aucun autre lot ne doit l'attendre.

## 6. Définition de terminé (par tâche)

- Code revu par un pair et fusionné sur la branche principale.
- Tests unitaires pour la logique; snapshot pour tout ce qui touche au layout ou au schéma.
- Le corpus de test se régénère sans erreur en CI.
- Budgets de performance non régressés (FPS, draw calls, taille d'artefact).
- Aucune exigence Must du PRD contournée sans décision documentée.

## 7. Rituels et gouvernance

- **Démo de fin de sprint** ouverte, jouable au clavier par n'importe qui — pas une présentation de diapositives.
- **Revue des budgets** (performance, taille d'artefact, coût IA) à chaque fin de sprint, en 10 minutes, chiffres à l'appui.
- **Décisions d'architecture** consignées en ADR courts dans le dépôt (`decisions/`), notamment : évolutions du schéma, choix du fournisseur IA, exceptions aux budgets.
- **Backlog unique** priorisé par les user stories du PRD (section 29); tout ajout hors PRD passe par une mise à jour du PRD.

## 8. Risques d'exécution et parades

| Risque | Signal d'alerte | Parade |
|---|---|---|
| Le schéma bouge sans arrêt | PRs qui modifient `world-schema` à chaque sprint | Geler un noyau minimal au S2; extensions par champs optionnels versionnés |
| Le client absorbe tout le temps (l'attrait du jeu) | Vélocité pipeline nulle aux S5–S6 | Affectation explicite d'un développeur au pipeline; démo pipeline obligatoire |
| Perfectionnisme visuel avant validation | Temps passé sur les assets au-delà du S3 | Trois thèmes maximum en phase 0, règle des dix objets, revue de budget |
| Le test GO/NO-GO est complaisant | Critères redéfinis après coup | Protocole et critères écrits au S3, avant les sessions |
| Coût ou latence IA du pipeline | Génération du corpus > 1 h ou coût par dépôt anormal | Résumés hiérarchiques, génération limitée aux zones importantes, cache vérifié |
| Dérive vers l'infrastructure phase 2 | Apparition de serveur, BD ou file dans les PRs | Rappel PRD 19.6/30.6 : introduction sur douleur mesurée uniquement |

## 9. Jalons récapitulatifs

| Jalon | Fin de sprint | Critère de passage |
|---|---|---|
| J1 — Monde explorable | S1 | Marcher dans un monde issu d'un `world.json` |
| J2 — Boucle complète | S2 | Dépôt réel → marcher → lire le code → revenir |
| J3 — Anti-friction | S3 | Règles 9.4 vérifiées, 3 thèmes instanciés |
| **J4 — GO/NO-GO** | S4 | Rapport de test comparatif et décision |
| J5 — Pipeline autonome | S5 | Une commande → un monde |
| J6 — Classification reproductible | S6 | FR-026 vérifiée sur 5 dépôts (couches 1-3); FR-028 au S7 avec la couche 4 |
| J7 — Couche sémantique | S7 | Visite guidée + résumés sourcés |
| J8 — Produit complet | S8 | Utilisable sans accompagnement |
| **J9 — Pilote** | S9 | Rapport pilote vs critères PRD 24.3 |