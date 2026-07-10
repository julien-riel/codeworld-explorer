# PRD — Explorateur FPS de code source GitHub

**Statut :** Proposition détaillée
**Version :** 3.0
**Date :** 9 juillet 2026
**Nom de travail :** CodeWorld Explorer
**Type de produit :** Application Web professionnelle de compréhension et d'exploration de bases de code

---

## 1. Résumé exécutif

CodeWorld Explorer transforme un dépôt GitHub en environnement 3D navigable à la première personne afin d'aider les développeurs à comprendre rapidement une base de code, à s'y orienter et à construire une carte mentale durable de son architecture.

Le produit ne vise pas à reproduire Git, son historique ou ses branches. Il crée une couche spatiale et sémantique au-dessus du code source : les dossiers deviennent des espaces, les fichiers deviennent des objets consultables et les responsabilités architecturales sont exprimées par des métaphores visuelles cohérentes. L'utilisateur peut lire le code immédiatement, rechercher un symbole, se téléporter, suivre des dépendances et consulter des explications IA sourcées.

Le principe directeur est le suivant : **la 3D doit réduire le temps nécessaire pour comprendre le système, et non l'augmenter**. Chaque déplacement physique possède donc un équivalent rapide : recherche, téléportation, mini-carte, fil d'Ariane, favoris et raccourcis.

**Le pivot architectural du produit est un artefact autonome : `world.json`.** Toute l'analyse d'un dépôt (arborescence, symboles, classification, layout, résumés IA) produit un seul artefact versionné. Le client 3D ne connaît que ce contrat. Cette décision découple entièrement l'itération sur le gameplay et l'expérience utilisateur — la vraie inconnue du produit — de toute infrastructure serveur, qui est reportée à la phase où l'utilité du concept aura été démontrée.

Le MVP ne comporte **aucun serveur applicatif**. Il se compose d'un pipeline d'analyse en ligne de commande et d'une application Web statique. Les mondes sont générés sur un corpus contrôlé de dépôts publics TypeScript/JavaScript et servis comme fichiers statiques. Le flux d'importation en libre-service par URL, les comptes utilisateurs, les dépôts privés et la collaboration sont reportés aux phases ultérieures.

## 2. Problème à résoudre

### 2.1 Constat

Comprendre une base de code inconnue demande souvent plusieurs heures ou plusieurs jours. L'information est répartie entre l'arborescence, le README, les fichiers de configuration, les conventions du framework, les dépendances, les diagrammes parfois obsolètes et la connaissance tacite de l'équipe.

Les outils traditionnels sont efficaces pour modifier du code, mais moins adaptés à la construction rapide d'une représentation globale. L'explorateur de fichiers expose la structure physique sans expliquer la responsabilité des dossiers. Les graphes de dépendances deviennent rapidement illisibles. La documentation est rarement synchronisée avec le code. Les assistants IA répondent à des questions ponctuelles, mais ne fournissent pas toujours un espace persistant permettant de mémoriser où se trouvent les concepts.

### 2.2 Utilisateurs affectés

- Développeurs arrivant dans une nouvelle équipe.
- Mainteneurs reprenant un système ancien ou peu documenté.
- Architectes devant expliquer la structure et les flux d'un système.
- Responsables techniques évaluant les zones complexes ou fortement couplées.
- Enseignants et étudiants apprenant l'architecture logicielle.
- Équipes devant présenter une base de code à des personnes moins familières avec ses conventions.

### 2.3 Problème central

**Comment permettre à une personne de comprendre plus rapidement la structure, les responsabilités et les principaux flux d'une base de code, tout en conservant un accès direct et précis au code réel?**

### 2.4 Hypothèse produit

Une représentation spatiale stable, enrichie d'une couche sémantique et combinée à des outils de navigation instantanée, améliore l'orientation et la mémorisation par rapport à une exploration reposant uniquement sur une arborescence 2D.

Cette hypothèse est la seule inconnue qui justifie le produit. L'architecture technique du MVP est donc entièrement subordonnée à sa validation : tout ce qui n'est pas nécessaire pour tester le gameplay et l'expérience utilisateur est différé.

## 3. Vision produit

Créer le meilleur environnement professionnel pour **visiter, expliquer et mémoriser** une base de code.

À terme, un utilisateur doit pouvoir ouvrir un dépôt, comprendre ses grandes zones en quelques minutes, suivre le parcours d'une fonctionnalité, consulter les fichiers importants et partager une visite guidée sans devoir produire manuellement un diagramme distinct du code.

### 3.1 Principes de conception

1. **Le code demeure la source de vérité.** Toute représentation doit permettre de revenir au fichier, au symbole et à la ligne correspondante.
2. **La 3D est un moyen, pas une fin.** Une métaphore qui ne facilite pas la compréhension doit être supprimée.
3. **Le déplacement ne doit jamais devenir une friction.** Chaque destination est accessible par recherche ou téléportation.
4. **La structure réelle et la structure logique doivent coexister.** L'IA ne masque pas l'organisation physique du dépôt.
5. **La complexité est progressive.** Les relations et métriques apparaissent à la demande.
6. **L'environnement doit être stable et mémorable.** Le même commit et la même configuration produisent une disposition déterministe.
7. **Les explications IA doivent être traçables.** Elles citent les fichiers et symboles ayant servi à produire la réponse.
8. **L'infrastructure suit le jeu.** Aucune pièce d'infrastructure n'est introduite avant qu'une douleur réelle et mesurée ne l'exige. Le contrat `world.json` est la seule frontière soignée dès le premier jour.

## 4. Objectifs et non-objectifs

### 4.1 Objectifs du MVP

- Analyser un dépôt GitHub public TypeScript/JavaScript via un pipeline en ligne de commande et produire un artefact `world.json` complet, déterministe et versionné.
- Générer l'artefact en moins de cinq minutes pour un dépôt de taille moyenne.
- Charger l'artefact dans une application Web statique et entrer dans un monde 3D stable en quelques secondes.
- Représenter les dossiers comme des espaces reliés et les fichiers comme des objets consultables.
- Classifier les dossiers selon quelques responsabilités architecturales usuelles.
- Permettre la lecture du code, la consultation de sa structure et l'ouverture dans GitHub.
- Offrir une navigation FPS accessible, une mini-carte, un fil d'Ariane, une recherche instantanée côté client et une téléportation.
- Inclure des résumés IA sourcés des dossiers et fichiers analysés, générés en lot dans le pipeline.
- Produire une visite guidée automatique des zones principales.
- Constituer une galerie de 12 à 20 mondes pré-générés couvrant des dépôts publics variés.
- Mesurer si le produit réduit le temps nécessaire pour répondre à des questions d'orientation architecturale.

### 4.2 Non-objectifs du MVP

- Offrir un flux d'importation en libre-service par URL avec suivi de progression. Ce flux est du plomberie connue; il est introduit en phase 2 lorsque l'utilité du concept est démontrée.
- Opérer un serveur applicatif, une base de données, une file de travaux ou un moteur de recherche serveur.
- Gérer des comptes utilisateurs ou une persistance serveur.
- Représenter les branches, commits, merges et conflits Git.
- Fournir un IDE complet ou remplacer VS Code/JetBrains.
- Modifier, compiler ou exécuter le code.
- Analyser précisément tous les langages et frameworks.
- Reconstituer tous les flux d'exécution dynamiques.
- Supporter les dépôts privés ou les organisations GitHub Enterprise.
- Offrir un mode multijoueur.
- Produire des environnements photoréalistes ou des animations complexes.
- Garantir que toute classification IA est correcte sans intervention humaine.

## 5. Personas

### 5.1 Alex — Nouveau développeur

**Contexte :** rejoint une équipe qui maintient un monolithe TypeScript de 300 000 lignes.
**Objectif :** comprendre où se trouvent l'authentification, la logique métier et l'accès aux données.
**Difficultés :** conventions inconnues, documentation partielle, peur de modifier la mauvaise zone.
**Valeur attendue :** visite guidée, carte du dépôt, résumés et chemins directs vers les fichiers clés.

