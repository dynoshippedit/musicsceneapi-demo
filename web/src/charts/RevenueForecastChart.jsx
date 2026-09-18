import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { useBrand } from '../brand/BrandContext.jsx';
import { chartTokens, baseOptions, reskinDatasets } from './chartDefaults.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

/**
 * Renders the datasets `GET /v3/analytics/projections` already computed server-side
 * (linear regression in src/analytics/regression.js). The frontend performs no regression of
 * its own — it only re-skins the served series onto the active theme (see reskinDatasets).
 */
export function RevenueForecastChart({ chartData, height = 260 }) {
  const { text, formatters } = useBrand();
  const tokens = useMemo(() => chartTokens(), []);

  const data = useMemo(() => ({
    labels: chartData?.labels ?? [],
    // Individual recorded months must remain visible even with no adjacent data.
    datasets: reskinDatasets(chartData?.datasets, tokens).map(dataset => ({ ...dataset, pointRadius: 3, pointHitRadius: 6 })),
  }), [chartData, tokens]);

  const options = useMemo(() => {
    const base = baseOptions(tokens, { currencyFormatter: formatters.moneyCompact });
    return {
      ...base,
      scales: {
        ...base.scales,
        y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, callback: (value) => formatters.moneyCompact(value) } },
      },
    };
  }, [tokens, formatters]);

  return (
    <div style={{ height }} role="img" aria-label={text.a11y.chart}>
      <Line data={data} options={options} />
    </div>
  );
}
