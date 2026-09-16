/**
 * src/analytics/regression.js
 *
 * Pure predictive-analytics maths extracted verbatim from
 * mau5trap-production-api.js (Phase 1 L2663-2730).
 *
 * Kept free of HTTP, cache and data access so it is unit-testable.
 */

'use strict';

const math = require('mathjs');

/**
 * Ordinary least squares via the normal equations, B = (X'X)^-1 X'Y.
 * Verbatim from the original, including the singular-matrix fallback which
 * returns a predictor that is constantly 0.
 *
 * @param {number[]} xValues
 * @param {number[]} yValues
 * @returns {{slope:number, intercept:number, predict:(x:number)=>number}}
 */
function performLinearRegression(xValues, yValues) {
    // Model: y = b0 + b1*x  /  Matrix Form: Y = X*B + E  /  B = (X'X)^-1 X'Y
    const X = xValues.map((x) => [1, x]);
    const Y = yValues.map((y) => [y]);

    try {
        const matrixX = math.matrix(X);
        const matrixY = math.matrix(Y);

        const transposedX = math.transpose(matrixX);
        const xTx = math.multiply(transposedX, matrixX);
        const inverseXtX = math.inv(xTx);
        const pseudoInverse = math.multiply(inverseXtX, transposedX);
        const B = math.multiply(pseudoInverse, matrixY);

        const intercept = B.get([0, 0]);
        const slope = B.get([1, 0]);

        return {
            slope,
            intercept,
            predict: (x) => (slope * x) + intercept
        };
    } catch (error) {
        console.error('Regression error:', error);
        // Fallback for singular matrices or errors: Simple average slope
        return { slope: 0, intercept: 0, predict: () => 0 };
    }
}

/**
 * Fabricate 12 months of history by discounting the current value backwards
 * and adding +/-5% noise.
 *
 * ============================================================================
 * THIS IS SYNTHETIC DATA, NOT MEASUREMENTS (audit R5)
 * ============================================================================
 * README.md claims projections regress over "12 months of historical revenue
 * data". No such history exists: `Stats` is never written because the master
 * sync loop is not registered. This function invents the series that
 * GET /v3/analytics/projections then regresses.
 *
 * It is also why that endpoint is nondeterministic and excluded from snapshot
 * comparison (Math.random() below).
 *
 * @param {number} currentVal
 * @param {number} growthRate annual growth percentage, e.g. 20.7
 * @returns {number[]} 12 values, oldest first
 */
function generateSyntheticHistory(currentVal, growthRate) {
    const history = [];
    const monthlyGrowth = (growthRate / 100) / 12;

    for (let i = 0; i < 12; i++) {
        const noise = 0.95 + (Math.random() * 0.1);
        const monthsBack = 11 - i;
        const base = currentVal / Math.pow(1 + monthlyGrowth, monthsBack);
        history.push(Math.round(base * noise));
    }
    return history;
}

module.exports = { performLinearRegression, generateSyntheticHistory };