### 5.2 Samira — Architecte logiciel

**Contexte :** accompagne plusieurs équipes et doit expliquer les frontières du système.
**Objectif :** montrer les responsabilités, les dépendances et les principaux parcours.
**Difficultés :** diagrammes obsolètes, graphes trop denses, audiences hétérogènes.
**Valeur attendue :** mode présentation, vues logiques et liens vers le code réel.

### 5.3 Marc — Mainteneur d'un système ancien

**Contexte :** reprend une application peu documentée dont les auteurs ne sont plus disponibles.
**Objectif :** identifier les points d'entrée et les zones à risque avant une modification.
**Difficultés :** structure incohérente, dépendances implicites, fichiers volumineux.
**Valeur attendue :** classification assistée par IA, métriques, relations entrantes et sortantes.

### 5.4 Léa — Enseignante ou formatrice

**Contexte :** enseigne les architectures Web à partir de projets réels.
**Objectif :** rendre visibles les rôles des contrôleurs, services, modèles et tests.
**Difficultés :** concepts abstraits et manque de repères pour les étudiants.
**Valeur attendue :** métaphores visuelles, visites guidées et parcours d'exécution simplifiés.

## 6. Cas d'usage prioritaires

1. Découvrir l'organisation générale d'un dépôt inconnu.
2. Trouver rapidement le fichier ou symbole responsable d'une fonctionnalité.
3. Comprendre le rôle d'un dossier ou d'un fichier sans tout lire.
4. Suivre une relation simple, par exemple contrôleur vers service.
5. Montrer l'architecture d'un système pendant une séance d'onboarding.
6. Revenir aux zones visitées, créer des favoris et conserver une carte mentale.
7. Comparer la structure physique avec un regroupement logique proposé par l'IA.
8. Identifier les fichiers volumineux, fortement dépendants ou insuffisamment testés dans une phase ultérieure.

## 7. Parcours utilisateurs

### 7.1 Ouverture d'un monde et première visite — MVP

1. L'utilisateur ouvre l'application et consulte la galerie de dépôts pré-analysés.
2. Il sélectionne un dépôt; la fiche affiche le commit analysé, les technologies détectées et une vignette de la carte.
3. Le monde se charge en quelques secondes et l'utilisateur arrive dans le hall principal.
4. Le README, les technologies détectées et la carte générale sont visibles.
5. Une visite guidée propose trois à sept arrêts : point d'entrée, UI, API, logique métier, données et tests.
6. L'utilisateur peut interrompre la visite et explorer librement.

L'opérateur du produit génère les mondes en amont avec le pipeline en ligne de commande : `codeworld analyze <url-github>` produit l'artefact, qui est publié dans la galerie statique.

### 7.2 Importation en libre-service — Phase 2

1. L'utilisateur colle l'URL d'un dépôt GitHub public.
2. Le système valide l'URL, récupère le dépôt et estime sa taille.
3. Une page de progression présente les étapes : téléchargement, indexation, classification, génération spatiale et résumés.
4. Le monde s'ouvre à la fin de l'analyse.

### 7.3 Recherche d'une fonctionnalité — MVP

1. L'utilisateur ouvre la recherche universelle.
2. Il saisit un nom de fichier, classe, fonction ou mot-clé.
3. Les résultats sont regroupés par type et accompagnés d'un résumé.
4. L'utilisateur prévisualise le résultat puis choisit « Téléporter ».
5. Il arrive devant l'objet représentant le fichier et ouvre le panneau de code.
6. Il consulte les symboles et navigue vers une définition ou une référence.

### 7.4 Compréhension d'un flux — MVP partiel

1. L'utilisateur sélectionne un contrôleur ou une route.
2. Il choisit « Montrer les dépendances sortantes ».
3. Les relations pertinentes apparaissent en surimpression sans modifier la disposition.
4. L'utilisateur consulte le résumé IA du service relié, qui cite les fichiers et symboles concernés.
5. Il peut ajouter ces éléments à une visite personnalisée en phase 2.

### 7.5 Présentation à une équipe — Phase 2

1. L'architecte prépare une liste d'arrêts et ajoute des notes.
2. Il lance le mode présentation.
3. Les contrôles de déplacement sont simplifiés et les panneaux importants s'ouvrent automatiquement.
4. Les participants voient le chemin, les fichiers et les relations sélectionnées.
5. La visite peut être exportée sous forme de lien de configuration dans une phase ultérieure.

## 8. Modes d'exploration

### 8.1 Mode structure réelle — MVP

La géométrie suit l'arborescence exacte du dépôt. Les utilisateurs voient le véritable chemin GitHub en tout temps.

### 8.2 Mode architecture logique — Phase 2

Les fichiers et dossiers sont regroupés selon leur responsabilité détectée ou configurée. Chaque regroupement conserve un lien vers l'emplacement physique.

### 8.3 Mode parcours d'exécution — Phase 3

Le système présente un scénario ordonné : interface, appel API, validation, logique métier, persistance et réponse. Le parcours peut être dérivé de l'analyse statique et enrichi par instrumentation facultative.

### 8.4 Mode onboarding — MVP

Une visite automatique explique les zones principales, les technologies, les points d'entrée et quelques fichiers clés.

### 8.5 Mode analyse — Phase 2

Des couches affichent la taille, la complexité, le couplage, la couverture, la fréquence de modification et les zones à risque.

### 8.6 Mode présentation — Phase 2

Un utilisateur guide une audience à travers une séquence d'arrêts préparés.

## 9. Expérience 3D et navigation

### 9.1 Modèle spatial

- La racine du dépôt devient un hall.
- Chaque dossier devient une cellule spatiale : salle, couloir, étage, bâtiment ou pavillon.
- Les sous-dossiers sont accessibles par des portes, escaliers, ascenseurs ou portails clairement étiquetés.
- Les fichiers sont regroupés de façon lisible dans leur espace parent.
- Les dimensions sont calculées selon le nombre d'éléments, et non selon le nombre de lignes de code.
- Les espaces très volumineux sont paginés ou regroupés pour éviter les salles immenses.
- Une disposition déterministe est générée à partir du chemin, du commit et de la configuration.

### 9.2 Contrôles

- Clavier et souris : WASD/flèches, souris pour regarder, touche d'interaction.
- Point-and-click : sélectionner une destination visible pour s'y déplacer automatiquement.
- Téléportation : recherche, mini-carte, fil d'Ariane, favoris et historique.
- Navigation cinématique par défaut; aucune physique de collision au MVP au-delà du confinement aux zones.
- Vitesse ajustable et option de réduction des mouvements.
- Support manette après le MVP.

### 9.3 Orientation

L'interface doit toujours afficher :

- le chemin GitHub actuel;
- le nom de la zone;
- le thème architectural appliqué;
- un fil d'Ariane cliquable;
- une mini-carte;
- un bouton « Hall principal »;
- un accès à la recherche;
- un historique récent.

### 9.4 Règles anti-friction

- Aucune destination importante ne doit nécessiter plus de deux actions depuis la recherche.
- Aucun déplacement obligatoire ne doit dépasser 15 secondes à vitesse normale.
- Toute animation de transition doit pouvoir être désactivée.
- Les portes et sorties doivent être visibles depuis le centre d'une salle.
- Les environnements de plus de 200 fichiers doivent offrir des regroupements et filtres.

### 9.5 Budget de rendu comme contrainte de design

Le budget de rendu est une contrainte de conception assumée dès le premier jour, car il influence directement les métaphores visuelles :

- Chaque thème dispose d'un vocabulaire restreint d'objets uniques (ordre de grandeur : une dizaine), rendus par géométries instanciées.
- Dix objets uniques instanciés massivement valent mieux que deux cents objets uniques.
- Les objets proviennent de bibliothèques d'assets low-poly sous licence CC0, curées et normalisées par le pipeline (voir 10.4); aucune modélisation originale n'est requise avant validation du produit.
- Esthétique low-poly stylisée, éclairage simple, aucune ombre dynamique coûteuse au MVP.
- Chargement et déchargement par zone selon la proximité du joueur.
- Budgets explicites : nombre maximal d'instances visibles, de draw calls et de triangles par zone, vérifiés par des tests de performance sur le corpus de référence.

