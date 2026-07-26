import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pool } from './db';

// Ensure keys exist and load them
const KEYS_DIR = process.env.JWT_KEYS_DIR || '/app/keys';
const PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || path.join(KEYS_DIR, 'jwt_private.pem');
const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(KEYS_DIR, 'jwt_public.pem');

const DEFAULT_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDwzAXjEK3910QY
TIB7EAJnakttFfTQ0cGy7WSTm2znjygTgAiS7zSmXDGDNzL6EtjWbVFApAXHomav
/vevRg7RakcLbcnvavvMrWIHkDoJQsL/29HibtN8NypakuH0aXe3jLzu3dbf4JPs
iQMSrdBUBJA+GHyv44lwlgITScfFrLM9ciOlCG+Dv8SkUdzNiEKANmRCm7vJ4eLE
SgvROqAG6AhKCjZOseGT76Gr81X8oQncgHRtsxqz0RLEyvjrdbwKLePlNisa2aBS
wYaRZgIQ3LKMU6SVGETXeI4x7i5RCJAjXRNfJso1lkh0pUvV2jqynQkwV4wv7RTC
VnrJ4fsZAgMBAAECggEAAxrsbgLMbZgxrnsJEp0wnL8KCTZ15V35GJq3V/ByiXNn
BcZaRfPL+uO4NzwWXhNxZKV8/V+IHAyP9K/N556YiRKM5zyzlJDtfZSUTarqVq17
2IMQDDKX61OGSiv3+jgEdVNdKdrmPxWVLsEPDzX62GSFLCnSbM27O16R2QgT6YyD
zWbC/Q3hNP3R37Aou2sDaJYtmQ2p/hRla6BynflQbhOt6uQuTYSMkAkiJMdsFis9
48d0ovKQkwpWeaLyYZG78gXKf7ZIhT0sxqfjEuCov63YM1mmFo5GaZ8epPG6S5C2
mvctlwpw7DMQGm0uMWHuiIQ+rr2anRIUhft1Zhd6cQKBgQD5L3CQMbhRVmudp00J
q4TaeqU68SxNPbwCJpjmzKX0v23iUyIOYeWEXdjZW1zy5bgDadQztU2iWZc5rU8A
eh5uWzz4HULSgjm8t5GgAIX+GsZkGyJdk9MPC59ANAcD06Hv6c6KrtBxy+zxi8qH
DKsTpRE3ezNYIqCVsKW+ngMz6QKBgQD3Ydsjp8HIam72jr+OsFinQzi6/MRsULwf
Y06zEgFoBwl3UDLhBVdgjjcj0kCgoQ2VkYDZHYIz0wBnPeb4LD3kYYNMLrROtPar
Wnc0hiB1wR/sKdOBoe6MbE7BMXmXEkfKY6bTcTVNDHtk7C0ptnq3mKaaxV/FIfOt
IYXopYb/sQKBgQCstx4NQ/ken4jt+FUkW7c0/AdkqF9tllmnH/uhFb39u2W9lqOn
VmGQcr/oQDRXw7Pc4dCMmqEZ44E3IBH/IaXQFftXemijolHEpXQRc+tr6kESh+A0
/k4vQn36MVWfaGP495UKeQrPpWoxLhSNsNEvR518WC+Jak7mEk9/pORRaQKBgQCb
UEq/NgHKDFiiX7kQotLmIKQrcar4vi9+HWE5uCI9570ftbBb6niTXHZt/QEqWDMp
JnMY3Rfz5ZOpPgoW4d/x1O8UE3aMu7zqlB+nUFZs19Vs9k2eY8ZbT1yamq9WE9oS
zUHeGoN2XlHSaR1pxPGC90oSfbzFDa3pktR53gLF4QKBgQDzd03b2Z2jU+jZdl/+
1bIfEmp/uGVKBk4NZTNz6p31yOC1atuU3f6TKZ6IcpQ/Kt/S4fatavTO+Nq1l1n/
maP0nczKKzFd1A9tt52rTfaY4GtOBZG68WcwZ9p/IVvW0P26a5FoETq4sKaXjw16
AEbgSTU13mevYbZ3Hzjgsp9jUA==
-----END PRIVATE KEY-----`;

const DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8MwF4xCt/ddEGEyAexAC
Z2pLbRX00NHBsu1kk5ts548oE4AIku80plwxgzcy+hLY1m1RQKQFx6Jmr/73r0YO
0WpHC23J72r7zK1iB5A6CULC/9vR4m7TfDcqWpLh9Gl3t4y87t3W3+CT7IkDEq3Q
VASQPhh8r+OJcJYCE0nHxayzPXIjpQhvg7/EpFHczYhCgDZkQpu7yeHixEoL0Tqg
BugISgo2TrHhk++hq/NV/KEJ3IB0bbMas9ESxMr463W8Ci3j5TYrGtmgUsGGkWYC
ENyyjFOklRhE13iOMe4uUQiQI10TXybKNZZIdKVL1do6sp0JMFeML+0UwlZ6yeH7
GQIDAQAB
-----END PUBLIC KEY-----`;

