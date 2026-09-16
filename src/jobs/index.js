/**
 * src/jobs/index.js
 *
 * Job registry. The entrypoint calls registerJobs() once, after the database
 * is initialized. Nothing schedules work as a side effect of being required.
 *
 * NOT REGISTERED (audit R5): sync/masterLoop.js exports masterSyncLoop(), the
 * intended live-data path that would populate the `Stats` table. It has never
 * been wired to a schedule — only test_sync.js requires it. Registering it here
 * would start writing rows and change GET /v3/analytics/projections from
 * synthetic to real data, which is a behavior change and therefore out of scope
 * for this phase. It is listed in REFACTOR_PROGRESS.md as remaining work.
 */

'use strict';

const monthlyReportJob = require('./monthlyReportJob');
const logger = require('../config/logger');

/**
 * @param {{enabled?: boolean}} [opts] pass { enabled: false } to skip scheduling
 * @returns {object[]} registered task handles
 */
function registerJobs({ enabled = true } = {}) {
    if (!enabled) {
        logger.info('[jobs] scheduling disabled');
        return [];
    }

    const tasks = [monthlyReportJob.register()];
    logger.info(`[jobs] registered ${tasks.length} scheduled job(s): monthly reports (${monthlyReportJob.SCHEDULE})`);
    return tasks;
}

module.exports = { registerJobs, monthlyReportJob };
