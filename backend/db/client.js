import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL || 'postgres://localhost:5432/x402vault';

export const db = new Pool({ connectionString: databaseUrl });


