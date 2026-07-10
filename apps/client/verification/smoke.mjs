/**
 * Smoke navigateur RÉEL (hors build). Pilote le Chrome du système via Playwright pour
 * prouver que le client rend le monde `schema` : la galerie s'ouvre, la scène WebGL
 * produit des images (compteurs `renderer.info`), un clic sur un objet fichier ouvre le
 * panneau de code, et aucun `console.error` applicatif n'apparaît. Vérifie aussi FR-027
 * (un artefact de `schemaVersion` inconnu affiche l'écran de refus, pas un écran blanc).
 *
 * Playwright est résolu via `require` (NODE_PATH), pour ne pas polluer le dépôt. Chrome
 * système : `channel: "chrome"`. Capture d'écran dans `verification/smoke.png`.
 *
 *   NODE_PATH=<pw>/node_modules node apps/client/verification/smoke.mjs
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PW_BASE ?? "http://localhost:4319";
const SHOT = resolve(HERE, "smoke.png");
const WORLD_JSON = resolve(HERE, "../public/worlds/schema/world.json");

/** Erreurs console/page jugées bénignes (bruit navigateur, non applicatif). */
function isBenign(text, url = "") {
  return /favicon\.ico/i.test(text) || /favicon\.ico/i.test(url);
}

const fail = (msg) => {
  throw new Error(msg);
};

async function pollState(page, pick, timeoutMs = 15000) {
  const start = Date.now();
  for (;;) {
    const value = await page.evaluate(pick).catch(() => undefined);
    if (value) return value;
    if (Date.now() - start > timeoutMs) return undefined;
    await page.waitForTimeout(120);
  }
}

