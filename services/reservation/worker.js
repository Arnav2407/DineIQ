const { Worker } = require('bullmq');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://reservation_user:reservation_secure_pass@db-reservation:5432/dineiq_reservation';
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379/0';

console.log('Starting reservation no-show background worker...');

// PostgreSQL Pool
const pool = new Pool({
  connectionString: DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
});

// Redis connection configuration for BullMQ
// Convert URL to redis connection options
const redisUrl = new URL(REDIS_URL);
const connectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379', 10),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db: parseInt(redisUrl.pathname.replace('/', '') || '0', 10),
};

// Function: Update Redis Table Status Cache
async function updateTableCache(redisClient, tenantId, outletId, tableId, status) {
  try {
    const cacheKey = `dineiq:tenant:${tenantId}:outlet:${outletId}:table:${tableId}:status`;
    const hashKey = `dineiq:tenant:${tenantId}:outlet:${outletId}:tables_status`;
    
    // Using simple SET and HSET commands
    await redisClient.set(cacheKey, status);
    await redisClient.hset(hashKey, tableId, status);
    console.log(`Synced Redis cache: Table ${tableId} set to ${status}`);
  } catch (err) {
    console.error('Failed to sync table cache in Redis:', err);
  }
}

// Function: Update Analytics snapshot in PostgreSQL database
async function incrementNoShowAnalytics(client, tenantId, outletId) {
  const currentHour = new Date();
  currentHour.setMinutes(0, 0, 0); // truncate to current hour

  // Check if snapshot exists for current hour
  const checkRes = await client.query(
    `SELECT id FROM reservation_analytics_snapshots 
     WHERE tenant_id = $1 AND outlet_id = $2 AND snapshot_time = $3`,
    [tenantId, outletId, currentHour]
  );

  if (checkRes.rows.length === 0) {
    // Insert new snapshot
    await client.query(
      `INSERT INTO reservation_analytics_snapshots (tenant_id, outlet_id, snapshot_time, total_reservations, cancellations, no_shows, seated_count, average_turnover_minutes)
       VALUES ($1, $2, $3, 0, 0, 1, 0, 45)`,
      [tenantId, outletId, currentHour]
    );
  } else {
    // Increment no-show count
    await client.query(
      `UPDATE reservation_analytics_snapshots 
       SET no_shows = no_shows + 1 
       WHERE id = $1`,
      [checkRes.rows[0].id]
    );
  }
}

// Instantiate Worker
const worker = new Worker('no-show-queue', async (job) => {
  console.log(`Processing job ${job.id}: Name: ${job.name}`);
  const { reservationId } = job.data;

  if (!reservationId) {
    console.warn('Skipping job: reservationId is missing in payload');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (job.name === 'send-reminder') {
      // 1. Fetch current reservation details with table number
      const resResult = await client.query(
        `SELECT r.id, r.tenant_id, r.outlet_id, r.guest_name, r.guest_phone, r.start_time, r.status, t.table_number 
         FROM reservations r
         JOIN tables t ON r.table_id = t.id
         WHERE r.id = $1`,
        [reservationId]
      );

      if (resResult.rows.length === 0) {
        console.log(`Reservation ${reservationId} not found. Skipping reminder.`);
        await client.query('ROLLBACK');
        return;
      }

      const reservation = resResult.rows[0];

      if (reservation.status !== 'Reserved') {
        console.log(`Reservation ${reservationId} has status '${reservation.status}'. Reminder skipped.`);
        await client.query('ROLLBACK');
        return;
      }

      // Format reminder message
      const timeStr = new Date(reservation.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msg = `Hi ${reservation.guest_name}, this is a reminder for your reservation today for Table ${reservation.table_number} at ${timeStr}. We look forward to seeing you!`;
      
      const notification = {
        timestamp: new Date().toISOString(),
        type: 'Reservation Reminder',
        recipient: `${reservation.guest_name} (${reservation.guest_phone})`,
        message: msg
      };

      // Push to Redis notifications list
      const redisClient = await worker.client;
      const key = `dineiq:tenant:${reservation.tenant_id}:outlet:${reservation.outlet_id}:notifications`;
      await redisClient.lpush(key, JSON.stringify(notification));
      await redisClient.ltrim(key, 0, 99);

      console.log(`Sent reminder notification for reservation ${reservationId}`);
      await client.query('COMMIT');
      return;
    }

    // Default no-show check logic
    // 1. Fetch current reservation details
    const resResult = await client.query(
      `SELECT id, tenant_id, outlet_id, table_id, start_time, status 
       FROM reservations WHERE id = $1`,
      [reservationId]
    );

    if (resResult.rows.length === 0) {
      console.log(`Reservation ${reservationId} not found. Skipping.`);
      await client.query('ROLLBACK');
      return;
    }

    const reservation = resResult.rows[0];

    // 2. Check if reservation is still in 'Reserved' state
    if (reservation.status !== 'Reserved') {
      console.log(`Reservation ${reservationId} has status '${reservation.status}'. No-show check skipped.`);
      await client.query('ROLLBACK');
      return;
    }

    console.log(`Reservation ${reservationId} is unseated 15 mins past start window. Updating to NO_SHOW.`);

    // 3. Update reservation status to 'No Show'
    await client.query(
      `UPDATE reservations SET status = 'No Show', updated_at = NOW() WHERE id = $1`,
      [reservationId]
    );

    // 4. Reset table status to 'Available' (if currently 'Reserved')
    const tableResult = await client.query(
      `SELECT id, status, version FROM tables WHERE id = $1`,
      [reservation.table_id]
    );

    if (tableResult.rows.length > 0) {
      const table = tableResult.rows[0];
      if (table.status === 'Reserved') {
        await client.query(
          `UPDATE tables SET status = 'Available', version = version + 1, updated_at = NOW() WHERE id = $1`,
          [table.id]
        );
        console.log(`Released Table ${table.id} status to Available.`);
        
        // Sync cache to Redis
        // Obtain redis connection from BullMQ worker context
        const redisClient = await worker.client;
        await updateTableCache(redisClient, reservation.tenant_id, reservation.outlet_id, table.id, 'Available');
      }
    }

    // 5. Update snapshot analytics
    await incrementNoShowAnalytics(client, reservation.tenant_id, reservation.outlet_id);

    await client.query('COMMIT');
    console.log(`Successfully completed no-show state shifting for reservation ${reservationId}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error processing job ${job.id}:`, error);
    throw error; // Let BullMQ retry the job if it fails due to database errors
  } finally {
    client.release();
  }
}, {
  connection: connectionOptions,
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully.`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job ? job.id : 'unknown'} failed:`, err);
});
