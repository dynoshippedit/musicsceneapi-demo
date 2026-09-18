/**
 * The ONE place canvas colours are resolved (contract §3.11-3.12). Chart.js draws to a canvas
 * and cannot read CSS variables, so the tokens are read once through `getComputedStyle` and
 * handed to the chart — the same values the DOM uses, so a theme switch moves the charts too.
 *
 * This file is on the static check S05 allow-list precisely so the token fallbacks below can
 * be literals; no other generic module may carry a colour value.
 */
export function chartTokens() {
  const style = getComputedStyle(document.documentElement);
  const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    accent: token('--color-accent', '#00FF5F'),
    accentDim: token('--color-accent-dim', 'rgba(0, 255, 95, 0.10)'),
    series2: token('--chart-series-2', '#666666'),
    grid: token('--chart-grid', 'rgba(255, 255, 255, 0.05)'),
    tooltipBg: token('--chart-tooltip-bg', 'rgba(0, 0, 0, 0.80)'),
    text: token('--color-text', '#F5F5F5'),
    textDim: token('--color-text-dim', '#666666'),
    font: token('--font-mono', 'monospace').split(',')[0].replace(/['"]/g, '').trim(),
  };
}

export function baseOptions(tokens, { currencyFormatter } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: tokens.textDim,
          boxWidth: 10,
          boxHeight: 10,
          font: { family: tokens.font, size: 10 },
        },
      },
      tooltip: {
        backgroundColor: tokens.tooltipBg,
        borderColor: tokens.grid,
        borderWidth: 1,
        titleFont: { family: tokens.font, size: 11 },
        bodyFont: { family: tokens.font, size: 11 },
        callbacks: currencyFormatter
          ? { label: (item) => `${item.dataset.label}: ${currencyFormatter(item.parsed.y)}` }
          : undefined,
      },
    },
    scales: {
      x: {
        grid: { color: tokens.grid, drawBorder: false },
        ticks: { color: tokens.textDim, font: { family: tokens.font, size: 10 } },
      },
      y: {
        grid: { color: tokens.grid, drawBorder: false },
        ticks: { color: tokens.textDim, font: { family: tokens.font, size: 10 } },
      },
    },
  };
}

/**
 * `GET /v3/analytics/projections` serves Chart.js datasets with the DEFAULT profile's accent
 * hue baked into `borderColor` (src/routes/analytics.js). That is backend label coupling
 * awaiting Phase 4-LABEL. Until then the frontend RE-SKINS the served datasets from the active
 * theme, so a second label does not inherit the reference label's hue through the API payload.
 * Only colour is replaced; labels and numbers are rendered exactly as served.
 */
export function reskinDatasets(datasets, tokens) {
  if (!Array.isArray(datasets)) return [];
  return datasets.map((dataset, index) => {
    const projected = index > 0 || Array.isArray(dataset.borderDash);
    return {
      ...dataset,
      borderColor: projected ? tokens.accent : tokens.series2,
      backgroundColor: projected ? tokens.accentDim : tokens.grid,
      pointBackgroundColor: projected ? tokens.accent : tokens.series2,
      pointRadius: 0,
      pointHoverRadius: 3,
      borderWidth: 2,
    };
  });
}
