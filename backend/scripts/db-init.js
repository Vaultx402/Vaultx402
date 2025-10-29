import fs from 'fs';
import path from 'path';
import url from 'url';
import { Pool } from 'pg';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
const databaseUrl = process.env.DATABASE_URL || 'postgres://localhost:5432/x402vault';

async function main() {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('✅ Database schema applied');
  } catch (e) {
    await client.query('rollback');
    console.error('❌ Failed to apply schema:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('❌ db-init error:', e);
  process.exit(1);
});


