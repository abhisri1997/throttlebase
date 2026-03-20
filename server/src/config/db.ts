import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Connection configuration using environment variables from .env
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'throttle_base',
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
    console.error('❌ Database connection error:', err);
    return false;
  }
};

export default pool;
