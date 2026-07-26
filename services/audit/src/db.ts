import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the Audit Database:', err.stack);
  } else {
    console.log('Audit Database connected successfully at:', res.rows[0].now);
  }
});
