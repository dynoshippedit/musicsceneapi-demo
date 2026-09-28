/**
 * src/repositories/operationsRepository.js
 *
 * Static operations fixtures extracted from production-api.js
 * (Phase 1 L2487-2567). Served by:
 *   GET /v3/operations/logistics
 *   GET /v3/operations/assets
 *   GET /v3/operations/contracts
 *
 * PHASE 4CF: the fixture data itself moved VERBATIM into the Label
 * Intelligence Profile (profile.datasets.operations) — no value was retyped
 * or changed, including `eta: null` and `recoupable: null`. This module
 * remains the repository seam the routes and tests consume.
 *
 * Mutable: the handlers return these arrays by reference, so a caller that
 * mutated a returned object would corrupt the fixture process-wide. No current
 * handler does. Documented, not changed.
 */

'use strict';

const profile = require('../profile');

const operationsData = profile.datasets.operations;

module.exports = {
    operationsData,
    getLogistics: () => operationsData.logistics,
    getAssets: () => operationsData.assets,
    getContracts: () => operationsData.contracts
};