// Write default keys to files if they don't exist
try {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    fs.writeFileSync(PRIVATE_KEY_PATH, DEFAULT_PRIVATE_KEY.trim());
    console.log(`Generated default private key at ${PRIVATE_KEY_PATH}`);
  }
  if (!fs.existsSync(PUBLIC_KEY_PATH)) {
    fs.writeFileSync(PUBLIC_KEY_PATH, DEFAULT_PUBLIC_KEY.trim());
    console.log(`Generated default public key at ${PUBLIC_KEY_PATH}`);
  }
} catch (err) {
  console.warn('Failed to ensure JWT key files in directory:', err);
}

const privateKey = fs.existsSync(PRIVATE_KEY_PATH)
  ? fs.readFileSync(PRIVATE_KEY_PATH, 'utf8')
  : DEFAULT_PRIVATE_KEY;

const publicKey = fs.existsSync(PUBLIC_KEY_PATH)
  ? fs.readFileSync(PUBLIC_KEY_PATH, 'utf8')
  : DEFAULT_PUBLIC_KEY;

const app = express();
app.use(cors());
app.use(express.json());

const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://audit-service:3002';

// Role-Permission Matrix Mapping
const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Owner': ['read:all'],
  'Manager': ['manage:all', 'read:all', 'write:all', 'delete:all'],
  'Inventory Manager': ['inventory:manage', 'read:all'],
  'Staff': ['read:own', 'write:own']
};

interface JWTPayload {
  sub: string;
  iss: string;
  tenantId: string;
  outletIds: string[];
  role: string;
  permissions: string[];
  exp: number;
}

// Extends Request interface to hold auth context
interface AuthRequest extends Request {
  user?: JWTPayload;
}

// Helper: Synchronous Hook emitting event to the Audit Log Store
async function emitAuditEvent(
  userId: string | null,
  tenantId: string | null,
  action: string,
  service: string,
  payload: any,
  status: 'SUCCESS' | 'FAILURE'
) {
  try {
    const logData = {
      tenant_id: tenantId || 'SYSTEM',
      user_id: userId,
      service,
      action,
      payload: { ...payload, status },
    };
    console.log(`Emitting audit event to Audit Store: ${action} - Status: ${status}`);
    // Await the audit write before sending auth response (synchronous hook)
    await axios.post(`${AUDIT_SERVICE_URL}/events`, logData, {
      timeout: 2000,
    });
  } catch (error: any) {
    console.error('Audit Log Store write failed:', error.message);
    // In production, depending on SLA, we may fail-closed or fail-open.
    // For this implementation, we log the failure and allow the request to proceed.
  }
}

// Middleware: Authenticate and Decode RS256 JWT
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
    console.error('JWT validation failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'auth-service' });
});

