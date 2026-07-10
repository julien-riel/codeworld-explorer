/**
 * Normalisation de `committedAt` (contrat §3.4.1) : `git show -s --format=%cI`
 * émet un instant AVEC offset local (`2026-07-09T14:32:07+02:00`, jamais `Z`).
 * On le convertit en UTC seconde et on émet `YYYY-MM-DDTHH:MM:SSZ`.
 *
 * Contrainte dure du paquet : SANS `new Date()`, SANS fuseau machine — parse et
 * arithmétique ENTIÈRE uniquement. Les conversions date↔jours suivent l'algorithme
 * de Howard Hinnant (calendrier grégorien proleptique), en division PLANCHER exacte.
 */

import { mod } from "./integer.js";
import { NonNormalizableDateError } from "./errors.js";

const SECONDS_PER_DAY = 86400;

/**
 * Division plancher exacte pour `n > 0`. `a − mod(a, n)` est un multiple de `n`,
 * donc le quotient est entier sans arrondi flottant (aucune division inexacte).
 */
function floorDiv(a: number, n: number): number {
  return (a - mod(a, n)) / n;
}

/** Jours écoulés depuis 1970-01-01 pour une date civile (grégorien proleptique). */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = floorDiv(yy, 400);
  const yoe = yy - era * 400; // [0, 399]
  const mDoy = m > 2 ? m - 3 : m + 9;
  const doy = floorDiv(153 * mDoy + 2, 5) + d - 1; // [0, 365]
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/** Date civile correspondant à un nombre de jours depuis 1970-01-01. */
function civilFromDays(z0: number): { y: number; m: number; d: number } {
  const z = z0 + 719468;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100)); // [0, 365]
  const mp = floorDiv(5 * doy + 2, 153); // [0, 11]
  const d = doy - floorDiv(153 * mp + 2, 5) + 1; // [1, 31]
  const m = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

function isLeap(y: number): boolean {
  return (mod(y, 4) === 0 && mod(y, 100) !== 0) || mod(y, 400) === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(y: number, m: number): number {
  if (m === 2 && isLeap(y)) return 29;
  // m ∈ [1, 12] garanti par l'appelant.
  return DAYS_IN_MONTH[m - 1] ?? 31;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// Groupes : année, mois, jour, heure, minute, seconde, fraction (ignorée), offset.
const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Normalise une date ISO 8601 avec offset (forme `%cI`) en UTC seconde
 * `YYYY-MM-DDTHH:MM:SSZ` (contrat §3.4.1).
 *
 * @throws NonNormalizableDateError si la forme n'est pas parsable, si un champ est
 * hors plage, ou si l'année UTC résultante sort de `[1000, 9999]`.
 */
export function normalizeCommittedAt(raw: string): string {
  const match = ISO_8601.exec(raw);
  if (match === null) {
    throw new NonNormalizableDateError(raw, "format ISO 8601 avec offset attendu");
  }
  const [, ys, ms, ds, hs, mins, ss, off] = match;
  // Garde défensive : les 7 groupes sont non optionnels, donc présents dès que
  // `match` réussit ; ce test narrows leur type de `string | undefined` à `string`.
  if (
    ys === undefined ||
    ms === undefined ||
    ds === undefined ||
    hs === undefined ||
    mins === undefined ||
    ss === undefined ||
    off === undefined
  ) {
    throw new NonNormalizableDateError(raw, "capture ISO 8601 incomplète");
  }
  const year = Number(ys);
  const month = Number(ms);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mins);
  const second = Number(ss);

  if (month < 1 || month > 12) {
    throw new NonNormalizableDateError(raw, `mois hors [01, 12] : ${ms}`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new NonNormalizableDateError(raw, `jour hors plage pour ${ys}-${ms} : ${ds}`);
  }
  if (hour > 23) {
    throw new NonNormalizableDateError(raw, `heure hors [00, 23] : ${hs}`);
  }
  if (minute > 59 || second > 59) {
    throw new NonNormalizableDateError(raw, `minute/seconde hors [00, 59] : ${mins}:${ss}`);
  }

  let offsetSeconds = 0;
  if (off !== "Z") {
    const sign = off.charAt(0) === "-" ? -1 : 1;
    const offHour = Number(off.slice(1, 3));
    const offMinute = Number(off.slice(4, 6));
    if (offHour > 23 || offMinute > 59) {
      throw new NonNormalizableDateError(raw, `offset hors plage : ${off}`);
    }
    offsetSeconds = sign * (offHour * 3600 + offMinute * 60);
  }

  // Conversion en UTC : instantUTC = instantLocal − offset (contrat §3.4.1, étape 2).
  const localSecOfDay = hour * 3600 + minute * 60 + second; // [0, 86399]
  const shifted = localSecOfDay - offsetSeconds; // peut déborder d'un jour de part et d'autre
  const dayDelta = floorDiv(shifted, SECONDS_PER_DAY); // ∈ {−1, 0, 1}
  const utcSecOfDay = shifted - dayDelta * SECONDS_PER_DAY; // [0, 86399]

  const utcDays = daysFromCivil(year, month, day) + dayDelta;
  const { y, m, d } = civilFromDays(utcDays);
  if (y < 1000 || y > 9999) {
    throw new NonNormalizableDateError(raw, `année UTC hors [1000, 9999] : ${String(y)}`);
  }

  const hh = floorDiv(utcSecOfDay, 3600);
  const mm = floorDiv(utcSecOfDay - hh * 3600, 60);
  const sec = utcSecOfDay - hh * 3600 - mm * 60;

  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}T${pad(hh, 2)}:${pad(mm, 2)}:${pad(sec, 2)}Z`;
}
