CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist
DROP TABLE IF EXISTS reservation_analytics_snapshots CASCADE;
DROP TABLE IF EXISTS waitlist_entries CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS tables CASCADE;

-- 1. Tables table
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    table_number VARCHAR(20) NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    area_name VARCHAR(100) NOT NULL, -- e.g., 'Indoor', 'Patio', 'Bar'
    status VARCHAR(50) DEFAULT 'Available' NOT NULL, -- 'Available', 'Reserved', 'Occupied'
    version INT DEFAULT 1 NOT NULL, -- For optimistic locking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, outlet_id, table_number)
);

-- 2. Reservations table
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    guest_name VARCHAR(100) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_phone VARCHAR(50) NOT NULL,
    party_size INT NOT NULL CHECK (party_size > 0),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'Reserved' NOT NULL, -- 'Reserved', 'Seated', 'Cleared', 'No Show', 'Cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Waitlist entries
CREATE TABLE waitlist_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    guest_name VARCHAR(100) NOT NULL,
    guest_phone VARCHAR(50) NOT NULL,
    party_size INT NOT NULL CHECK (party_size > 0),
    status VARCHAR(50) DEFAULT 'Waiting' NOT NULL, -- 'Waiting', 'Seated', 'Cancelled'
    estimated_wait_minutes INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Reservation Analytics Snapshots
CREATE TABLE reservation_analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL,
    total_reservations INT DEFAULT 0 NOT NULL,
    cancellations INT DEFAULT 0 NOT NULL,
    no_shows INT DEFAULT 0 NOT NULL,
    seated_count INT DEFAULT 0 NOT NULL,
    average_turnover_minutes INT DEFAULT 45 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for performance and multi-tenancy constraint enforcement
CREATE INDEX idx_tables_outlet ON tables(tenant_id, outlet_id);
CREATE INDEX idx_reservations_time ON reservations(tenant_id, outlet_id, start_time, end_time);
CREATE INDEX idx_waitlist_status ON waitlist_entries(tenant_id, outlet_id, status);
CREATE INDEX idx_analytics_time ON reservation_analytics_snapshots(tenant_id, outlet_id, snapshot_time DESC);

-- Seed initial tables for tenant-hq-1 and outlet-bistro-1
INSERT INTO tables (id, tenant_id, outlet_id, table_number, capacity, area_name, status, version) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'tenant-hq-1', 'outlet-bistro-1', 'T1', 2, 'Indoor', 'Available', 1),
    ('a0000000-0000-0000-0000-000000000002', 'tenant-hq-1', 'outlet-bistro-1', 'T2', 4, 'Indoor', 'Available', 1),
    ('a0000000-0000-0000-0000-000000000003', 'tenant-hq-1', 'outlet-bistro-1', 'T3', 4, 'Patio', 'Available', 1),
    ('a0000000-0000-0000-0000-000000000004', 'tenant-hq-1', 'outlet-bistro-1', 'T4', 6, 'Patio', 'Available', 1),
    ('a0000000-0000-0000-0000-000000000005', 'tenant-hq-1', 'outlet-bistro-1', 'T5', 2, 'Bar', 'Available', 1);

-- Seed initial waitlist entries (to demonstrate wait time estimations based on active waitlist length)
INSERT INTO waitlist_entries (tenant_id, outlet_id, guest_name, guest_phone, party_size, status, estimated_wait_minutes) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'John Doe', '555-1234', 2, 'Waiting', 15),
    ('tenant-hq-1', 'outlet-bistro-1', 'Jane Smith', '555-5678', 4, 'Waiting', 30);


