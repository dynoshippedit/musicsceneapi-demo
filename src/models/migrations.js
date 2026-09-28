'use strict';

// Explicit, transactional repair for the SQLite schema produced by sync({alter:true}).
// Re-running this migration is harmless. Normal startup only creates absent tables.
async function repairSalesSchema(sequelize) {
    if (sequelize.getDialect() !== 'sqlite') return false;
    const [indexes] = await sequelize.query('PRAGMA index_list("SalesEntries")');
    const invalid = [];
    for (const index of indexes.filter(i => i.unique)) {
        const quoted = index.name.replace(/"/g, '""');
        const [columns] = await sequelize.query(`PRAGMA index_info("${quoted}")`);
        if (columns.length === 1 && ['artistId', 'month'].includes(columns[0].name)) invalid.push(index.name);
    }
    if (!invalid.length) return false;
    // VACUUM INTO makes a consistent SQLite backup, including committed WAL data.
    // Keep it beside the database; never put credentials/customer data in git.
    const storage = sequelize.options.storage;
    if (storage && storage !== ':memory:') {
        const fs = require('node:fs');
        const path = require('node:path');
        const directory = path.join(path.dirname(path.resolve(storage)), 'backups');
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const backup = path.join(directory, `before-sales-repair-${Date.now()}-${require('node:crypto').randomUUID()}.sqlite`);
        await sequelize.query('VACUUM INTO $backup', { bind: { backup } });
        fs.chmodSync(backup, 0o600);
    }
    await sequelize.transaction({ type: 'IMMEDIATE' }, async transaction => {
        const query = sql => sequelize.query(sql, { transaction });
        const [columns] = await query('PRAGMA table_info("SalesEntries")');
        if (columns.map(c => c.name).sort().join(',') !== 'artistId,id,month,revenue') {
            throw new Error('Sales schema has unexpected columns; refusing a lossy migration');
        }
        const [indexesToKeep] = await query("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='SalesEntries' AND sql IS NOT NULL");
        await query('CREATE TABLE "SalesEntries_repair" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "artistId" VARCHAR(255) NOT NULL, "month" VARCHAR(255) NOT NULL, "revenue" FLOAT NOT NULL)');
        await query('INSERT INTO "SalesEntries_repair" ("id","artistId","month","revenue") SELECT "id","artistId","month","revenue" FROM "SalesEntries"');
        await query('DROP TABLE "SalesEntries"');
        await query('ALTER TABLE "SalesEntries_repair" RENAME TO "SalesEntries"');
        for (const index of indexesToKeep) if (!invalid.includes(index.name)) await query(index.sql);
        await query('CREATE UNIQUE INDEX IF NOT EXISTS "sales_entries_artist_id_month" ON "SalesEntries" ("artistId","month")');
    });
    return true;
}

module.exports = { repairSalesSchema, addUserSecurityColumns };

/**
 * STEP 7 (D7, 2026-09-28): session revocation + deactivation columns on Users.
 * Idempotent: each ALTER runs only when the column is absent. Existing rows
 * get the DEFAULT so old tokens (no sessionVersion claim) keep working.
 */
async function addUserSecurityColumns(sequelize) {
    if (sequelize.getDialect() !== "sqlite") return false;
    // On a fresh database the Users table does not exist yet when migrations
    // run (sequelize.sync() creates it afterwards, with the new columns from
    // the model definition). PRAGMA on a missing table returns no rows, so
    // no-op in that case instead of failing the boot.
    const [rows] = await sequelize.query('PRAGMA table_info("Users");');
    if (!rows.length) return false;
    const names = new Set(rows.map((r) => r.name));
    const needed = [
        ["sessionVersion", "INTEGER NOT NULL DEFAULT 0"],
        ["version", "INTEGER NOT NULL DEFAULT 0"],
        ["active", "INTEGER NOT NULL DEFAULT 1"], // BOOLEAN
    ];
    let changed = false;
    for (const [name, ddl] of needed) {
        if (!names.has(name)) {
            await sequelize.query(`ALTER TABLE "Users" ADD COLUMN "${name}" ${ddl}`);
            changed = true;
        }
    }
    return changed;
}
