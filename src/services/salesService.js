'use strict';

const { Op } = require('sequelize');
const { SalesEntry } = require('../models');
const { performLinearRegression } = require('../analytics/regression');

const validMonth = month => typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
const monthIndex = month => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
const monthLabel = index => `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;

async function history(artistIds) {
    if (!artistIds.length) return [];
    const rows = await SalesEntry.findAll({ where: { artistId: { [Op.in]: artistIds } }, order: [['month', 'ASC']] });
    const totals = new Map();
    for (const row of rows) if (validMonth(row.month)) totals.set(row.month, (totals.get(row.month) || 0) + row.revenue);
    return [...totals].map(([month, revenue]) => ({ month, revenue }));
}

function forecast(rows, months) {
    if (rows.length < 3) return { rows, future: [], slope: 0, intercept: 0 };
    const first = monthIndex(rows[0].month);
    const last = monthIndex(rows.at(-1).month);
    // Fit actual calendar positions. Missing months remain gaps, never invented sales.
    const model = performLinearRegression(rows.map(r => monthIndex(r.month) - first), rows.map(r => r.revenue));
    const future = rows.length < 3 ? [] : Array.from({ length: months }, (_, i) => ({
        month: monthLabel(last + i + 1), revenue: Math.max(0, Math.round(model.predict(last - first + i + 1))),
    }));
    return { rows, future, slope: model.slope, intercept: model.intercept };
}

module.exports = { history, forecast, validMonth, monthIndex, monthLabel };
