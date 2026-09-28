/**
 * src/jobs/monthlyReportJob.js
 *
 * Scheduled monthly report generation and the printer shell-out, extracted
 * from production-api.js (cron.schedule at Phase 1 L1888-1918 and
 * autoPrintReport at L1921-1945).
 *
 * ============================================================================
 * IMPORTANT CHANGE IN REGISTRATION, NOT IN BEHAVIOR
 * ============================================================================
 * The original registered the cron job as a SIDE EFFECT of requiring the API
 * module. That meant:
 *   - every `require('./production-api')` in a test started a timer,
 *     which is why tests had to run with --test-force-exit
 *   - the schedule could not be disabled for a test run
 *
 * Registration is now explicit: server.js calls registerJobs(). The schedule
 * ('0 3 1 * *'), the directory layout (reports/<YYYY-MM>/), the filename
 * pattern and the AUTO_PRINT gate are all unchanged.
 *
 * ============================================================================
 * PRESERVED SECURITY ISSUE (audit HIGH-6) — COMMAND INJECTION
 * ============================================================================
 * autoPrintReport() interpolates `filepath` into a shell string and passes it
 * to exec(). `filepath` embeds `artist.name`, which is client-controllable via
 * POST /v3/artists. A name containing shell metacharacters reaches the shell.
 *
 * Reachability requires AUTO_PRINT=true AND admin (or the CRITICAL-1 empty-body
 * login). Left UNCHANGED in Phase 2 because fixing it alters process-spawn
 * behavior; it is listed as the top remediation item in REFACTOR_PROGRESS.md.
 * The unsafe interpolation is kept verbatim below and clearly marked.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const config = require('../config');
const artistRepo = require('../repositories/artistRepository');
const { generateMonthlyReport } = require('../reports/monthlyReport');

/** Cron expression from the original: 1st of each month at 03:00. */
const SCHEDULE = '0 3 1 * *';

/** Directory reports are written to, relative to the repo root. */
const REPORTS_ROOT = path.join(__dirname, '..', '..', 'reports');

/**
 * Send a generated PDF to the system printer.
 *
 * HIGH-6 FIX (Phase 3): the previous implementation interpolated `filepath`
 * into a shell STRING and passed it to exec(), which is a command-injection
 * surface (filepath embeds the client-controllable artist.name). It now uses
 * execFile() with an ARGUMENTS ARRAY, so no shell interprets the path.
 */
function autoPrintReport(filepath) {
    const { execFile } = require('child_process');
    const platform = process.platform;

    let command;
    let args;

    if (platform === 'win32') {
        command = 'powershell';
        args = ['-Command', 'Start-Process', '-FilePath', filepath, '-Verb', 'Print'];
    } else if (platform === 'darwin') {
        command = 'lpr';
        args = [filepath];
    } else {
        command = 'lp';
        args = [filepath];
    }

    execFile(command, args, (error, stdout, stderr) => {
        if (error) {
            console.error(`Print error: ${error.message}`);
            return;
        }
        console.log(`Report printed: ${filepath}`);
    });
}

/**
 * Generate every artist's report for a month and write them to disk.
 * Body preserved from the cron callback so a manual run and the scheduled run
 * behave identically.
 *
 * @param {string} month YYYY-MM
 */
async function generateMonthlyReports(month) {
    console.log('Running scheduled monthly report generation...');

    try {
        const reportsDir = path.join(REPORTS_ROOT, month);
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        for (const artist of artistRepo.getMockArtists()) {
            const pdfBuffer = await generateMonthlyReport(artist, month);
            const filename = `${artist.name}_${month}_report.pdf`;
            const filepath = path.join(reportsDir, filename);

            fs.writeFileSync(filepath, pdfBuffer);

            // Auto-print to home PC
            if (config.autoPrint) {
                autoPrintReport(filepath);
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
    previousMonth,
    SCHEDULE,
    REPORTS_ROOT
};
