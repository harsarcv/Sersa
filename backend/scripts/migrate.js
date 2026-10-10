
require("dotenv").config({
  path: require("node:path").resolve(__dirname, "../.env"),
});

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL belum diatur.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: true }
    : undefined,
});

const migrationsDirectory = path.join(__dirname, "../migrations");

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query("COMMIT");

    const files = fs
      .readdirSync(migrationsDirectory)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();

    for (const filename of files) {
      const existing = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [filename]
      );

      if (existing.rowCount > 0) {
        console.log(`SKIP ${filename} (sudah diterapkan)`);
        continue;
      }

      const sql = fs.readFileSync(
        path.join(migrationsDirectory, filename),
        "utf8"
      );

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename]
        );

        await client.query("COMMIT");
        console.log(`OK ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`${filename} gagal: ${error.message}`);
      }
    }

    console.log("Migration selesai.");
  } catch (error) {
    console.error("Migration gagal:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
