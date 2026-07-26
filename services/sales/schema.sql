CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist
DROP TABLE IF EXISTS sales_trend_snapshots CASCADE;
DROP TABLE IF EXISTS pos_sync_log CASCADE;
DROP TABLE IF EXISTS sales_transactions CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;

-- 1. Menu Items
CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    sku VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    cost NUMERIC(12, 2) NOT NULL CHECK (cost >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, outlet_id, sku)
);

-- 2. Sales Transactions (Customer Bills)
CREATE TABLE sales_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(100) NOT NULL, -- POS Invoice number / Transaction ID (e.g. #1001)
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    meal_period VARCHAR(50), -- 'Breakfast', 'Lunch', 'Snacks', 'Dinner', 'Late Night'
    payment_method VARCHAR(50) DEFAULT 'UPI', -- 'UPI', 'Cash', 'Card'
    table_area VARCHAR(50) DEFAULT 'Indoor', -- 'Indoor', 'Outdoor', 'Family Hall', 'Rooftop', 'Bar'
    customer_count INT DEFAULT 1 CHECK (customer_count > 0),
    is_reservation BOOLEAN DEFAULT FALSE,
    transaction_time TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. POS Sync Log (for sentinel connectivity tracking)
CREATE TABLE pos_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    sync_status VARCHAR(50) NOT NULL CHECK (sync_status IN ('Success', 'Failed')),
    records_synced INT DEFAULT 0 NOT NULL,
    error_message TEXT,
    last_sync_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Sales Trend Snapshots
CREATE TABLE sales_trend_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    snapshot_date DATE NOT NULL,
    total_revenue NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    total_orders INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, outlet_id, snapshot_date)
);

-- Indexes for performance and multi-tenancy constraints
CREATE INDEX idx_menu_items_sku ON menu_items(tenant_id, outlet_id, sku);
CREATE INDEX idx_sales_transactions_time ON sales_transactions(tenant_id, outlet_id, transaction_time DESC);
CREATE INDEX idx_sales_transactions_area ON sales_transactions(tenant_id, outlet_id, table_area);
CREATE INDEX idx_sales_transactions_meal ON sales_transactions(tenant_id, outlet_id, meal_period);
CREATE INDEX idx_pos_sync_status ON pos_sync_log(tenant_id, outlet_id, last_sync_time DESC);
CREATE INDEX idx_sales_trend_date ON sales_trend_snapshots(tenant_id, outlet_id, snapshot_date DESC);

