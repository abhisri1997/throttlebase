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

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
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
  connectionTimeoutMillis: 2000, // Return an error if a connection takes > 2 seconds
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
