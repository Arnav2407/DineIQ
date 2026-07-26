CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop trigger and function if exists
DROP TRIGGER IF EXISTS audit_events_immutable_trigger ON audit_events;
DROP FUNCTION IF EXISTS block_audit_modifications();
DROP TABLE IF EXISTS audit_events CASCADE;

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    user_id UUID,
    service VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Index critical search fields for GET /admin/audit-log performance
CREATE INDEX idx_audit_events_tenant ON audit_events(tenant_id);
CREATE INDEX idx_audit_events_user ON audit_events(user_id);
CREATE INDEX idx_audit_events_service ON audit_events(service);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);

-- Enable Row-Level Security (RLS)
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- 1. Policy to allow SELECT queries for audit_user
CREATE POLICY select_audit_policy ON audit_events
    FOR SELECT
    TO audit_user
    USING (true);

-- 2. Policy to allow INSERT queries for audit_user
CREATE POLICY insert_audit_policy ON audit_events
    FOR INSERT
    TO audit_user
    WITH CHECK (true);

-- 3. Policy to explicitly DENY all UPDATE operations
CREATE POLICY deny_update_audit_policy ON audit_events
    FOR UPDATE
    TO audit_user
    USING (false)
    WITH CHECK (false);

-- 4. Policy to explicitly DENY all DELETE operations
CREATE POLICY deny_delete_audit_policy ON audit_events
    FOR DELETE
    TO audit_user
    USING (false);

-- --- Database Trigger for absolute immutability enforcement ---
-- This protects against any UPDATE/DELETE attempts, including those from superusers
CREATE OR REPLACE FUNCTION block_audit_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit events table is append-only. UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_immutable_trigger
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW
    EXECUTE FUNCTION block_audit_modifications();