-- Seed initial menu items matching prompt examples
INSERT INTO menu_items (id, tenant_id, outlet_id, sku, name, price, cost) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-BIRYANI', 'Chicken Biryani', 250.00, 120.00),
    ('d0000000-0000-0000-0000-000000000002', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-BUTTER-CHK', 'Butter Chicken', 320.00, 150.00),
    ('d0000000-0000-0000-0000-000000000003', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-PANEER-TIKKA', 'Paneer Tikka', 240.00, 90.00),
    ('d0000000-0000-0000-0000-000000000004', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-PANEER-MASALA', 'Paneer Butter Masala', 220.00, 85.00),
    ('d0000000-0000-0000-0000-000000000005', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-NAAN', 'Butter Naan', 45.00, 12.00),
    ('d0000000-0000-0000-0000-000000000006', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-MUSH-SOUP', 'Mushroom Soup', 130.00, 40.00),
    ('d0000000-0000-0000-0000-000000000007', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-VEG-SALAD', 'Veg Salad', 110.00, 30.00),
    ('d0000000-0000-0000-0000-000000000008', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-LEMON-RICE', 'Lemon Rice', 140.00, 45.00),
    ('d0000000-0000-0000-0000-000000000009', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-STEAK', 'Wagyu Ribeye Steak', 3500.00, 1200.00),
    ('d0000000-0000-0000-0000-000000000010', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-BURGER', 'Bistro Cheeseburger', 350.00, 120.00),
    ('d0000000-0000-0000-0000-000000000011', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-SALAD', 'Caesar Salad', 220.00, 70.00),
    ('d0000000-0000-0000-0000-000000000012', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-COFFEE', 'Espresso', 120.00, 25.00),
    ('d0000000-0000-0000-0000-000000000013', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-PASTA', 'Truffle Mac & Cheese', 450.00, 160.00),
    ('d0000000-0000-0000-0000-000000000014', 'tenant-hq-1', 'outlet-bistro-1', 'SKU-WATER', 'Sparkling Water', 90.00, 20.00);

-- Seed sales transactions (customer bills) across meal periods, table areas, and payment methods
INSERT INTO sales_transactions (tenant_id, outlet_id, transaction_id, menu_item_id, quantity, unit_price, total_amount, meal_period, payment_method, table_area, customer_count, is_reservation, transaction_time) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1001', 'd0000000-0000-0000-0000-000000000001', 2, 250.00, 500.00, 'Dinner', 'UPI', 'Indoor', 2, TRUE, CURRENT_TIMESTAMP - INTERVAL '2 hours'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1001', 'd0000000-0000-0000-0000-000000000005', 4, 45.00, 180.00, 'Dinner', 'UPI', 'Indoor', 2, TRUE, CURRENT_TIMESTAMP - INTERVAL '2 hours'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1002', 'd0000000-0000-0000-0000-000000000002', 3, 320.00, 960.00, 'Dinner', 'Card', 'Family Hall', 4, TRUE, CURRENT_TIMESTAMP - INTERVAL '3 hours'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1002', 'd0000000-0000-0000-0000-000000000005', 6, 45.00, 270.00, 'Dinner', 'Card', 'Family Hall', 4, TRUE, CURRENT_TIMESTAMP - INTERVAL '3 hours'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1003', 'd0000000-0000-0000-0000-000000000003', 2, 240.00, 480.00, 'Lunch', 'UPI', 'Outdoor', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '6 hours'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1003', 'd0000000-0000-0000-0000-000000000004', 2, 220.00, 440.00, 'Lunch', 'UPI', 'Outdoor', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '6 hours'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1004', 'd0000000-0000-0000-0000-000000000012', 4, 120.00, 480.00, 'Breakfast', 'Cash', 'Bar', 2, FALSE, CURRENT_TIMESTAMP - INTERVAL '10 hours'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1005', 'd0000000-0000-0000-0000-000000000006', 1, 130.00, 130.00, 'Snacks', 'UPI', 'Rooftop', 1, FALSE, CURRENT_TIMESTAMP - INTERVAL '4 hours'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1006', 'd0000000-0000-0000-0000-000000000001', 5, 250.00, 1250.00, 'Dinner', 'Card', 'Indoor', 5, TRUE, CURRENT_TIMESTAMP - INTERVAL '1 day'),
    ('tenant-hq-1', 'outlet-bistro-1', 'INV-1007', 'd0000000-0000-0000-0000-000000000009', 2, 3500.00, 7000.00, 'Dinner', 'Card', 'Rooftop', 2, TRUE, CURRENT_TIMESTAMP - INTERVAL '1 day');

-- Seed POS sync log
INSERT INTO pos_sync_log (tenant_id, outlet_id, sync_status, records_synced, error_message, last_sync_time) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'Success', 25, NULL, CURRENT_TIMESTAMP - INTERVAL '1 hour'),
    ('tenant-hq-1', 'outlet-bistro-1', 'Success', 40, NULL, CURRENT_TIMESTAMP - INTERVAL '1 day');

-- Seed historical trend snapshots for DoD, WoW, MoM trend calculations
INSERT INTO sales_trend_snapshots (tenant_id, outlet_id, snapshot_date, total_revenue, total_orders) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE - 1, 14250.00, 45),
    ('tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE - 7, 12800.00, 38),
    ('tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE - 30, 11500.00, 35);
