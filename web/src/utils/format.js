const dash = '—';

// Every formatter is built from the ACTIVE PROFILE's locale (profile.locale), never from a
// hardcoded '$' / 'en-US' / time zone in a component (PHASE_4A_HANDOFF.md §19).
export function createFormatters(locale) {
  const moneyFormatter = new Intl.NumberFormat(locale.numberLocale, {
    style: 'currency',
    currency: locale.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  const moneyExactFormatter = new Intl.NumberFormat(locale.numberLocale, {
    style: 'currency',
    currency: locale.currency,
    maximumFractionDigits: 0,
  });
  const integerFormatter = new Intl.NumberFormat(locale.numberLocale);
  const compactFormatter = new Intl.NumberFormat(locale.numberLocale, { notation: 'compact', maximumFractionDigits: 1 });
  const dateFormatter = new Intl.DateTimeFormat(locale.numberLocale, {
    year: 'numeric', month: 'short', day: '2-digit', timeZone: locale.timeZone,
  });
  const dateTimeFormatter = new Intl.DateTimeFormat(locale.numberLocale, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: locale.timeZone,
  });
  const valid = (value) => typeof value === 'number' && Number.isFinite(value);

  const parseDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  return {
    moneyCompact: (value) => valid(value) ? moneyFormatter.format(value) : dash,
    money: (value) => valid(value) ? moneyExactFormatter.format(value) : dash,
    integer: (value) => valid(value) ? integerFormatter.format(value) : dash,
    compact: (value) => valid(value) ? compactFormatter.format(value) : dash,
    // Values arrive from the API already expressed in percent units (e.g. 20.7 === 20.7%).
    percent: (value, { digits = 1 } = {}) => valid(value) ? `${value.toFixed(digits)}%` : dash,
    signedPercent: (value, { digits = 1 } = {}) => valid(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%` : dash,
    multiplier: (value, { digits = 1 } = {}) => valid(value) ? `${value.toFixed(digits)}x` : dash,
    date: (value) => { const date = parseDate(value); return date ? dateFormatter.format(date) : dash; },
    dateTime: (value) => { const date = parseDate(value); return date ? dateTimeFormatter.format(date) : dash; },
    text: (value) => (typeof value === 'string' && value.trim() ? value : dash),
    dash,
  };
}
