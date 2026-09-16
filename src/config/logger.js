/**
 * src/config/logger.js
 *
 * Winston logger extracted from mau5trap-production-api.js L221-235.
 *
 * Behavior preserved exactly, with ONE robustness fix that cannot change any
 * API response: the logs/ directory is created if missing. The original relied
 * on logs/ pre-existing (audit: absent from the repo, no mkdirSync), so winston
 * File transports would fail to write. This only affects log output, never HTTP.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const config = require('./index');

// Ensure the log directory exists (see note above).
const logDir = path.dirname(path.resolve(process.cwd(), config.logging.errorFile));
try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
} catch (_) {
    // Never let logging setup break boot.
}

// api L221-229
const logger = winston.createLogger({
    level: config.logging.level,
    format: winston.format.json(),
    defaultMeta: { service: 'mau5trap-api' },
    transports: [
        new winston.transports.File({ filename: config.logging.errorFile, level: 'error' }),
        new winston.transports.File({ filename: config.logging.combinedFile })
    ]
});

// api L231-235
if (!config.isProduction) {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

module.exports = logger;
