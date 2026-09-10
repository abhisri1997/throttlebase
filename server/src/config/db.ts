import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const parsedPort = Number.parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10);
const dbPort = Number.isNaN(parsedPort) ? 5432 : parsedPort;
const dbUser = process.env.DB_USER || process.env.PGUSER || process.env.USER;
const dbPassword = process.env.DB_PASSWORD || process.env.PGPASSWORD || '';
const dbName = process.env.DB_NAME || process.env.PGDATABASE || 'throttle_base';
const dbHost = process.env.DB_HOST || process.env.PGHOST || 'localhost';

// pg-connection-string treats an embedded `sslmode=prefer|require|verify-ca`
// query param as an alias for `verify-full` and builds its OWN strict ssl
// config from that — which wins over the `ssl: {...}` object below and
// forces full certificate-chain verification. Supabase's chain fails that
// verification in most container runtimes (missing intermediate CA in the
// image), surfacing as "self-signed certificate in certificate chain" even
// though the connection itself is genuinely Supabase's. Stripping sslmode
// from the connection string here means only OUR explicit `ssl` option
// below applies — the connection is still encrypted; this only skips
// validating the certificate chain.
const rawConnectionString = process.env.DATABASE_URL;
const connectionString = rawConnectionString
  ? rawConnectionString.replace(/([?&])sslmode=[^&]*(&)?/i, (_match, lead, trailing) => (trailing ? lead : lead === '?' ? '?' : '')).replace(/[?&]$/, '')
  : undefined;

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
    };

// Connection configuration using environment variables from .env
const pool = new Pool({
  ...poolConfig,
  // Standard production settings (good for learning)
  max: 20, // Max number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error if a connection takes > 5 seconds
});

// Helper function to query the database using the pool
export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

// Check the database connection on startup
export const testConnection = async () => {
  try {
    const res = await query('SELECT NOW()');
    console.log('✅ Database connected successfully at:', res.rows[0].now);
    return true;
  } catch (err) {
    const connectionSummary = process.env.DATABASE_URL
      ? 'DATABASE_URL'
      : `host=${dbHost} port=${dbPort} user=${dbUser || '(empty)'} db=${dbName}`;
    console.error('❌ Database connection config:', connectionSummary);
    console.error('❌ Database connection error:', err);
    return false;
  }
};

export default pool;