## 10. Système de métaphores visuelles

### 10.1 Thèmes initiaux

| Responsabilité | Thème | Objets principaux |
|---|---|---|
| Racine | Hall de projet | README, carte, technologies, commandes |
| Contrôleurs/routes | Salle de contrôle | Consoles, terminaux HTTP, lignes de destination |
| Services/domaine | Usine | Machines, stations, flux, conduites |
| UI/pages/composants | Galerie de design | Panneaux, prototypes, formulaires, piédestaux |
| Utilitaires | Atelier d'outils | Outils muraux, établis, catégories |
| Modèles/entités | Musée d'objets | Piédestaux, propriétés, relations |
| Repositories/données | Entrepôt d'archives | Rayonnages, comptoirs, accès aux données |
| Configuration | Salle mécanique | Panneaux, interrupteurs, connexions |
| Tests | Laboratoire | Bancs d'essai, indicateurs de statut |
| Documentation | Bibliothèque | Pupitres, rayons, diagrammes |
| Inconnu/générique | Espace technique neutre | Panneaux et objets standards |

Le prototype initial démarre avec trois thèmes (hall, salle de contrôle, espace générique) et n'étend le vocabulaire visuel qu'après validation de l'utilité du concept.

### 10.2 Règles de sélection de forme

- Beaucoup de sous-dossiers : hall ou place centrale.
- Hiérarchie profonde : étages ou ascenseur.
- Chaîne de traitements détectée : ligne de production.
- Modules indépendants : quartier ou pavillons.
- Dossier principalement documentaire : bibliothèque.
- Dossier comportant de nombreux fichiers similaires : galerie ou rayonnage.

### 10.3 Cohérence

Le thème modifie l'habillage, les objets et certains repères, mais pas les règles fondamentales de navigation. Toutes les zones partagent une signalétique, une palette de lisibilité, des interactions et une échelle communes. Chaque objet de thème respecte le vocabulaire instancié défini en 9.5.

### 10.4 Bibliothèque d'assets 3D

Le produit ne modélise pas ses propres assets au MVP. Le vocabulaire visuel de chaque thème est constitué par **curation** de bibliothèques low-poly existantes :

