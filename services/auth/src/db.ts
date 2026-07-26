import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the Auth Database:', err.stack);
  } else {
    console.log('Auth Database connected successfully at:', res.rows[0].now);
    pool.query('ALTER TABLE refresh_tokens ALTER COLUMN token TYPE TEXT', (alterErr) => {
      if (alterErr) {
        console.error('Failed to alter refresh_tokens table:', alterErr.message);
      } else {
        console.log('Successfully ensured refresh_tokens.token is TYPE TEXT');
      }
    });
  }
});

