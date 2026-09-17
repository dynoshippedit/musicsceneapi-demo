const dash = '—';

export function createFormatters(locale) {
  const moneyFormatter = new Intl.NumberFormat(locale.numberLocale, {
    style: 'currency',
    currency: locale.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  const integerFormatter = new Intl.NumberFormat(locale.numberLocale);
  const valid = (value) => typeof value === 'number' && Number.isFinite(value);

  return {
    moneyCompact: (value) => valid(value) ? moneyFormatter.format(value) : dash,
    integer: (value) => valid(value) ? integerFormatter.format(value) : dash,
  };
}
