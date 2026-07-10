/**
 * Smoke HORS LIGNE (preuve « aucun hôte externe », PRD §19.1). Comme `smoke.mjs`, pilote
 * le Chrome du système via Playwright, mais BLOQUE toute requête réseau sortante vers un
 * hôte autre que localhost : seul le build servi localement répond. On ouvre le monde
 * `schema`, on clique un objet fichier et on prouve que le panneau de code affiche
 * RÉELLEMENT le contenu COLORIÉ par Monaco — donc que Monaco et ses workers viennent du
 * bundle, jamais du CDN jsdelivr (sinon l'éditeur resterait vide, sa requête étant coupée).
 *
 * Playwright résolu via `require` (NODE_PATH). Chrome système : `channel: "chrome"`.
 * Le build doit être servi sur `PW_BASE` (par défaut http://localhost:4321, ex.
 * `vite preview --port 4321`). Capture d'écran dans `verification/smoke-offline.png`.
 *
 *   NODE_PATH=<pw>/node_modules node apps/client/verification/smoke-offline.mjs
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PW_BASE ?? "http://localhost:4321";
const SHOT = resolve(HERE, "smoke-offline.png");

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
  const blockedHosts = new Set(); // hôtes externes dont la requête a été COUPÉE
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  const result = {
    offlineEnforced: true,
    worldReady: false,
    codePanelOpened: false,
    clickedFileNode: null,
    monacoRendered: false,
    codeVisible: false,
    codeColored: false,
    codeSample: "",
    tokenClasses: 0,
    blockedExternalHosts: [],
    consoleErrors: [],
    benignIgnored: [],
    screenshot: SHOT,
  };
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    await context.addInitScript(() => {
      Element.prototype.requestPointerLock = function requestPointerLock() {
        return undefined;
      };
    });

    // ── Coupe-circuit réseau : seul localhost passe, tout hôte externe est ABORTÉ. ──
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
        route.continue();
      } else {
        blockedHosts.add(u.hostname);
        route.abort();
      }
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

    // ── 2. Ouvrir le monde schema ──
    await card.click();
    await page.locator("canvas").waitFor({ state: "visible", timeout: 15000 });
    const ready = await pollState(page, () => window.__codeworld?.state().worldStatus === "ready");
    result.worldReady = ready === true;
    if (!result.worldReady) fail("Le monde `schema` n'est jamais passé à l'état `ready` (hors ligne).");

    const box = await page.locator("canvas").boundingBox();
    if (!box || box.width < 10 || box.height < 10) fail(`Canvas de taille nulle : ${JSON.stringify(box)}`);

    // ── 3. Cliquer un objet fichier → le panneau de code s'ouvre ──
    await page.evaluate(() => window.__codeworld?.state().setFreeMovement(false));
    await page.waitForTimeout(200);
    const origin = { x: box.x, y: box.y };
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
    for (const [px, py] of canvasPoints) {
      await page.mouse.click(origin.x + px, origin.y + py);
      const open = await page.evaluate(() => window.__codeworld?.state().codePanelOpen === true);
      if (open) {
        result.codePanelOpened = true;
        result.clickedFileNode = await page.evaluate(
          () => window.__codeworld?.state().selectedFileNodeId ?? null,
        );
        break;
      }
    }
    if (!result.codePanelOpened) fail("Aucun clic n'a ouvert le panneau de code (objet fichier introuvable).");

    // ── 4. Preuve : Monaco affiche le contenu COLORIÉ malgré le blocage réseau ──
    await page.locator("section.cw-code").waitFor({ state: "visible", timeout: 8000 });
    try {
      await page.locator(".monaco-editor .view-lines").first().waitFor({ state: "visible", timeout: 15000 });
      result.monacoRendered = true;
    } catch {
      result.monacoRendered = false;
    }
    if (!result.monacoRendered) fail("Monaco n'a pas rendu (`.view-lines` absent) : chargement hors ligne ÉCHOUÉ.");

    // Contenu réellement affiché + coloration (tokens `.mtk*` distincts = tokenisation active).
    const info = await page.evaluate(() => {
      const lines = document.querySelector(".monaco-editor .view-lines");
      const text = lines?.textContent ?? "";
      const spans = lines ? lines.querySelectorAll('span[class^="mtk"], span[class*=" mtk"]') : [];
      const classes = new Set();
      spans.forEach((s) => {
        s.classList.forEach((c) => {
          if (/^mtk\d+$/.test(c)) classes.add(c);
        });
      });
      return { text: text.trim(), tokenClasses: classes.size };
    });
    result.codeVisible = info.text.length > 0;
    result.tokenClasses = info.tokenClasses;
    result.codeColored = info.tokenClasses >= 2; // au moins 2 couleurs de tokens ⇒ coloration
    result.codeSample = info.text.slice(0, 80);

    await page.waitForTimeout(400);
    await page.screenshot({ path: SHOT, fullPage: false });

    if (!result.codeVisible) fail("Le panneau de code est monté mais VIDE hors ligne (aucun texte affiché).");
    if (!result.codeColored) {
      fail(`Contenu affiché mais NON colorié (tokens=${result.tokenClasses}) : tokenisation Monaco inactive.`);
    }

    result.blockedExternalHosts = [...blockedHosts].sort();
    result.consoleErrors = consoleErrors;
    result.benignIgnored = benign;
    if (consoleErrors.length > 0) fail(`Erreurs console applicatives: ${JSON.stringify(consoleErrors)}`);

    console.log("SMOKE_OFFLINE_RESULT", JSON.stringify({ ok: true, ...result }));
  } catch (err) {
    result.blockedExternalHosts = [...blockedHosts].sort();
    result.consoleErrors = consoleErrors;
    result.benignIgnored = benign;
    try {
      const pages = browser.contexts().flatMap((c) => c.pages());
      if (pages[0]) await pages[0].screenshot({ path: SHOT }).catch(() => {});
    } catch {
      /* capture best-effort */
    }
    console.log(
      "SMOKE_OFFLINE_RESULT",
      JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err), ...result }),
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
