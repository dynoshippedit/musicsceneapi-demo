/**
 * src/jobs/monthlyReportJob.js
 *
 * Scheduled monthly report generation and the printer shell-out, extracted
 * from production-api.js (cron.schedule at Phase 1 L1888-1918 and
 * autoPrintReport at L1921-1945).
 *
 * Registration is explicit: server.js calls registerJobs(). The schedule
 * ('0 3 1 * *'), the directory layout (reports/<YYYY-MM>/), the filename
 * pattern and the AUTO_PRINT gate are all unchanged.
 *
 * ============================================================================
 * HIGH-6 COMMAND INJECTION — FIXED (2026-09-28)
 * ============================================================================
 * autoPrintReport() used to interpolate `filepath` (which embeds the
 * client-controllable artist.name) into a shell STRING passed to exec().
 * Two fixes, defense in depth:
 *   1. Filenames are built by src/utils/safeFilename.js (strict whitelist;
 *      no `..`, no separators, no leading dashes, no shell metacharacters).
 *   2. The printer uses execFile() with an ARGUMENTS ARRAY — no shell ever
 *      interprets the path. autoPrintReport() additionally refuses
 *      non-string paths, leading-dash basenames (option injection against
 *      lp/lpr), and any path outside REPORTS_ROOT.
 * The stale "PRESERVED SECURITY ISSUE" header from Phase 2 is removed; the
 * fix is covered by regression tests in tests/regression/services.test.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('../config');
const artistRepo = require('../repositories/artistRepository');
const { generateMonthlyReport } = require('../reports/monthlyReport');
const { reportFilename, assertValidMonth } = require('../utils/safeFilename');

/** Cron expression from the original: 1st of each month at 03:00. */
const SCHEDULE = '0 3 1 * *';

/** Directory reports are written to, relative to the repo root. */
const REPORTS_ROOT = path.join(__dirname, '..', '..', 'reports');

/**
 * Build the on-disk filename for an artist's monthly report.
 * Exported for tests. See src/utils/safeFilename.js for the rules.
 */
function buildReportFilename(artist, month) {
    return reportFilename(artist, month);
}

/**
 * Send a generated PDF to the system printer.
 *
 * Uses execFile() with an arguments array — no shell interprets the path.
 * Fail-closed guards: the path must resolve inside REPORTS_ROOT and its
 * basename must not start with `-` (option injection against lp/lpr).
 */
function autoPrintReport(filepath) {
    if (typeof filepath !== 'string' || filepath.length === 0) {
        console.error('Print refused: filepath must be a non-empty string');
        return;
    }
    const resolved = path.resolve(filepath);
    const root = path.resolve(REPORTS_ROOT);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        console.error('Print refused: path is outside the reports directory');
        return;
    }
    if (path.basename(resolved).startsWith('-')) {
        console.error('Print refused: unsafe filename');
        return;
    }

    const { execFile } = require('child_process');
    const platform = process.platform;

    let command;
    let args;

    if (platform === 'win32') {
        command = 'powershell';
        args = ['-Command', 'Start-Process', '-FilePath', resolved, '-Verb', 'Print'];
    } else if (platform === 'darwin') {
        command = 'lpr';
        args = [resolved];
    } else {
        command = 'lp';
        args = [resolved];
    }

    execFile(command, args, (error, stdout, stderr) => {
        if (error) {
            console.error(`Print error: ${error.message}`);
            return;
        }
        console.log(`Report printed: ${resolved}`);
    });
}

/**
 * Generate every artist's report for a month and write them to disk.
 * Body preserved from the cron callback so a manual run and the scheduled run
 * behave identically.
 *
 * AI/FINANCIAL LIABILITY POSTURE (2026-09-28, FINANCIAL_DATA_POLICY.md):
 * the scheduled job passes { aiInsights: false } EXPLICITLY — no scheduled
 * path may ever send financial data to an AI provider. AI insights in
 * reports require a per-request user opt-in on the interactive endpoints.
 *
 * @param {string} month YYYY-MM
 */
async function generateMonthlyReports(month) {
    assertValidMonth(month);
    console.log('Running scheduled monthly report generation...');

    try {
        const reportsDir = path.join(REPORTS_ROOT, month);
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        // Gap 2 (2026-09-28): the report roster is the DB-first hybrid list, so
        // a customer instance generates reports for ITS artists, never the
        // fictional demo roster. In demo mode the hybrid list still covers
        // the full Pulsegrid roster.
        for (const artist of await artistRepo.findAllHybrid()) {
            const pdfBuffer = await generateMonthlyReport(artist, month, { aiInsights: false });
            const filename = buildReportFilename(artist, month);
            const filepath = path.join(reportsDir, filename);

            // Defense in depth: even though the filename is sanitized, never
            // let a report escape its month directory.
            const resolved = path.resolve(filepath);
            if (!resolved.startsWith(path.resolve(reportsDir) + path.sep)) {
                console.error(`Refusing to write report outside its directory: ${filename}`);
                continue;
            }

            fs.writeFileSync(resolved, pdfBuffer);

            // Auto-print to home PC
            if (config.autoPrint) {
                autoPrintReport(resolved);
            }
        }

        console.log(`Monthly reports generated for ${month}`);
    } catch (error) {
        console.error('Error generating monthly reports:', error);
    }
}

/** The previous calendar month as YYYY-MM, matching the original. */
function previousMonth() {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    return lastMonth.toISOString().slice(0, 7);
}

/**
 * Register the cron schedule. Called explicitly by server.js.
 * @returns {import('node-cron').ScheduledTask}
 */
function register() {
    return cron.schedule(SCHEDULE, async () => {
        await generateMonthlyReports(previousMonth());
    });
}

module.exports = {
    register,
    generateMonthlyReports,
    autoPrintReport,
    buildReportFilename,
    previousMonth,
    SCHEDULE,
    REPORTS_ROOT
};