- **Sources retenues : Kenney, Quaternius et KayKit**, exclusivement sous licence **CC0**. Cette exigence est ferme : le client Web sert les fichiers glTF en clair, ce qui exclut toute licence interdisant la redistribution des assets bruts (packs commerciaux type Synty). Poly Pizza peut servir de source d'appoint pour un objet ponctuel, avec vérification de la licence modèle par modèle.
- **Curation plutôt que production** : un kit fournit 50 à 200 modèles; chaque thème n'en retient qu'une dizaine, ceux qui portent la métaphore (console, machine, établi, piédestal, rayonnage, banc d'essai). Le travail de direction artistique est un travail de sélection et de cohérence, pas de modélisation.
- **Normalisation par le pipeline d'assets** : un script `gltf-transform` intégré au dépôt normalise l'échelle de tous les objets, remappe les textures vers la palette unique du produit, fusionne les matériaux, applique la quantization et la compression Meshopt. Chaque thème optimisé doit peser quelques centaines de kilooctets et respecter le budget global de 20 Mo avec chargement différé.
- **Compatibilité instancing** : les kits retenus sont flat-shaded avec texture palette partagée, ce qui permet à des dizaines de meshes de partager un même matériau et de minimiser les draw calls, conformément aux budgets de 9.5.
- **Provenance tracée** : chaque asset importé est consigné (source, pack, licence, transformations appliquées) dans un manifeste versionné du dépôt.

Pour la phase 0 avec trois thèmes, deux ou trois kits Kenney couvrent l'essentiel, ce qui maintient l'investissement en direction artistique à presque zéro tant que l'hypothèse produit n'est pas validée.

## 11. Représentation et consultation des fichiers

### 11.1 Objet de fichier

Chaque fichier possède :

- une forme déterminée par son rôle ou son extension;
- une étiquette lisible;
- une icône de langage/type;
- un indicateur facultatif de taille ou d'importance;
- un état de survol et de sélection;
- un panneau d'information rapide.

### 11.2 Panneau de fichier

Le panneau contient :

- chemin complet;
- langage et taille;
- résumé du rôle;
- liste des classes, fonctions, méthodes, composants ou exports;
- code avec coloration syntaxique et numéros de ligne;
- recherche locale;
- dépendances entrantes et sortantes disponibles;
- actions : ouvrir sur GitHub, copier le chemin, téléporter vers une définition, ajouter aux favoris.

### 11.3 Progressive disclosure et séparation des deux mondes

La scène 3D ne montre jamais le code complet. Le code s'affiche dans un panneau 2D ancré ou superposé, afin de préserver la lisibilité et les habitudes d'un développeur.

Architecturalement, cette règle se traduit par deux arbres distincts : la scène React Three Fiber lit le graphe spatial de l'artefact, et l'interface 2D (panneaux, recherche, mini-carte, fil d'Ariane) est un arbre React classique superposé au canvas. Les deux communiquent exclusivement par le store d'état et des événements, jamais par rendu croisé. Cette séparation empêche les rerenders de l'interface de dégrader le framerate de la scène.

## 12. Classification automatique des dossiers

### 12.1 Approche hybride

La classification combine quatre couches, dans cet ordre :

1. **Configuration explicite de l'équipe** : règles YAML/JSON et exceptions.
2. **Règles déterministes** : noms de dossiers, extensions, fichiers de configuration et conventions de frameworks.
3. **Analyse statique** : imports, exports, annotations, classes, symboles et dépendances.
4. **Classification IA** : utilisée uniquement lorsque la confiance des couches précédentes est insuffisante.

La classification s'exécute entièrement dans le pipeline en ligne de commande et son résultat est figé dans l'artefact.

**Le LLM n'a aucun rôle de direction artistique.** Sa seule sortie est une catégorie de la taxonomie (12.2), accompagnée d'un score et de preuves. Tout ce qui est visuel en découle de façon déterministe : le mapping catégorie → thème est la table `visualMappings` (12.4), la forme de la zone suit les règles structurelles (10.2), le placement vient du moteur de layout en fonction pure et le vocabulaire d'objets de chaque thème est un asset fixe curé (10.4). Le LLM ne choisit jamais une couleur, une géométrie, une disposition ou une métaphore. Un dossier `services/` ne déclenche même pas d'appel IA — la règle déterministe suffit; seul un dossier au nom et au contenu ambigus fait appel au modèle, et un verdict incertain retombe sur `unknown` avec le thème neutre plutôt que sur une devinette forcée.

### 12.2 Taxonomie initiale

`root`, `controller`, `route`, `service`, `domain`, `ui`, `utility`, `model`, `repository`, `data`, `configuration`, `test`, `documentation`, `asset`, `build`, `generated`, `vendor`, `unknown`.

### 12.3 Score de confiance

Chaque classification comporte :

- catégorie proposée;
- score de confiance de 0 à 1;
- preuves : nom, symboles, imports, framework ou explication IA;
- source de décision;
- possibilité de correction manuelle.

### 12.4 Exemple de règles

```yaml
visualMappings:
  - match:
      folderNames: [controllers, routes, api]
    classification: controller
    theme: control-room
    priority: 100

  - match:
      folderNames: [services, domain, business]
    classification: service
    theme: factory
    priority: 90

  - match:
      folderNames: [components, pages, views, ui]
    classification: ui
    theme: design-gallery
    priority: 90
```

### 12.5 Correction utilisateur

Au MVP, une correction s'applique par un fichier de configuration passé au pipeline, qui régénère l'artefact. La correction interactive dans le client, persistée par projet, arrive en phase 2. Dans les deux cas, la correction ne modifie jamais le dépôt source, sauf export explicite par l'utilisateur.

### 12.6 Déterminisme des verdicts IA

Un appel LLM n'est pas naturellement déterministe, ce qui crée une tension avec l'exigence d'artefact reproductible (FR-026). La résolution retenue : **les verdicts IA font partie de la configuration versionnée du corpus.** Concrètement :

- Les appels utilisent une température de 0 et un identifiant de modèle épinglé.
- Chaque verdict est mis en cache par hash de contenu, modèle et version de prompt.
- Le cache des verdicts est **committé avec le corpus de référence**, au même titre que les règles de mapping. Une régénération d'artefact relit les verdicts existants; seuls les contenus nouveaux ou modifiés déclenchent un appel.
- Un verdict jugé incorrect est corrigé par la configuration explicite (couche 1), qui prime toujours sur le cache IA.

Ainsi, la reproductibilité octet pour octet est garantie sur un cache donné, et l'évolution des verdicts est visible en revue de code comme n'importe quel changement de configuration.

## 13. Rôle de l'intelligence artificielle

### 13.1 Fonctions IA du MVP

Toutes les fonctions IA du MVP s'exécutent en lot dans le pipeline et enrichissent l'artefact :

- Résumer un dépôt, un dossier et un fichier.
- Identifier les technologies et points d'entrée probables.
- Proposer une classification lorsque les règles sont insuffisantes.
- Générer une visite guidée de trois à sept étapes.
- Suggérer les fichiers à lire pour comprendre une zone.

Le client consomme ces résultats sans appel IA en direct. Ce choix élimine la passerelle IA, la gestion de quotas et la latence en session, et rend le coût IA entièrement prévisible : un dépôt est résumé une fois par commit et par version de prompt.

### 13.2 Fonctions IA ultérieures

- Questions-réponses contextuelles en session, avec citations (phase 2, exige un serveur).
- Regroupement logique transversal.
- Génération de parcours d'exécution.
- Détection de frontières architecturales.
- Identification de dette technique et d'incohérences.
- Comparaison entre architecture déclarée et architecture observée.

### 13.3 Garde-fous

- **L'IA ne prend aucune décision de direction artistique.** Elle produit uniquement des catégories de la taxonomie et du texte sourcé; thèmes, formes, layout et assets en découlent par des règles déterministes (voir 12.1 et 12.6).
- Tout résumé doit citer les sources internes utilisées.
- L'interface distingue faits extraits, inférences et incertitudes.
- Les résumés sont invalidés lorsque le commit change.
- L'IA ne modifie jamais le code ni la structure GitHub.
- Les prompts n'incluent que les fragments nécessaires.
- Les fichiers exclus, secrets détectés et binaires ne sont pas transmis au modèle.
- Le pipeline fonctionne sans IA : l'étape est facultative et son échec produit un artefact valide sans résumés.
- Les appels IA sont mis en cache par hash de contenu, modèle et version de prompt.

## 14. Fonctionnalités principales

### 14.1 Génération et gestion des mondes — MVP

- Commande `codeworld analyze <url>` : clone local, analyse, classification, layout, résumés et écriture de l'artefact.
- Cache filesystem par dépôt, commit et version d'analyseur; les étapes déjà valides ne sont pas recalculées.
- Validation de taille et de type de dépôt avec limites explicites.
- Journal de progression et rapport d'erreurs par étape.
- Publication de l'artefact dans la galerie statique.

### 14.2 Génération du monde

- Construction d'un graphe spatial à partir de l'arborescence.
- Choix d'une forme de zone selon le nombre d'enfants et la classification.
- Placement déterministe des portes et objets.
- Génération de la mini-carte et des destinations de téléportation.
- Le moteur de layout est une fonction pure `(arborescence, classification, graine) → graphe spatial`, testable par snapshot et exécutable indifféremment dans le pipeline ou dans le navigateur.

### 14.3 Exploration

- Déplacement FPS, point-and-click et téléportation.
- Interactions par survol, clic et clavier.
- Fil d'Ariane et mini-carte.
- Favoris, récents et retour au hall, persistés localement dans le navigateur.
- Préférences de vitesse, mouvement et qualité visuelle.
- Chargement progressif des zones proches.

### 14.4 Recherche

- Index de recherche embarqué dans l'artefact et interrogé entièrement côté client (MiniSearch ou équivalent).
- Recherche par chemin, nom de fichier, symbole et texte indexé.
- Filtres par catégorie, langage et type de symbole.
- Prévisualisation et téléportation.
- Tolérance aux fautes simples.

### 14.5 Consultation du code

- Coloration syntaxique.
- Navigation vers les symboles.
- Liste des exports et définitions.
- Liens GitHub avec ancre de ligne lorsque possible.
- Résumé IA sourcé issu de l'artefact.
- Le contenu des fichiers est servi comme fichiers statiques adressés par hash, chargés à la demande; l'artefact principal ne contient que les métadonnées et index.

### 14.6 Relations — MVP limité

- Imports directs TypeScript/JavaScript.
- Exports et références résolues par l'analyseur lorsque possible.
- Affichage des relations uniquement pour l'élément sélectionné.
- Filtrage par type de relation et profondeur maximale de 1 au MVP.

### 14.7 Visite guidée

- Génération automatique dans le pipeline à partir du README, des points d'entrée et des classifications.
- Navigation séquentielle.
- Texte explicatif et liens vers les fichiers.
- Pause, reprise et sortie libre.

## 15. Exigences fonctionnelles

| ID | Exigence | Priorité |
|---|---|---|
| FR-001 | Le pipeline doit accepter l'URL d'un dépôt GitHub public valide et produire un artefact `world.json` conforme au schéma versionné. | Must |
| FR-002 | L'artefact doit identifier le commit analysé et le client doit l'afficher. | Must |
| FR-003 | Le pipeline doit exclure les répertoires configurés, binaires et dépendances vendoriées courantes. | Must |
| FR-004 | L'artefact doit contenir une arborescence navigable des dossiers et fichiers. | Must |
| FR-005 | Chaque dossier doit être représenté par un espace 3D relié à son parent. | Must |
| FR-006 | Chaque fichier supporté doit posséder un objet sélectionnable. | Must |
| FR-007 | L'utilisateur doit pouvoir ouvrir un panneau de code lisible. | Must |
| FR-008 | L'utilisateur doit pouvoir ouvrir le fichier correspondant sur GitHub. | Must |
| FR-009 | Le client doit afficher le chemin actuel et un fil d'Ariane cliquable. | Must |
| FR-010 | Le client doit fournir une mini-carte et un retour instantané au hall. | Must |
| FR-011 | La recherche côté client doit trouver fichiers et symboles indexés dans l'artefact. | Must |
| FR-012 | L'utilisateur doit pouvoir se téléporter vers un résultat. | Must |
| FR-013 | Le pipeline doit classifier les dossiers et exposer le score de confiance dans l'artefact. | Must |
| FR-014 | Une classification doit pouvoir être corrigée par configuration et régénération de l'artefact. | Should |
| FR-015 | Le pipeline doit générer un résumé pour chaque dossier et fichier supporté lorsque l'étape IA est activée. | Must |
| FR-016 | Les résumés IA doivent citer leurs fichiers sources. | Must |
| FR-017 | Le client doit afficher les imports directs d'un fichier TypeScript/JavaScript. | Should |
| FR-018 | Les relations doivent être masquées par défaut. | Must |
| FR-019 | Le pipeline doit générer une visite guidée du dépôt. | Must |
| FR-020 | L'utilisateur doit pouvoir quitter la visite et explorer librement. | Must |
| FR-021 | L'utilisateur doit pouvoir marquer une zone ou un fichier comme favori, persisté localement. | Should |
| FR-022 | Les préférences de navigation doivent persister localement. | Should |
| FR-023 | Un artefact déjà produit doit pouvoir être rouvert sans réanalyse; le cache du pipeline évite les recalculs. | Must |
| FR-024 | Les erreurs d'analyse partielles ne doivent pas empêcher la production d'un artefact ouvrable. | Must |
| FR-025 | Les éléments non analysés doivent être clairement identifiés. | Must |
| FR-026 | Le même dépôt, commit, configuration et version d'analyseur doivent produire un artefact identique octet pour octet, layout compris. | Must |
| FR-027 | Le client doit refuser proprement un artefact de version de schéma inconnue avec un message explicite. | Must |
| FR-028 | Les verdicts de classification IA doivent être persistés dans la configuration versionnée du corpus (température 0, modèle épinglé, cache committé) afin de garantir FR-026. | Must |
| FR-029 | Tout asset 3D intégré doit être sous licence CC0 et consigné dans un manifeste de provenance versionné. | Must |

## 16. Exigences non fonctionnelles

### 16.1 Performance

- Première image interactive en moins de 5 secondes après sélection d'un monde dans la galerie sur une connexion raisonnable.
- 60 images/s visées sur ordinateur récent; plancher acceptable de 30 images/s.
- Chargement initial inférieur à 20 Mo compressés pour l'application, hors données du dépôt, avec chargement différé des thèmes.
- Recherche côté client avec réponse médiane inférieure à 100 ms sur un artefact de 100 000 lignes.
- Ouverture d'un fichier en moins de 500 ms après mise en cache navigateur.
- Analyse d'un dépôt de 100 000 lignes TypeScript/JavaScript en moins de 5 minutes sur un poste de développement standard.
- Le client ne doit charger que les zones proches et les contenus de fichiers demandés.
- Budgets de rendu par zone documentés et vérifiés sur le corpus de référence.

### 16.2 Fiabilité

- Les analyses sont idempotentes et déterministes pour un même commit, une même configuration et une même version d'analyseur.
- Une étape IA en échec produit un artefact valide sans résumés, jamais un échec global.
- Les étapes d'analyse sont reprises à partir du cache sans perdre les résultats valides.
- L'artefact indique la version des analyseurs, du schéma et des modèles utilisés.

### 16.3 Compatibilité

- Navigateurs de bureau Chromium et Firefox récents au MVP.
- Safari de bureau en support bêta.
- Aucun support mobile complet au MVP; consultation 2D possible ultérieurement.
- Résolution minimale recommandée : 1280 × 720.

### 16.4 Maintenabilité

- Le schéma de l'artefact est versionné et validé (Zod) à l'écriture comme à la lecture.
- Analyseurs de langage modulaires.
- Thèmes et règles de mapping configurables sans modification du moteur 3D.
- Le moteur de layout est couvert par des tests de snapshot garantissant le déterminisme.
- Journalisation structurée du pipeline par analyse.

### 16.5 Confidentialité

- Aucun code n'est conservé plus longtemps que la durée configurée.
- Les données envoyées à un fournisseur IA sont minimisées et documentées.
- La galerie publique ne contient que des dépôts publics dont la licence permet la redistribution du contenu analysé; la licence est affichée.

## 17. Critères d'acceptation du MVP

### 17.1 Pipeline

- Étant donné une URL GitHub publique valide, lorsque l'opérateur lance `codeworld analyze`, le pipeline identifie le dépôt, la branche par défaut et le commit, et produit un artefact conforme au schéma.
- Étant donné une URL invalide ou inaccessible, le pipeline affiche une erreur compréhensible sans produire d'artefact partiel non identifié comme tel.
- Étant donné un dépôt dépassant les limites, le pipeline affiche l'estimation et refuse ou propose un mode réduit.
- Étant donné deux exécutions sur le même commit et la même configuration, les artefacts produits sont identiques.

### 17.2 Monde 3D

- Chaque dossier inclus possède une zone accessible depuis son parent.
- Chaque zone affiche son nom, son chemin et sa classification.
- Le monde chargé depuis le même artefact conserve la même disposition.
- Aucun fichier ne bloque physiquement l'accès à une sortie.

### 17.3 Navigation

- L'utilisateur peut atteindre un fichier trouvé par recherche en deux actions après sélection du résultat.
- Le fil d'Ariane permet de revenir à tout ancêtre.
- Le bouton Hall principal fonctionne depuis toute zone.
- Le mode réduction des mouvements retire les transitions animées non essentielles.

### 17.4 Code et IA

- Le panneau affiche le contenu exact du fichier analysé et le commit correspondant.
- Le lien GitHub ouvre le bon fichier et, lorsque possible, la bonne ligne.
- Un résumé IA indique ses sources et son état d'incertitude.
- Un artefact généré sans étape IA s'ouvre et s'explore normalement, avec un état dégradé visible sur les résumés.

### 17.5 Recherche et relations

- La recherche retrouve un fichier par nom exact et un symbole TypeScript exporté.
- Un fichier sélectionné peut afficher ses imports directs résolus.
- Les relations disparaissent lorsque l'utilisateur ferme la couche correspondante.

## 18. Schéma de l'artefact `world.json`

L'artefact remplace le modèle de données serveur au MVP. Les entités ci-dessous sont des structures du schéma, pas des tables. Lorsqu'un serveur sera introduit en phase 2, ces structures deviendront la base du modèle relationnel — la correspondance est directe.

### 18.1 Structure générale

```
world.json                  Métadonnées, arborescence, classifications,
                            layout, index de recherche, visites, résumés
files/<contentHash>         Contenu des fichiers, servi statiquement
                            et chargé à la demande
```

### 18.2 Entités principales

**Manifest**
- `schemaVersion`
- `analyzerVersion`
- `generatedAt`
- `configurationHash`

**Repository**
- `provider`, `owner`, `name`, `url`
- `defaultBranch`
- `license`

**Snapshot**
- `commitSha`
- `branch`
- `analyzedAt`

**SourceNode**
- `id`
- `parentId`
- `path`
- `name`
- `nodeType` : directory ou file
- `language`
- `sizeBytes`
- `contentHash`
- `excludedReason`

**Symbol**
- `id`
- `sourceNodeId`
- `name`
- `qualifiedName`
- `symbolType`
- `startLine`, `endLine`
- `exported`

**Relation**
- `sourceRef` : nœud ou symbole
- `targetRef` : nœud ou symbole
- `relationType`
- `confidence`
- `evidence`

**Classification**
- `sourceNodeId`
- `category`
- `confidence`
- `decisionSource`
- `evidence`
- `overriddenByConfig`

**SemanticSummary**
- `targetRef`
- `summary`
- `modelId`
- `promptVersion`
- `sourceRefs`

**WorldLayout**
- `layoutVersion`
- `seed`
- `spatialNodes[]` : `sourceNodeId`, `spaceType`, `theme`, `position`, `rotation`, `dimensions`, `level`, `portals[]`

**SearchIndex**
- Index sérialisé des chemins, noms et symboles, chargeable directement par le moteur de recherche client.

**GuidedTour**
- `title`
- `steps[]` : cible, texte, `sourceRefs`
- `generatedBy`

### 18.3 État local utilisateur

Les favoris, emplacements récents, préférences de navigation et corrections en attente sont persistés dans le stockage local du navigateur, associés au couple dépôt/commit. Aucune persistance serveur au MVP.

### 18.4 Relations clés

- Un artefact correspond à un snapshot unique d'un dépôt.
- Un fichier possède zéro à plusieurs symboles.
- Les relations relient des fichiers ou symboles du même artefact.
- Le WorldLayout référence les SourceNode sans dupliquer la structure source.
- Le client ne lit jamais autre chose que l'artefact et les contenus adressés par hash.

## 19. Architecture technique

### 19.1 Principe directeur

L'architecture du MVP est organisée autour d'une seule frontière : le contrat `world.json`. Tout ce qui est en amont du contrat est le pipeline; tout ce qui est en aval est le jeu. Tant que le schéma tient, le gameplay et le pipeline évoluent indépendamment. Aucun serveur applicatif, aucune base de données, aucune file de travaux, aucun moteur de recherche serveur n'existe au MVP.

### 19.2 Vue d'ensemble

1. **`packages/world-schema`** : types TypeScript et validation Zod du contrat, plus le **moteur de layout comme fonction pure** `(arborescence, classification, graine) → graphe spatial`. Déterministe, testé par snapshot, exécutable dans le pipeline ou le navigateur.
2. **`packages/analyzer`** : CLI Node.js/TypeScript. Clone local, inventaire, parsing ts-morph, classification, résumés IA en lot facultatifs, layout, écriture de l'artefact. Cache filesystem par hash de contenu.
3. **`apps/client`** : application Web statique Vite + React + React Three Fiber. Charge un artefact, rend le monde, fournit recherche, panneaux, mini-carte et visite guidée. État client avec Zustand, recherche MiniSearch en mémoire, Monaco en chargement différé.

Structure : monorepo pnpm workspaces, sans outillage de build additionnel.

### 19.3 Flux d'analyse (pipeline CLI)

1. Validation de l'URL et récupération des métadonnées GitHub.
2. Clone superficiel du commit.
3. Inventaire des fichiers et application des exclusions.
4. Détection des langages et frameworks.
5. Parsing des fichiers supportés.
6. Extraction des symboles et imports.
7. Résolution des relations disponibles.
8. Classification déterministe des dossiers.
9. Classification IA des cas ambigus (facultatif).
10. Génération des résumés en lot (facultatif).
11. Génération du layout spatial.
12. Construction de l'index de recherche.
13. Validation du schéma et écriture de l'artefact.

Chaque étape lit et écrit dans le cache; une exécution répétée sur le même commit ne recalcule que les étapes invalidées.

### 19.4 Architecture du client

- Deux arbres React distincts : la scène R3F et l'interface 2D superposée, communiquant par le store et des événements (voir 11.3).
- La scène est pilotée par le graphe spatial de l'artefact, en géométries instanciées par thème.
- Chargement par zone : seules les zones proches sont montées.
- Aucune bibliothèque d'état serveur (TanStack Query) au MVP : il n'y a pas d'état serveur.

### 19.5 Évolution vers la phase 2

Lorsque le pilote démontre l'utilité du concept, le flux d'importation en libre-service est ajouté par un **monolithe Fastify** qui exécute exactement le pipeline du CLI en tâche de fond, avec PostgreSQL pour la persistance des analyses et des comptes. La migration est triviale précisément parce que tout passe déjà par l'artefact : le serveur produit et sert des `world.json`, le client ne change pas.

Les pièces suivantes ne sont introduites que sur douleur mesurée : Redis et une file de travaux si la concurrence d'analyses l'exige, un stockage objet si le volume d'artefacts l'exige, un moteur de recherche serveur si la recherche client atteint ses limites, l'observabilité outillée (OpenTelemetry) à la mise en service publique.

### 19.6 Décisions explicitement écartées au MVP

- Serveur applicatif, API, comptes et persistance serveur.
- Microservices, base graphe dédiée, moteur de recherche serveur.
- Passerelle IA en session et WebSocket.
- Moteur de jeu natif nécessitant une installation.
- Génération procédurale visuelle complexe.
- Docker (réintroduit avec le serveur en phase 2 pour l'isolation des analyses).

## 20. Stratégie d'analyse statique

### 20.1 Portée MVP

Langages prioritaires : TypeScript, TSX, JavaScript et JSX.

### 20.2 Outils et techniques

- Lecture de l'arbre de syntaxe abstraite avec TypeScript Compiler API ou `ts-morph`.
- Résolution des modules à partir de `tsconfig.json`, `package.json` et conventions Node.
- Extraction des imports, exports, classes, fonctions, interfaces, méthodes et composants.
- Détection de frameworks par dépendances et fichiers caractéristiques.
- Heuristiques pour Express, NestJS, React et frameworks similaires.
- Analyse incrémentale par hash de contenu.
- Utilisation facultative de Tree-sitter pour l'extension à d'autres langages.

### 20.3 Niveaux de confiance

- **Certain** : information directement issue de l'AST ou d'une configuration.
- **Probable** : convention forte de framework ou résolution partielle.
- **Inféré** : conclusion IA ou heuristique faible.

### 20.4 Limites affichées

Le système doit signaler clairement : imports dynamiques non résolus, métaprogrammation, génération de code, réflexion, alias inconnus et dépendances externes.

## 21. Intégration GitHub

### 21.1 MVP

- Clone superficiel du dépôt public par le pipeline CLI.
- Utilisation de l'API GitHub pour les métadonnées (branche par défaut, commit, licence).
- Respect des limites de taux et mise en cache par commit.
- Liens profonds vers les fichiers et lignes.
- Affichage de la licence et du commit analysé.

### 21.2 Phases ultérieures

- Import par URL côté serveur avec téléchargement d'archive.
- GitHub App pour les dépôts privés.
- Webhooks pour invalider ou régénérer une analyse lors d'un nouveau commit.
- Autorisations minimales en lecture seule.
- Support des organisations et de GitHub Enterprise Server.
- Commentaires ou annotations exportables sans écrire dans le dépôt par défaut.

## 22. Sécurité

### 22.1 Menaces principales

- Dépôt malveillant contenant des fichiers volumineux, archives imbriquées ou chemins dangereux.
- Exécution accidentelle de scripts du dépôt.
- Fuite de secrets contenus dans le code.
- Injection de prompt via README, commentaires ou chaînes de caractères.
- Déni de service par dépôts trop volumineux (pertinent dès l'ouverture du libre-service en phase 2).

### 22.2 Mesures

Au MVP, le pipeline s'exécute sur le poste de l'opérateur sur un corpus choisi, ce qui réduit la surface d'attaque; les principes suivants s'appliquent néanmoins dès le premier jour car ils conditionnent la phase 2 :

- Ne jamais exécuter le code du dépôt dans le pipeline d'analyse : pas de `npm install`, pas de scripts, parsing uniquement.
- Limiter taille, nombre de fichiers, profondeur et temps CPU.
- Normaliser les chemins et refuser les liens symboliques sortants.
- Détecter les secrets et exclure leur contenu des appels IA et de l'artefact publié.
- Traiter le contenu du dépôt comme donnée non fiable, jamais comme instruction système.

À l'introduction du serveur en phase 2 s'ajoutent : analyse dans des conteneurs isolés sans réseau sortant, chiffrement au repos et en transit, séparation des espaces de stockage par tenant, journalisation des accès administratifs et politique de rétention configurable.

## 23. Accessibilité

### 23.1 Navigation alternative

- Toutes les destinations doivent être accessibles par recherche, fil d'Ariane et vue 2D.
- Les interactions essentielles doivent fonctionner au clavier.
- Le produit doit proposer un mode sans déplacement libre : sélection dans une carte ou une liste hiérarchique.
- Le panneau de code et les informations doivent être compatibles avec les lecteurs d'écran autant que possible.

### 23.2 Confort visuel et vestibulaire

- Réduction des mouvements, suppression du balancement de caméra et téléportation instantanée.
- Champ de vision et vitesse ajustables.
- Contrastes conformes aux critères WCAG applicables aux interfaces 2D.
- Ne jamais transmettre une information uniquement par la couleur.
- Taille de texte ajustable et possibilité d'agrandir les panneaux.

### 23.3 Cible

Viser WCAG 2.2 niveau AA pour l'interface 2D et documenter les limites propres à la scène 3D.

## 24. Observabilité et métriques de succès

### 24.1 North Star Metric

**Temps médian nécessaire pour qu'un nouvel utilisateur réponde correctement à un ensemble de questions d'orientation sur un dépôt inconnu.**

### 24.2 Métriques produit

- Temps de génération d'un artefact et taux de réussite du pipeline sur le corpus.
- Temps jusqu'à la première interaction utile.
- Nombre de recherches et téléportations par session.
- Pourcentage de sessions utilisant une visite guidée.
- Pourcentage de fichiers ouverts après une recherche.
- Utilité perçue des résumés IA.
- Taux de retour sur un même dépôt.
- Fréquence d'utilisation de la navigation 3D par rapport aux raccourcis 2D.

Au MVP, l'instrumentation est une analytique légère côté client; aucune infrastructure d'observabilité serveur n'est requise.

### 24.3 Critères de validation pilote

- Réduction d'au moins 25 % du temps médian pour répondre à cinq questions d'architecture par rapport à GitHub seul.
- Au moins 70 % des participants jugent la carte et la téléportation utiles.
- Au moins 60 % peuvent retrouver une zone déjà visitée sans utiliser la recherche après une courte pause.
- Moins de 10 % des sessions sont abandonnées à cause de la navigation ou des performances.
- Au moins 80 % des classifications de niveau élevé sont jugées acceptables sur le corpus pilote.

## 25. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| La 3D ralentit les utilisateurs | Élevé | Navigation hybride, tests comparatifs, raccourcis permanents |
| Les mondes deviennent trop grands | Élevé | Regroupement, chargement progressif, pagination spatiale, téléportation |
| Les métaphores deviennent décoratives | Élevé | Tests d'utilité, thèmes sobres, design system commun |
| Absence de flux libre-service au MVP | Moyen | Assumé : le feedback externe passe par la galerie et les études pilotes; le flux d'import est du plomberie connue, réintroduit en phase 2 |
| Classification incorrecte | Moyen | Scores, preuves, corrections, priorité aux règles explicites |
| Analyse statique incomplète | Moyen | Niveaux de confiance, limites visibles, portée langage contrôlée |
| Coût IA élevé | Faible au MVP | Génération en lot, cache par hash, une exécution par commit et version de prompt |
| Performances WebGL insuffisantes | Élevé | Instancing, LOD, culling, budgets d'objets, qualité ajustable |
| Artefacts volumineux | Moyen | Contenus de fichiers hors de l'artefact principal, index compressés, budgets de taille par section |
| Licences d'assets incompatibles avec la diffusion Web | Moyen | CC0 exclusivement, manifeste de provenance versionné, pas de packs commerciaux redistribués en clair |
| Verdicts IA non reproductibles | Moyen | Température 0, modèle épinglé, cache de verdicts committé avec le corpus (12.6) |
| Effet de nouveauté sans rétention | Élevé | Mesurer les tâches réelles, favoriser onboarding et présentation |
| Disposition instable entre analyses | Moyen | Layout en fonction pure déterministe, tests de snapshot, conservation des ancres spatiales |

## 26. Inconnues à valider

- La mémorisation spatiale améliore-t-elle réellement l'onboarding pour des dépôts professionnels?
- Quel niveau d'abstraction est le plus utile : fichier, symbole ou composant logique?
- Quelles métaphores sont universelles et lesquelles dépendent du langage ou de la culture d'équipe?
- Quelle taille de dépôt reste agréable dans une représentation spatiale?
- Les utilisateurs préfèrent-ils marcher, cliquer ou se téléporter?
- Quelle taille d'artefact reste confortable à charger et à interroger côté client?
- Une vue 3D apporte-t-elle davantage de valeur qu'une vue 2.5D pour certains profils?
- Comment préserver les repères lorsque le dépôt évolue fortement?

## 27. Portée détaillée du MVP

### 27.1 Inclus

- Application Web statique de bureau, servie sans serveur applicatif.
- Pipeline CLI d'analyse de dépôts GitHub publics.
- Galerie de 12 à 20 mondes pré-générés.
- Branche par défaut et commit courant au moment de l'analyse.
- JavaScript, TypeScript, JSX et TSX.
- Arborescence, fichiers, symboles principaux et imports directs.
- Trois thèmes au prototype, extension vers dix thèmes après validation.
- Bibliothèque d'assets CC0 curée (Kenney, Quaternius, KayKit) avec pipeline de normalisation `gltf-transform` et manifeste de provenance.
- Hall, salles, portes et quelques variations de layout.
- Recherche client, téléportation, fil d'Ariane, mini-carte, récents et favoris locaux.
- Panneau de code avec coloration syntaxique.
- Résumés IA sourcés générés en lot.
- Visite guidée automatique.
- Configuration de mapping par fichier local.
- Instrumentation analytique légère et tests utilisateurs.

### 27.2 Exclus

- Serveur applicatif, comptes et persistance serveur.
- Import en libre-service par URL.
- Questions-réponses IA en session.
- Dépôts privés.
- Écriture dans GitHub.
- Analyse de l'historique Git.
- Exécution du code.
- Relations interservices distribuées.
- Collaboration temps réel.
- Réalité virtuelle.
- Mobile.
- Support complet de Java, C#, Python, Go ou Rust.
- Couverture de tests et complexité avancée.

### 27.3 Limites initiales suggérées

- 10 000 fichiers inventoriés.
- 2 000 fichiers de code analysés en profondeur.
- 100 000 lignes de code supporté.
- 10 Mo maximum par fichier texte.
- Profondeur de dossier maximale affichée de 20, avec aplatissement contrôlé au-delà.
- Artefact principal (hors contenus de fichiers) inférieur à 15 Mo compressés.

## 28. Phases de livraison

### Phase 0 — Prototype gameplay

- Schéma `world.json` minimal et moteur de layout en fonction pure.
- Deux ou trois mondes générés à la main ou par un pipeline embryonnaire.
- Trois métaphores visuelles en géométries instanciées.
- Contrôles FPS, point-and-click, téléportation, mini-carte et panneau de code.
- Test comparatif avec l'explorateur GitHub.

**Sortie attendue :** preuve que la spatialisation aide au moins un cas d'usage concret. Sans cette preuve, les phases suivantes ne sont pas lancées.

### Phase 1 — MVP

- Pipeline CLI complet : analyse TypeScript/JavaScript, classification par règles et IA, résumés en lot, visite guidée, index de recherche.
- Corpus de 12 à 20 dépôts de référence et galerie statique.
- Client complet : recherche, favoris, préférences, dix thèmes, accessibilité de base.
- Tests de régression du layout déterministe et budgets de performance.
- Études utilisateurs pilotes.

### Phase 2 — Produit pilote en libre-service

- Monolithe Fastify exécutant le pipeline à la demande; import par URL avec progression.
- PostgreSQL pour analyses et comptes; Docker pour l'isolation des analyses.
- Questions-réponses IA en session avec citations.
- Corrections de classification interactives et configuration d'équipe.
- Mode architecture logique, relations enrichies, métriques simples, mode présentation.
- Améliorations d'accessibilité et Safari.

### Phase 3 — Dépôts privés et analyse avancée

- GitHub App et organisations.
- Webhooks et analyses incrémentales.
- Langages supplémentaires.
- Parcours d'exécution statiques.
- Couverture, complexité, fréquence de changement.

### Phase 4 — Plateforme collaborative

- Visites partagées.
- Annotations d'équipe.
- Comparaison de snapshots.
- Intégrations IDE.
- Support GitLab/Azure DevOps selon la demande.

## 29. User stories priorisées

### Must — MVP

1. En tant qu'opérateur, je veux analyser un dépôt GitHub public en une commande afin de produire un monde explorable.
2. En tant que développeur, je veux choisir un dépôt dans la galerie afin de commencer son exploration immédiatement.
3. En tant que développeur, je veux voir une carte générale afin de comprendre les grandes zones du projet.
4. En tant que développeur, je veux naviguer entre les dossiers sous forme d'espaces reliés afin de mémoriser leur emplacement.
5. En tant que développeur, je veux rechercher un fichier ou symbole et m'y téléporter afin d'éviter les déplacements inutiles.
6. En tant que développeur, je veux ouvrir le code dans un panneau lisible afin de vérifier immédiatement la représentation.
7. En tant que développeur, je veux ouvrir le fichier sur GitHub afin de poursuivre mon travail dans l'outil source.
8. En tant que nouvel arrivant, je veux une visite guidée afin de connaître les points d'entrée et zones principales.
9. En tant qu'utilisateur, je veux voir le chemin et le fil d'Ariane afin de ne pas me perdre.
10. En tant qu'utilisateur sensible aux mouvements, je veux réduire les animations et utiliser une navigation sans déplacement libre.
11. En tant que développeur, je veux lire un résumé sourcé afin de comprendre rapidement le rôle d'un fichier.
12. En tant que développeur, je veux afficher les imports directs afin de voir les dépendances immédiates.
13. En tant qu'opérateur, je veux qu'un échec de l'étape IA produise quand même un artefact explorable.

### Should — MVP tardif ou phase 2

14. Corriger la classification par configuration et régénérer l'artefact.
15. Ajouter des favoris et retrouver les éléments récents.
16. Filtrer les relations visibles.
17. Afficher des métriques simples de taille et de dépendance.
18. Ajuster le niveau de qualité graphique.

### Could — Phase 2 et suivantes

19. Importer un dépôt par URL en libre-service.
20. Poser des questions à l'IA en session avec citations.
21. Basculer entre structure physique et architecture logique.
22. Créer une visite personnalisée et la partager.
23. Comparer deux snapshots d'un dépôt.
24. Suivre un parcours d'exécution.
25. Ouvrir un symbole directement dans VS Code.
26. Supporter plusieurs langages.
27. Importer un dépôt privé.
28. Ajouter des annotations d'architecture.
29. Générer une vue de dette technique.

### Won't — Horizon MVP

30. Modifier et committer du code depuis la scène 3D.
31. Représenter l'historique complet de Git.
32. Fournir un jeu multijoueur ou une expérience VR.

## 30. Stack technologique

### 30.1 Client (`apps/client`)

- **React + TypeScript** pour l'application et les panneaux.
- **Three.js avec React Three Fiber** pour le moteur 3D.
- Navigation cinématique sans moteur physique; Rapier n'est envisagé que si un besoin réel de collisions apparaît.
- **Monaco Editor** en lecture seule et chargement différé pour le code.
- **Zustand** pour l'état client.
- **MiniSearch** (ou équivalent) pour la recherche en mémoire sur l'index de l'artefact.
- **Vite** pour le build.

### 30.2 Contrat (`packages/world-schema`)

- Types TypeScript et validation **Zod** du schéma `world.json`.
- Moteur de layout en fonction pure, testé par snapshot.

### 30.3 Pipeline (`packages/analyzer`)

- **Node.js + TypeScript**, CLI.
- **ts-morph / TypeScript Compiler API** pour l'analyse.
- **Tree-sitter** comme couche extensible multi-langage ultérieure.
- Cache filesystem par hash de contenu.
- Appels IA en lot via le SDK du fournisseur retenu, avec cache par hash de contenu, modèle et version de prompt.

### 30.4 Outillage

- Monorepo **pnpm workspaces**, sans orchestrateur de build additionnel.
- **Pipeline d'assets `gltf-transform`** : normalisation d'échelle, remapping de palette, fusion de matériaux, quantization et compression Meshopt des kits CC0 curés, avec manifeste de provenance versionné.
- CI GitHub Actions : tests, snapshots de layout, régénération du corpus de référence.
- Hébergement statique du client et de la galerie.

### 30.5 Pièces différées à la phase 2 et au-delà

Chaque pièce est introduite sur douleur mesurée, jamais préventivement :

- **Fastify + PostgreSQL** : import libre-service et persistance.
- **Docker** : isolation des analyses côté serveur.
- **Redis / file de travaux** : concurrence d'analyses.
- **Stockage objet S3** : volume d'artefacts.
- **Moteur de recherche serveur** : si la recherche client atteint ses limites.
- **TanStack Query** : dès qu'un état serveur existe.
- **OpenTelemetry et feature flags** : mise en service publique.

### 30.6 Décisions à éviter

- Microservices nombreux.
- Moteur de jeu natif nécessitant une installation.
- Base graphe dédiée avant validation du besoin.
- WebSocket permanent hors suivi de progression.
- Génération procédurale visuelle complexe.
- Toute pièce d'infrastructure introduite « pour plus tard ».

## 31. Stratégie de validation

### 31.1 Corpus

Sélectionner 12 à 20 dépôts publics : petits, moyens, monolithes, monorepos, React, Express, NestJS et bibliothèques. Conserver un ensemble fixe pour les tests de régression du pipeline et du layout. Ce corpus constitue directement la galerie du MVP.

### 31.2 Études utilisateurs

Comparer trois expériences : GitHub seul, GitHub avec assistant IA, et CodeWorld Explorer. Donner les mêmes questions : point d'entrée, logique métier, modèle principal, service utilisé et fichier à modifier.

### 31.3 Tests techniques

- Régression du layout déterministe par snapshots de l'artefact.
- Performance de rendu avec différents budgets d'objets sur le corpus.
- Robustesse sur chemins, encodages et dépôts malformés.
- Exactitude des liens de ligne.
- Qualité de classification sur un corpus annoté.
- Évaluation des résumés par des mainteneurs du dépôt.
- Taille et temps de chargement des artefacts.

## 32. Questions ouvertes

1. Le nom du produit doit-il évoquer la 3D, le code ou l'architecture?
2. Les analyses de dépôts publics doivent-elles être publiques, privées au créateur ou éphémères lors du passage au libre-service?
3. Quelle politique de rétention est acceptable en phase 2?
4. Quel fournisseur IA et quel mode d'hébergement sont compatibles avec les futurs dépôts privés?
5. Faut-il générer tous les résumés à l'avance ou seulement ceux des zones importantes, pour maîtriser le coût du pipeline?
6. Le mode point-and-click doit-il être le mode par défaut pour les non-joueurs?
7. Quelle profondeur de relations est utile avant que la vue devienne encombrée?
8. Comment versionner et partager les corrections de mapping d'une équipe?
9. Doit-on proposer une vue 2D complète comme alternative égale à la 3D?
10. Quel mécanisme garantit que les espaces importants restent au même endroit entre commits?
11. Comment mesurer l'apprentissage durable au-delà d'une première session?

## 33. Décisions structurantes

- L'artefact `world.json` est la seule frontière architecturale du MVP; son schéma est versionné et soigné dès le premier jour.
- Aucun serveur au MVP : pipeline CLI en amont, application Web statique en aval.
- Le moteur de layout est une fonction pure, déterministe et testée par snapshot, partagée entre pipeline et client.
- La scène 3D et l'interface 2D sont deux arbres React distincts communiquant par le store; le code se lit toujours en 2D.
- Le budget de rendu (objets instanciés, low-poly, chargement par zone) est une contrainte de design des métaphores, pas une optimisation tardive.
- L'IA est une étape de pipeline facultative, en lot, mise en cache et sourcée; jamais un service en session au MVP.
- Le LLM ne produit que des catégories de taxonomie et du texte sourcé; toute décision de direction artistique (thème, forme, layout, assets) est déterministe, et les verdicts IA sont versionnés avec le corpus.
- Les assets 3D sont curés depuis des bibliothèques CC0 (Kenney, Quaternius, KayKit) et normalisés par `gltf-transform`; aucune modélisation originale avant validation du produit.
- La recherche est embarquée dans l'artefact et exécutée côté client.
- Prototype Web, TypeScript/JavaScript uniquement, recherche et téléportation centrales dès le premier jalon.
- Valider l'utilité avec des tâches réelles avant d'investir dans davantage d'art 3D ou d'infrastructure.
- Chaque pièce d'infrastructure de la phase 2 est introduite sur douleur mesurée, avec l'artefact comme point de migration.

## 34. Définition de « terminé » pour le MVP

Le MVP est considéré terminé lorsque l'opérateur peut analyser un dépôt GitHub public TypeScript/JavaScript en une commande et produire un artefact déterministe, et lorsqu'un utilisateur peut choisir un monde dans la galerie, entrer dans un environnement 3D stable, comprendre les zones principales grâce à une visite guidée, rechercher et ouvrir un fichier ou symbole, lire le code, consulter un résumé sourcé, afficher ses imports directs, ouvrir le fichier sur GitHub et naviguer sans se perdre ni dépendre d'une manette.

Le produit doit démontrer, par un pilote utilisateur, une amélioration mesurable de la vitesse ou de la qualité de compréhension par rapport à GitHub seul. Sans ce résultat, les investissements dans les thèmes visuels avancés, le libre-service, la collaboration ou l'analyse dynamique ne doivent pas être prioritaires.