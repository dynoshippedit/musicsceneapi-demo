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

module.exports = { repairSalesSchema, addUserSecurityColumns, addRoyaltyDedupColumns, addMonthlyCloseColumns };

/**
 * Monthly close (2026-09-28, fix 1): statement identity columns on
 * RoyaltyLines + removal of the defective unique dedup indexes.
 *
 * The old unique indexes on (catalogKey, period, source[, sourceFileHash])
 * were the schema half of the defect: they made the database itself reject
 * legitimate second lines for the same recording/period/source (territory,
 * rights-type, or rate-tier splits). Dedup now lives on the full
 * row-content hash inside the import transaction; the unique indexes are
 * dropped. New non-unique lookup indexes come from the model definition
 * via sync(); this migration only repairs pre-existing databases.
 *
 * Idempotent: columns are added only when absent; DROP INDEX IF EXISTS is
 * a no-op when the index is already gone.
 */
async function addMonthlyCloseColumns(sequelize) {
    if (sequelize.getDialect() !== "sqlite") return false;
    // On a fresh database the table does not exist yet when migrations run
    // (sequelize.sync() creates it afterwards, with the new columns and
    // indexes from the model definition). No-op instead of failing boot.
    const [rows] = await sequelize.query('PRAGMA table_info("RoyaltyLines");');
    if (!rows.length) return false;
    const names = new Set(rows.map((r) => r.name));
    let changed = false;
    if (!names.has("statementId")) {
        await sequelize.query('ALTER TABLE "RoyaltyLines" ADD COLUMN "statementId" INTEGER');
        changed = true;
    }
    if (!names.has("rowHash")) {
        await sequelize.query('ALTER TABLE "RoyaltyLines" ADD COLUMN "rowHash" VARCHAR(255)');
        changed = true;
    }
    for (const idx of ["royalty_lines_catalog_period_source_hash", "royalty_lines_catalog_period_source"]) {
        await sequelize.query(`DROP INDEX IF EXISTS "${idx}"`);
        changed = true;
    }
    return changed;
}

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

/**
 * Royalty import idempotency (2026-09-28): catalogKey column + unique
 * (catalogKey, period, source) index on RoyaltyLines.
 *
 * Idempotent: the column is added only when absent, the backfill only touches
 * rows that still lack a key, and the index uses IF NOT EXISTS. Existing rows
 * get their key from the linked Recording (isrc) or Release (upc); rows that
 * resolve to nothing get a unique 'legacy:<id>' placeholder so the unique
 * index can be built. NULL sources become '' because SQLite treats NULLs as
 * distinct inside UNIQUE indexes; imports always write '' for a blank source.
 */
async function addRoyaltyDedupColumns(sequelize) {
    if (sequelize.getDialect() !== "sqlite") return false;
    // On a fresh database the table does not exist yet when migrations run
    // (sequelize.sync() creates it afterwards, with the new columns and the
    // unique index from the model definition). No-op instead of failing boot.
    const [rows] = await sequelize.query('PRAGMA table_info("RoyaltyLines");');
    if (!rows.length) return false;
    const names = new Set(rows.map((r) => r.name));
    let changed = false;
    if (!names.has("catalogKey")) {
        await sequelize.query('ALTER TABLE "RoyaltyLines" ADD COLUMN "catalogKey" VARCHAR(255) NOT NULL DEFAULT \'\'');
        changed = true;
    }
    // Defensive: a partial database may lack the catalog tables entirely.
    const [tbls] = await sequelize.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Recordings','Releases')`);
    const have = new Set(tbls.map((t) => t.name));
    if (have.has('Recordings')) {
        await sequelize.query(`UPDATE "RoyaltyLines" SET "catalogKey" =
            COALESCE((SELECT "isrc" FROM "Recordings" WHERE "Recordings"."id" = "RoyaltyLines"."recordingId"),
                     'legacy:' || "id")
            WHERE "catalogKey" = '' AND "recordingId" IS NOT NULL`);
    }
    if (have.has('Releases')) {
        await sequelize.query(`UPDATE "RoyaltyLines" SET "catalogKey" =
            COALESCE((SELECT "upc" FROM "Releases" WHERE "Releases"."id" = "RoyaltyLines"."releaseId"),
                     'legacy:' || "id")
            WHERE "catalogKey" = '' AND "releaseId" IS NOT NULL`);
    }
    await sequelize.query(`UPDATE "RoyaltyLines" SET "catalogKey" = 'legacy:' || "id"
        WHERE "catalogKey" = '' OR "catalogKey" IS NULL`);
    await sequelize.query(`UPDATE "RoyaltyLines" SET "source" = '' WHERE "source" IS NULL`);
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "royalty_lines_catalog_period_source" ON "RoyaltyLines" ("catalogKey", "period", "source")');
    return changed;
}
