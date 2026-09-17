// Helpers for validation/gate.mjs. Pure Node — nothing here imports from web/src.

/**
 * Parse a CSS colour as serialised by Chromium's getComputedStyle into [r, g, b, a] (0-255, 0-1).
 * Handles `rgb(r, g, b)`, `rgba(r, g, b, a)` and the `color(srgb r g b / a)` form Chromium
 * uses for resolved `color-mix()` values.
 */
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  let m = s.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  m = s.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : parseAlpha(m[4])];
  m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/);
  if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : parseAlpha(m[4])];
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  return null;
}

function parseAlpha(v) { return v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v); }

/** Compare two CSS colours with ±1 channel and ±0.011 alpha tolerance (8-bit rounding). */
export function sameColor(a, b) {
  const x = parseColor(a); const y = parseColor(b);
  if (!x || !y) return false;
  return x.slice(0, 3).every((v, i) => Math.abs(v - y[i]) <= 1) && Math.abs(x[3] - y[3]) <= 0.011;
}

/**
 * Display formatters with the SAME Intl options the app's utils/format.js declares
 * (currency, compact, max 1 / min 0 fraction digits). Duplicated deliberately so the
 * gate does not import application code; a drift here shows up as a KPI mismatch.
 */
export function fmt(numberLocale, currency) {
  const money = new Intl.NumberFormat(numberLocale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 });
  const integer = new Intl.NumberFormat(numberLocale);
  const valid = (v) => typeof v === 'number' && Number.isFinite(v);
  return { money: (v) => (valid(v) ? money.format(v) : '—'), integer: (v) => (valid(v) ? integer.format(v) : '—') };
}

/** KPI label order fixed by PHASE_4A_HANDOFF.md §15 / architecture §13.5.4. */
export const KPI_ORDER = ['MONTHLY REVENUE', 'QUARTERLY PROJECTION', 'ANNUAL PROJECTION', 'ACTIVE ARTISTS'];
