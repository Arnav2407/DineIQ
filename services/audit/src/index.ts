import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { pool } from './db';

const KEYS_DIR = process.env.JWT_KEYS_DIR || '/app/keys';
const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(KEYS_DIR, 'jwt_public.pem');

const DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8MwF4xCt/ddEGEyAexAC
Z2pLbRX00NHBsu1kk5ts548oE4AIku80plwxgzcy+hLY1m1RQKQFx6Jmr/73r0YO
0WpHC23J72r7zK1iB5A6CULC/9vR4m7TfDcqWpLh9Gl3t4y87t3W3+CT7IkDEq3Q
VASQPhh8r+OJcJYCE0nHxayzPXIjpQhvg7/EpFHczYhCgDZkQpu7yeHixEoL0Tqg
BugISgo2TrHhk++hq/NV/KEJ3IB0bbMas9ESxMr463W8Ci3j5TYrGtmgUsGGkWYC
ENyyjFOklRhE13iOMe4uUQiQI10TXybKNZZIdKVL1do6sp0JMFeML+0UwlZ6yeH7
GQIDAQAB
-----END PUBLIC KEY-----`;

const publicKey = fs.existsSync(PUBLIC_KEY_PATH)
  ? fs.readFileSync(PUBLIC_KEY_PATH, 'utf8')
  : DEFAULT_PUBLIC_KEY;

const app = express();
app.use(cors());
app.use(express.json());

interface JWTPayload {
  sub: string;
  iss: string;
  tenantId: string;
  outletIds: string[];
  role: string;
  permissions: string[];
  exp: number;
}

interface AuthRequest extends Request {
  user?: JWTPayload;
}

// Middleware: Authenticate and Decode JWT via RS256
const authenticateJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header is missing or malformed' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as JWTPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    console.error('Audit Service: JWT validation failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'audit-service' });
});

// Endpoint: POST /events
// Ingests audit events (Internal communication from other services)
app.post('/events', async (req: Request, res: Response) => {
  const { tenant_id, user_id, service, action, payload } = req.body;

  if (!tenant_id || !service || !action) {
    return res.status(400).json({ error: 'tenant_id, service, and action are required fields' });
  }

  try {
    const insertQuery = `
      INSERT INTO audit_events (tenant_id, user_id, service, action, payload)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at
    `;
    const values = [
      tenant_id,
      user_id || null,
      service,
      action,
      payload ? JSON.stringify(payload) : null,
    ];

    const result = await pool.query(insertQuery, values);
    return res.status(201).json({
      message: 'Audit event stored successfully',
      eventId: result.rows[0].id,
      createdAt: result.rows[0].created_at,
    });
  } catch (error: any) {
    console.error('Failed to write audit event:', error.message);
    return res.status(500).json({ error: 'Failed to write to audit log store' });
  }
});

// Endpoint: GET /admin/audit-log
// Searches and filters audit logs (Owner and Manager roles only, scoped to tenant)
app.get(['/admin/audit-log', '/api/v1/admin/audit-log'], authenticateJWT, async (req: AuthRequest, res: Response) => {
  const currentUser = req.user!;

  // 1. Role Authorization check (only Owner and Manager roles are permitted to read audit logs)
  if (currentUser.role !== 'Owner' && currentUser.role !== 'Manager') {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges to view audit logs' });
  }

  // 2. Extract filter criteria
  const { user_id, service, start_date, end_date } = req.query;

  try {
    // 3. Build SQL query dynamically with tenant isolation enforced
    let query = `
      SELECT id, tenant_id, user_id, service, action, payload, created_at
      FROM audit_events
      WHERE tenant_id = $1
    `;
    const params: any[] = [currentUser.tenantId];
    let paramCounter = 2;

    if (user_id) {
      query += ` AND user_id = $${paramCounter++}`;
      params.push(user_id);
    }

    if (service) {
      query += ` AND service = $${paramCounter++}`;
      params.push(service);
    }

    if (start_date) {
      query += ` AND created_at >= $${paramCounter++}`;
      params.push(new Date(start_date as string));
    }

    if (end_date) {
      query += ` AND created_at <= $${paramCounter++}`;
      params.push(new Date(end_date as string));
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);

  } catch (error: any) {
    console.error('Error fetching audit logs:', error.message);
    return res.status(500).json({ error: 'Internal server error while searching audit logs' });
  }
});

// Demo endpoint to test RLS: try to update/delete an audit event to verify failures
app.post('/test/compromise', async (req: Request, res: Response) => {
  const { eventId, targetAction } = req.body;

  if (!eventId) {
    return res.status(400).json({ error: 'eventId is required' });
  }

  try {
    if (targetAction === 'update') {
      await pool.query("UPDATE audit_events SET action = 'TEMPERED' WHERE id = $1", [eventId]);
      return res.status(200).json({ status: 'SUCCESS', message: 'Audit event successfully updated (RLS bypassed!)' });
    } else if (targetAction === 'delete') {
      await pool.query("DELETE FROM audit_events WHERE id = $1", [eventId]);
      return res.status(200).json({ status: 'SUCCESS', message: 'Audit event successfully deleted (RLS bypassed!)' });
    } else {
      return res.status(400).json({ error: 'Invalid targetAction. Use update or delete.' });
    }
  } catch (error: any) {
    // Expected behavior: trigger or policy throws exception
    return res.status(403).json({
      status: 'BLOCKED',
      error: error.message,
      code: error.code,
    });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Audit Service is running on port ${PORT}`);
});