// Endpoint: POST /login
app.post('/login', async (req: Request, res: Response) => {
  const { email, password, mfaCode } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // 1. Fetch user and their associated outlets
    const userQuery = `
      SELECT u.id, u.tenant_id, u.email, u.password_hash, u.role, u.mfa_enabled, 
             COALESCE(array_agg(uo.outlet_id) FILTER (WHERE uo.outlet_id IS NOT NULL), '{}') as outlet_ids
      FROM users u
      LEFT JOIN user_outlets uo ON u.id = uo.user_id
      WHERE u.email = $1
      GROUP BY u.id
    `;
    const userRes = await pool.query(userQuery, [email]);
    if (userRes.rows.length === 0) {
      await emitAuditEvent(null, null, 'USER_LOGIN_FAILED', 'auth-service', { email, reason: 'User not found' }, 'FAILURE');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      await emitAuditEvent(user.id, user.tenant_id, 'USER_LOGIN_FAILED', 'auth-service', { email, reason: 'Invalid password' }, 'FAILURE');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 3. TOTP MFA validation engine for Owner and Admin roles (or if user has mfa_enabled = true)
    const requiresMFA = user.role === 'Owner' || user.mfa_enabled;

    if (requiresMFA) {
      // Look up secret
      const secretQuery = `SELECT secret FROM mfa_secrets WHERE user_id = $1`;
      const secretRes = await pool.query(secretQuery, [user.id]);
      const secretObj = secretRes.rows[0];

      if (!secretObj) {
        // Fallback: If no secret found but MFA is required, we should prompt to register, or create one for demo.
        // For security, if MFA is forced but not configured, fail login.
        await emitAuditEvent(user.id, user.tenant_id, 'USER_LOGIN_MFA_FAILED', 'auth-service', { email, reason: 'MFA required but not configured' }, 'FAILURE');
        return res.status(500).json({ error: 'MFA configuration missing. Contact Admin.' });
      }

      if (!mfaCode) {
        // First step of login: return MFA challenge request
        return res.status(200).json({
          mfaRequired: true,
          message: 'Multi-Factor Authentication (MFA) TOTP code is required to complete login.',
        });
      }

      // Verify the TOTP code
      const isMfaValid = authenticator.verify({
        token: mfaCode,
        secret: secretObj.secret,
      });

      if (!isMfaValid) {
        await emitAuditEvent(user.id, user.tenant_id, 'USER_LOGIN_MFA_FAILED', 'auth-service', { email, reason: 'Invalid MFA TOTP code' }, 'FAILURE');
        return res.status(401).json({ error: 'Invalid MFA code' });
      }
    }

    // 4. Generate tokens
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    const expTime = Math.floor(Date.now() / 1000) + 15 * 60; // 15 mins expiry

    const accessTokenPayload: JWTPayload = {
      sub: user.id,
      iss: 'dineiq-issuer', // Matches issuer in Kong config
      tenantId: user.tenant_id,
      outletIds: user.outlet_ids,
      role: user.role,
      permissions,
      exp: expTime,
    };

    const accessToken = jwt.sign(accessTokenPayload, privateKey, { algorithm: 'RS256' });

    // Refresh token: standard 7-day duration, stored in DB for rotation & revocation
    const refreshTokenValue = jwt.sign({ sub: user.id }, privateKey, { algorithm: 'RS256', expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Save refresh token
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, refreshTokenValue, expiresAt]
    );

    // Emit event
    await emitAuditEvent(user.id, user.tenant_id, 'USER_LOGIN_SUCCESS', 'auth-service', { email, role: user.role }, 'SUCCESS');

    return res.status(200).json({
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        outletIds: user.outlet_ids,
      },
    });

  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Endpoint: POST /refresh
app.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    // 1. Verify token signature
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, publicKey, { algorithms: ['RS256'] });
    } catch (err: any) {
      return res.status(401).json({ error: 'Invalid refresh token signature' });
    }

    const userId = decoded.sub;

    // 2. Fetch and check database record
    const tokenQuery = `
      SELECT r.id, r.user_id, r.expires_at, r.revoked, u.tenant_id, u.role
      FROM refresh_tokens r
      JOIN users u ON r.user_id = u.id
      WHERE r.token = $1
    `;
    const tokenRes = await pool.query(tokenQuery, [refreshToken]);
    if (tokenRes.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token not found or expired' });
    }

    const tokenRecord = tokenRes.rows[0];

    if (tokenRecord.revoked) {
      // Re-use detection: if a revoked refresh token is presented, revoke all other refresh tokens for this user!
      await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1`, [userId]);
      await emitAuditEvent(userId, tokenRecord.tenant_id, 'TOKEN_REUSE_DETECTED', 'auth-service', { token: refreshToken }, 'FAILURE');
      return res.status(401).json({ error: 'Token reuse detected. All sessions revoked.' });
    }

    if (new Date() > new Date(tokenRecord.expires_at)) {
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // 3. Mark old token as revoked (one-time use / rotation)
    await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`, [tokenRecord.id]);

    // Fetch active user details (inc outlets)
    const userQuery = `
      SELECT u.id, u.tenant_id, u.email, u.role, 
             COALESCE(array_agg(uo.outlet_id) FILTER (WHERE uo.outlet_id IS NOT NULL), '{}') as outlet_ids
      FROM users u
      LEFT JOIN user_outlets uo ON u.id = uo.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `;
    const userRes = await pool.query(userQuery, [userId]);
    const user = userRes.rows[0];

    // 4. Generate new keys/tokens
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    const expTime = Math.floor(Date.now() / 1000) + 15 * 60; // 15 mins expiry

    const newAccessTokenPayload: JWTPayload = {
      sub: user.id,
      iss: 'dineiq-issuer',
      tenantId: user.tenant_id,
      outletIds: user.outlet_ids,
      role: user.role,
      permissions,
      exp: expTime,
    };

    const newAccessToken = jwt.sign(newAccessTokenPayload, privateKey, { algorithm: 'RS256' });
    const newRefreshTokenValue = jwt.sign({ sub: user.id }, privateKey, { algorithm: 'RS256', expiresIn: '7d' });
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Save new refresh token
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, newRefreshTokenValue, newExpiresAt]
    );

    await emitAuditEvent(user.id, user.tenant_id, 'TOKEN_REFRESH_SUCCESS', 'auth-service', { userId: user.id }, 'SUCCESS');

    return res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenValue,
      expiresIn: 900,
    });

  } catch (error: any) {
    console.error('Refresh token error:', error);
    return res.status(500).json({ error: 'Internal server error during refresh' });
  }
});

