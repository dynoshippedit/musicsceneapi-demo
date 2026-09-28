/**
 * src/utils/charts.js
 *
 * Chart rendering extracted verbatim from production-api.js L27-125.
 *
 * The four ChartJSNodeCanvas instances are module-level singletons in the
 * original ("Global Chart Instantiation (Performance Optimization)", L27) and
 * remain so here. Dimensions, colors, fonts and titles are byte-identical, so
 * generated PDF/PNG output is unchanged.
 */

'use strict';

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
// PHASE 4CF: chart colors from the Label Intelligence Profile (pulsegrid
// values byte-identical).
const profile = require('../profile');
const colors = profile.charts;

// api L28-31
const chartJSNodeCanvasPie = new ChartJSNodeCanvas({ width: 400, height: 400, backgroundColour: 'white' });
const chartJSNodeCanvasBar = new ChartJSNodeCanvas({ width: 600, height: 300, backgroundColour: 'white' });
const chartJSNodeCanvasLine = new ChartJSNodeCanvas({ width: 600, height: 300, backgroundColour: 'white' });
const chartJSNodeCanvasDonut = new ChartJSNodeCanvas({ width: 400, height: 400, backgroundColour: 'white' });

// api L33-51
async function generatePieChart(labels, data) {
    const configuration = {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.piePalette
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 14 } } },
                title: { display: true, text: 'Revenue Distribution', font: { size: 18, weight: 'bold' } }
            }
        }
    };
    return await chartJSNodeCanvasPie.renderToBuffer(configuration);
}

// api L53-76
async function generateBarChart(labels, data) {
    const configuration = {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Revenue by Region',
                data,
                backgroundColor: colors.accent
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 14 } } },
                x: { ticks: { font: { size: 14 } } }
            },
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Streaming Geography', font: { size: 18, weight: 'bold' } }
            }
        }
    };
    return await chartJSNodeCanvasBar.renderToBuffer(configuration);
}

// api L78-104
async function generateLineChart(labels, data) {
    const configuration = {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Monthly Sales',
                data,
                borderColor: colors.accent,
                backgroundColor: colors.accentSoft,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 14 } } },
                x: { ticks: { font: { size: 14 } } }
            },
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Sales Trend', font: { size: 18, weight: 'bold' } }
            }
        }
    };
    return await chartJSNodeCanvasLine.renderToBuffer(configuration);
}

// api L106-125
async function generateDonutChart(labels, data) {
    const configuration = {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.donutPalette,
                borderWidth: 0
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 14 } } },
                title: { display: true, text: 'Forecast vs Target', font: { size: 18, weight: 'bold' } }
            }
        }
    };
    return await chartJSNodeCanvasDonut.renderToBuffer(configuration);
}

module.exports = {
    generatePieChart,
    generateBarChart,
    generateLineChart,
    generateDonutChart
};
