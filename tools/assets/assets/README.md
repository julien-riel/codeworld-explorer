# Manifeste de provenance des assets 3D

`manifest.json` est le registre **versionné** de tout asset 3D intégré au produit
(PRD §10.4, §30.4, FR-029). Il est aujourd'hui **vide et valide** (`{ "assets": [] }`) :
la phase 0 rend les thèmes en géométries procédurales instanciées, donc aucun asset
externe n'est encore importé. Le pipeline (`../src/normalize.ts`) et ce manifeste sont
écrits et testés à vide, prêts à recevoir de vrais kits CC0.

## Contrainte ferme (FR-029)

- **Licence : `CC0-1.0` uniquement.** Toute autre licence (CC-BY, MIT, packs
  commerciaux…) est **rejetée** par le schéma Zod (`../src/manifest.ts`), pas
  seulement signalée. Le client Web sert les GLB en clair : seule une licence
  autorisant la redistribution des assets bruts est admissible.
- Chaque asset consigne son empreinte **sha256** (fichier d'origine, avant toute
  transformation). Un asset sans empreinte valide est rejeté.

## Ajouter un kit

Sources retenues : **Kenney, Quaternius, KayKit** (`poly-pizza` en appoint), toutes
CC0. Pour chaque objet :

```bash
codeworld-assets normalize <entrée.glb> \
  --out <sortie.glb> \
  --manifest tools/assets/assets/manifest.json \
  --id      crate-small \
  --name    "Small Crate" \
  --source  kenney \
  --pack    "Survival Kit" \
  --author  Kenney \
  --url     https://kenney.nl/assets/survival-kit
```

La commande :

1. calcule le sha256 du fichier d'origine ;
2. applique le pipeline (échelle, palette, fusion des matériaux, quantization,
   compression Meshopt) et écrit le GLB optimisé ;
3. ajoute l'entrée de provenance et **revalide le manifeste entier** — une licence
   non-CC0 fait échouer la commande sans rien écrire.

## Forme d'une entrée

```json
{
  "id": "crate-small",
  "name": "Small Crate",
  "source": "kenney",
  "pack": "Survival Kit",
  "author": "Kenney",
  "license": "CC0-1.0",
  "url": "https://kenney.nl/assets/survival-kit",
  "sha256": "…64 caractères hexadécimaux…",
  "transforms": [
    "scale-normalize",
    "palette-remap",
    "material-merge",
    "quantize",
    "meshopt-compress"
  ]
}
```

Le champ `transforms` est la liste **ordonnée** des étapes réellement appliquées, dans
l'ordre canonique du pipeline.
