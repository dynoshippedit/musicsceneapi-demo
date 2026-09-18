#!/usr/bin/env node
'use strict';

// Usage: node scripts/repair-sales-schema.js /absolute/path/to/database.sqlite
// The migration saves a consistent backup before changing a damaged schema.
const path = require('node:path');
const fs = require('node:fs');
const { Sequelize } = require('sequelize');
const { repairSalesSchema } = require('../src/models/migrations');

async function main() {
    const filename = process.argv[2];
    if (!filename || !path.isAbsolute(filename) || !fs.existsSync(filename)) throw new Error('Pass the absolute path of an existing SQLite database');
    const db = new Sequelize({ dialect: 'sqlite', storage: filename, logging: false });
    try {
        const before = (await db.query('SELECT * FROM SalesEntries ORDER BY id'))[0];
        const repaired = await repairSalesSchema(db);
        const after = (await db.query('SELECT * FROM SalesEntries ORDER BY id'))[0];
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Sales rows changed unexpectedly; restore the backup before continuing');
        const integrity = (await db.query('PRAGMA integrity_check'))[0];
        if (integrity.some(row => row.integrity_check !== 'ok')) throw new Error('SQLite integrity check failed');
        console.log(JSON.stringify({ database: filename, repaired, salesRowsPreserved: after.length, integrity: 'ok', backupDirectory: path.join(path.dirname(filename), 'backups') }, null, 2));
    } finally { await db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
