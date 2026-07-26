CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist
DROP TABLE IF EXISTS reorder_alerts CASCADE;
DROP TABLE IF EXISTS stock_transactions CASCADE;
DROP TABLE IF EXISTS ingredients CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;

-- 1. Vendors (Supplier Master)
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    contact_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    supplies VARCHAR(255), -- e.g., 'Chicken, Eggs, Milk'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, outlet_id, name)
);

-- 2. Ingredients
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(20) NOT NULL, -- e.g., 'kg', 'liters', 'units', 'pieces'
    min_threshold NUMERIC(12, 4) NOT NULL CHECK (min_threshold >= 0),
    cost_per_unit NUMERIC(12, 4) NOT NULL CHECK (cost_per_unit >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, outlet_id, name)
);

-- 3. Stock Transactions
CREATE TABLE stock_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('opening', 'closing', 'purchase', 'wastage', 'consumption')),
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12, 4) NOT NULL CHECK (unit_cost >= 0),
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    reason VARCHAR(100), -- e.g., 'Burnt', 'Rotten', 'Expired', 'Spoiled', 'Damaged'
    notes TEXT,
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by UUID, -- User ID from JWT
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Reorder Alerts
CREATE TABLE reorder_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'Active' NOT NULL CHECK (status IN ('Active', 'Resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance and multi-tenancy constraints
CREATE INDEX idx_vendors_tenant ON vendors(tenant_id, outlet_id);
CREATE INDEX idx_ingredients_tenant ON ingredients(tenant_id, outlet_id);
CREATE INDEX idx_stock_trans_ing ON stock_transactions(ingredient_id);
CREATE INDEX idx_reorder_alerts_ing ON reorder_alerts(ingredient_id, status);

-- Seed initial vendors
INSERT INTO vendors (id, tenant_id, outlet_id, name, contact_name, email, phone, supplies) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'tenant-hq-1', 'outlet-bistro-1', 'Fresh Farm', 'Ramesh Kumar', 'orders@freshfarm.com', '9876543210', 'Chicken, Eggs, Milk'),
    ('b0000000-0000-0000-0000-000000000002', 'tenant-hq-1', 'outlet-bistro-1', 'Sysco Foods', 'John Sysco', 'orders@sysco.com', '555-9000', 'Wagyu Beef, Oil, Spices'),
    ('b0000000-0000-0000-0000-000000000003', 'tenant-hq-1', 'outlet-bistro-1', 'Grain Supplier Co', 'Suresh Sharma', 'sales@grainsupplier.com', '9876543211', 'Rice, Salt, Flour');

-- Seed initial ingredients
INSERT INTO ingredients (id, tenant_id, outlet_id, name, unit, min_threshold, cost_per_unit) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'tenant-hq-1', 'outlet-bistro-1', 'Rice', 'kg', 10.0, 60.00),
    ('c0000000-0000-0000-0000-000000000002', 'tenant-hq-1', 'outlet-bistro-1', 'Chicken', 'kg', 15.0, 200.00),
    ('c0000000-0000-0000-0000-000000000003', 'tenant-hq-1', 'outlet-bistro-1', 'Tomato', 'kg', 5.0, 40.00),
    ('c0000000-0000-0000-0000-000000000004', 'tenant-hq-1', 'outlet-bistro-1', 'Onion', 'kg', 10.0, 30.00),
    ('c0000000-0000-0000-0000-000000000005', 'tenant-hq-1', 'outlet-bistro-1', 'Cooking Oil', 'liters', 10.0, 150.00),
    ('c0000000-0000-0000-0000-000000000006', 'tenant-hq-1', 'outlet-bistro-1', 'Salt', 'kg', 2.0, 20.00),
    ('c0000000-0000-0000-0000-000000000007', 'tenant-hq-1', 'outlet-bistro-1', 'Wagyu Beef Ribeye', 'kg', 10.0, 3500.00),
    ('c0000000-0000-0000-0000-000000000008', 'tenant-hq-1', 'outlet-bistro-1', 'Whole Milk', 'liters', 20.0, 60.00),
    ('c0000000-0000-0000-0000-000000000009', 'tenant-hq-1', 'outlet-bistro-1', 'Avocado', 'pieces', 50.0, 80.00);

-- Seed stock transactions
INSERT INTO stock_transactions (tenant_id, outlet_id, ingredient_id, type, quantity, unit_cost, vendor_id, reason, notes) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000001', 'opening', 50.0, 60.00, NULL, NULL, 'Morning Opening Stock'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000002', 'opening', 30.0, 200.00, NULL, NULL, 'Morning Opening Stock'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000003', 'opening', 15.0, 40.00, NULL, NULL, 'Morning Opening Stock'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000002', 'purchase', 20.0, 200.00, 'b0000000-0000-0000-0000-000000000001', NULL, 'Purchased 20kg Chicken from Fresh Farm'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000001', 'wastage', 2.0, 60.00, NULL, 'Burnt', 'Burnt in cooking'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000003', 'wastage', 3.0, 40.00, NULL, 'Rotten', 'Rotten in storage'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000002', 'wastage', 1.0, 200.00, NULL, 'Expired', 'Passed expiry date'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000001', 'consumption', 30.0, 60.00, NULL, NULL, 'Calculated Daily Consumption'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000002', 'consumption', 25.0, 200.00, NULL, NULL, 'Calculated Daily Consumption'),
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000003', 'consumption', 7.0, 40.00, NULL, NULL, 'Calculated Daily Consumption');

-- Seed initial low stock alert for Rice if balance is below 10
INSERT INTO reorder_alerts (tenant_id, outlet_id, ingredient_id, status) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'c0000000-0000-0000-0000-000000000001', 'Active');