async function run() {
  const consoleErrors = [];
  const benign = [];
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  const result = {
    galleryShown: false,
    worldReady: false,
    canvasSize: null,
    webgl: null,
    codePanelOpened: false,
    clickedFileNode: null,
    fr027ErrorScreen: false,
    consoleErrors: [],
    benignIgnored: [],
    screenshot: SHOT,
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    // Neutralise le verrouillage du pointeur : garde le raycasting R3F fonctionnel
    // pendant le balayage de clics (contrôle d'ENVIRONNEMENT de test, pas de l'app).
    await context.addInitScript(() => {
      Element.prototype.requestPointerLock = function requestPointerLock() {
        return undefined;
      };
    });
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      const url = m.location()?.url ?? "";
      (isBenign(t, url) ? benign : consoleErrors).push(t);
    });
    page.on("pageerror", (e) => {
      const t = String(e);
      (isBenign(t) ? benign : consoleErrors).push(t);
    });

    // ── 1. Galerie ──
    await page.goto(`${BASE}/?debug=1`, { waitUntil: "domcontentloaded" });
    const card = page.locator('button[aria-label="Ouvrir le monde schema"]');
    await card.waitFor({ state: "visible", timeout: 15000 });
    result.galleryShown = true;

    // ── 2. Ouvrir le monde schema ──
    await card.click();
    await page.locator("canvas").waitFor({ state: "visible", timeout: 15000 });

    const ready = await pollState(page, () => window.__codeworld?.state().worldStatus === "ready");
    result.worldReady = ready === true;
    if (!result.worldReady) fail("Le monde `schema` n'est jamais passé à l'état `ready`.");

    // ── 3. Taille du canvas non nulle ──
    const box = await page.locator("canvas").boundingBox();
    result.canvasSize = box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
    if (!box || box.width < 10 || box.height < 10) fail(`Canvas de taille nulle : ${JSON.stringify(box)}`);

    // ── 4. WebGL a produit au moins une image (compteurs renderer.info réels) ──
    const webgl = await pollState(
      page,
      () => {
        const p = window.__codeworld?.perf();
        // On laisse la scène se peupler (quelques dizaines d'images) pour un
        // instantané représentatif, au-delà de la simple première image non vide.
        return p && p.frame > 30 && p.drawCalls > 0 ? p : undefined;
      },
      10000,
    );
    result.webgl = webgl
      ? { frame: webgl.frame, drawCalls: webgl.drawCalls, triangles: webgl.triangles, fps: Math.round(webgl.fps) }
      : null;
    if (!webgl) fail("WebGL n'a produit aucune image (frame/drawCalls restés à 0).");

    // ── 5. Cliquer un objet fichier → le panneau de code s'ouvre ──
    // On fige la vue (pas de glisse point-and-click) pour un balayage stable ; le clic
    // sur l'objet reste un VRAI raycast R3F qui appelle openFile.
    await page.evaluate(() => window.__codeworld?.state().setFreeMovement(false));
    await page.waitForTimeout(200);

    const origin = { x: box.x, y: box.y };
    // Ne balaye QUE le canvas dégagé : on écarte tout point recouvert par un panneau
    // 2D (mini-carte, barres, boutons) via `elementFromPoint`, pour ne pas déclencher
    // une téléportation mini-carte ou l'ouverture d'un panneau qui changerait la vue.
    const canvasPoints = await page.evaluate(
      ({ w, h, step }) => {
        const pts = [];
        for (let y = 8; y < h - 8; y += step) {
          for (let x = 8; x < w - 8; x += step) {
            const el = document.elementFromPoint(x, y);
            if (el && el.tagName === "CANVAS") pts.push([x, y]);
          }
        }
        return pts;
      },
      { w: box.width, h: box.height, step: 22 },
    );
    result.canvasPointsScanned = canvasPoints.length;
    for (const [px, py] of canvasPoints) {
      await page.mouse.click(origin.x + px, origin.y + py);
      const open = await page.evaluate(() => window.__codeworld?.state().codePanelOpen === true);
      if (open) {
        result.codePanelOpened = true;
        result.clickedAt = [px, py];
        result.clickedFileNode = await page.evaluate(
          () => window.__codeworld?.state().selectedFileNodeId ?? null,
        );
        break;
      }
    }
    // Confirme que le DOM du panneau (arbre 2D) est bien monté, puis attend le rendu
    // effectif du contenu par Monaco (preuve que le fichier s'affiche vraiment).
    if (result.codePanelOpened) {
      await page.locator("section.cw-code").waitFor({ state: "visible", timeout: 8000 });
      try {
        await page.locator(".monaco-editor .view-lines").first().waitFor({
          state: "visible",
          timeout: 15000,
        });
        result.monacoRendered = true;
      } catch {
        result.monacoRendered = false;
      }
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOT, fullPage: false });
    if (!result.codePanelOpened) fail("Aucun clic n'a ouvert le panneau de code (objet fichier introuvable à l'écran).");

    // ── 6. FR-027 : artefact de schemaVersion inconnu → écran de refus, pas blanc ──
    const forged = JSON.parse(readFileSync(WORLD_JSON, "utf8"));
    forged.manifest.schemaVersion = 999;
    const page2 = await context.newPage();
    const consoleErrors2 = [];
    page2.on("console", (m) => {
      if (m.type() === "error" && !isBenign(m.text())) consoleErrors2.push(m.text());
    });
    await page2.route("**/worlds/schema/world.json", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(forged) }),
    );
    await page2.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page2.locator('button[aria-label="Ouvrir le monde schema"]').click();
    const dialog = page2.locator('[role="alertdialog"]');
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    const title = (await dialog.textContent()) ?? "";
    result.fr027ErrorScreen = /Version de schéma non supportée/.test(title);
    if (!result.fr027ErrorScreen) fail(`FR-027 : écran de refus attendu, obtenu : ${title.slice(0, 120)}`);
    for (const e of consoleErrors2) consoleErrors.push(`[fr027] ${e}`);

    result.consoleErrors = consoleErrors;
    result.benignIgnored = benign;
    if (consoleErrors.length > 0) fail(`Erreurs console applicatives: ${JSON.stringify(consoleErrors)}`);

    console.log("SMOKE_RESULT", JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    result.consoleErrors = consoleErrors;
    result.benignIgnored = benign;
    try {
      const pages = browser.contexts().flatMap((c) => c.pages());
      if (pages[0]) await pages[0].screenshot({ path: SHOT }).catch(() => {});
    } catch {
      /* capture best-effort */
    }
    console.log("SMOKE_RESULT", JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err), ...result }));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