// Endpoint: GET /users
// Authenticated and checks permissions
app.get('/users', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const currentUser = req.user!;

  try {
    // Audit search request
    await emitAuditEvent(currentUser.sub, currentUser.tenantId, 'READ_USERS_ATTEMPT', 'auth-service', { requestorRole: currentUser.role }, 'SUCCESS');

    // Role-Permission Matrix Enforcement:
    // - Owner (read-all): Can read all users across all tenants, OR at least all users in their tenant. Let's make it scoped to tenant for security, or full-read. "Owner (read-all)" implies read-all users.
    // - Manager (full ops): read/manage all users in their tenant.
    // - Inventory Manager (inventory full, others read): read-all users in their tenant.
    // - Staff (own records): Can only view their own user record.

    let query = '';
    let params: any[] = [];

    const hasReadAllPermission = currentUser.permissions.includes('read:all') || currentUser.role === 'Owner';
    const isStaffOnly = currentUser.permissions.includes('read:own') && !hasReadAllPermission;

    if (isStaffOnly) {
      // Can only query own record
      query = `
        SELECT u.id, u.tenant_id, u.email, u.role, u.mfa_enabled, u.created_at,
               COALESCE(array_agg(uo.outlet_id) FILTER (WHERE uo.outlet_id IS NOT NULL), '{}') as outlet_ids
        FROM users u
        LEFT JOIN user_outlets uo ON u.id = uo.user_id
        WHERE u.id = $1
        GROUP BY u.id
      `;
      params = [currentUser.sub];
    } else if (hasReadAllPermission) {
      // Owner/Manager/Inventory Manager can query users.
      // If Owner, maybe see users across all tenants, or restricted to current tenant?
      // Since it's strict multi-tenancy, we scope all queries by tenant_id to prevent data leaks.
      // Let's filter by the requestor's tenant_id!
      query = `
        SELECT u.id, u.tenant_id, u.email, u.role, u.mfa_enabled, u.created_at,
               COALESCE(array_agg(uo.outlet_id) FILTER (WHERE uo.outlet_id IS NOT NULL), '{}') as outlet_ids
        FROM users u
        LEFT JOIN user_outlets uo ON u.id = uo.user_id
        WHERE u.tenant_id = $1
        GROUP BY u.id
      `;
      params = [currentUser.tenantId];
    } else {
      await emitAuditEvent(currentUser.sub, currentUser.tenantId, 'READ_USERS_FORBIDDEN', 'auth-service', { requestorRole: currentUser.role }, 'FAILURE');
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    const usersRes = await pool.query(query, params);
    
    await emitAuditEvent(currentUser.sub, currentUser.tenantId, 'READ_USERS_SUCCESS', 'auth-service', { usersReturnedCount: usersRes.rows.length }, 'SUCCESS');
    
    return res.status(200).json(usersRes.rows);

  } catch (error: any) {
    console.error('GET /users error:', error);
    return res.status(500).json({ error: 'Internal server error while retrieving users' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Auth Service is running on port ${PORT}`);
});
