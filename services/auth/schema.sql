CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist (for easy seeding/development)
DROP TABLE IF EXISTS mfa_secrets CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS user_outlets CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS outlets CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

CREATE TABLE tenants (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE outlets (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE user_role AS ENUM ('Owner', 'Manager', 'Inventory Manager', 'Staff');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_outlets (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outlet_id VARCHAR(50) NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, outlet_id)
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mfa_secrets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial data
INSERT INTO tenants (id, name) VALUES ('tenant-hq-1', 'Apex Hospitality Group');
INSERT INTO outlets (id, tenant_id, name) VALUES 
    ('outlet-bistro-1', 'tenant-hq-1', 'Apex Bistro Downtown'),
    ('outlet-cafe-2', 'tenant-hq-1', 'Apex Cafe Airport');

-- Password for all seed users is 'Password123!'
-- Hashed: $2b$12$LZ2vYoz522ATdr4MjPAk6.qiUiclXXuz0C/4a7TUz9deVnwj/.982

-- 1. Owner (MFA enabled, requires TOTP)
-- Seed TOTP secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' (Base32 encoded 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
INSERT INTO users (id, tenant_id, email, password_hash, role, mfa_enabled) 
VALUES ('11111111-1111-1111-1111-111111111111', 'tenant-hq-1', 'owner@dineiq.com', '$2b$12$LZ2vYoz522ATdr4MjPAk6.qiUiclXXuz0C/4a7TUz9deVnwj/.982', 'Owner', TRUE);

INSERT INTO mfa_secrets (user_id, secret) 
VALUES ('11111111-1111-1111-1111-111111111111', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');

-- 2. Manager (MFA not enabled by default)
INSERT INTO users (id, tenant_id, email, password_hash, role, mfa_enabled) 
VALUES ('22222222-2222-2222-2222-222222222222', 'tenant-hq-1', 'manager@dineiq.com', '$2b$12$LZ2vYoz522ATdr4MjPAk6.qiUiclXXuz0C/4a7TUz9deVnwj/.982', 'Manager', FALSE);

-- 3. Inventory Manager (MFA not enabled)
INSERT INTO users (id, tenant_id, email, password_hash, role, mfa_enabled) 
VALUES ('33333333-3333-3333-3333-333333333333', 'tenant-hq-1', 'inventory@dineiq.com', '$2b$12$LZ2vYoz522ATdr4MjPAk6.qiUiclXXuz0C/4a7TUz9deVnwj/.982', 'Inventory Manager', FALSE);

-- 4. Staff (MFA not enabled)
INSERT INTO users (id, tenant_id, email, password_hash, role, mfa_enabled) 
VALUES ('44444444-4444-4444-4444-444444444444', 'tenant-hq-1', 'staff@dineiq.com', '$2b$12$LZ2vYoz522ATdr4MjPAk6.qiUiclXXuz0C/4a7TUz9deVnwj/.982', 'Staff', FALSE);

-- Map users to outlets
INSERT INTO user_outlets (user_id, outlet_id) VALUES
    ('11111111-1111-1111-1111-111111111111', 'outlet-bistro-1'),
    ('11111111-1111-1111-1111-111111111111', 'outlet-cafe-2'),
    ('22222222-2222-2222-2222-222222222222', 'outlet-bistro-1'),
    ('33333333-3333-3333-3333-333333333333', 'outlet-cafe-2'),
    ('44444444-4444-4444-4444-444444444444', 'outlet-bistro-1');
