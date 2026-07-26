CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist
DROP TABLE IF EXISTS weekly_feedback_summary CASCADE;
DROP TABLE IF EXISTS feedback_category_mapping CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS customer_feedback CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS alert_log CASCADE;

-- Legacy tables drop
DROP TABLE IF EXISTS satisfaction_snapshots CASCADE;
DROP TABLE IF EXISTS review_themes CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;

-- 1. Customers Table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Customer Feedback Table
CREATE TABLE customer_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    review_text TEXT,
    rating NUMERIC(3, 2) NOT NULL CHECK (rating >= 1.00 AND rating <= 5.00),
    source VARCHAR(50) NOT NULL CHECK (source IN ('Google', 'Zomato', 'Swiggy', 'Kaggle', 'CSV', 'Seeded')),
    sentiment VARCHAR(50) DEFAULT 'NEUTRAL' NOT NULL CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
    confidence_score NUMERIC(4, 3) DEFAULT 1.000 NOT NULL,
    triage_status VARCHAR(50) DEFAULT 'PENDING' NOT NULL CHECK (triage_status IN ('PENDING', 'PROCESSED', 'FAILED')),
    review_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Categories Table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(100) UNIQUE NOT NULL
);

-- 4. Feedback Category Mapping Table
CREATE TABLE feedback_category_mapping (
    feedback_id UUID NOT NULL REFERENCES customer_feedback(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (feedback_id, category_id)
);

-- 5. Weekly Feedback Summary Table
CREATE TABLE weekly_feedback_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    total_reviews INT DEFAULT 0 NOT NULL,
    positive_reviews INT DEFAULT 0 NOT NULL,
    neutral_reviews INT DEFAULT 0 NOT NULL,
    negative_reviews INT DEFAULT 0 NOT NULL,
    average_rating NUMERIC(4, 2) DEFAULT 0.00 NOT NULL,
    top_category VARCHAR(100),
    trending_metric VARCHAR(255),
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, outlet_id, week_start)
);

-- 6. Alert Log Table (negative reviews spikes tracking)
CREATE TABLE alert_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    alert_type VARCHAR(100) NOT NULL, -- 'NEGATIVE_SPIKE'
    message TEXT NOT NULL,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cooldown_until TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_customers_tenant ON customers(tenant_id, outlet_id);
CREATE INDEX idx_feedback_filter ON customer_feedback(tenant_id, outlet_id, review_date DESC, sentiment);
CREATE INDEX idx_feedback_categories ON feedback_category_mapping(category_id);
CREATE INDEX idx_weekly_summary_dates ON weekly_feedback_summary(tenant_id, outlet_id, week_start DESC);

-- Seed Categories
INSERT INTO categories (id, category_name) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'Food'),
    ('c0000000-0000-0000-0000-000000000002', 'Service'),
    ('c0000000-0000-0000-0000-000000000003', 'Ambience'),
    ('c0000000-0000-0000-0000-000000000004', 'Delivery'),
    ('c0000000-0000-0000-0000-000000000005', 'Value');

-- Seed Customers
INSERT INTO customers (id, tenant_id, outlet_id, name, email, phone) VALUES
    ('e0000000-0000-0000-0000-000000000901', 'tenant-hq-1', 'outlet-bistro-1', 'Rajesh Kumar', 'rajesh@dineiq.com', '555-0901'),
    ('e0000000-0000-0000-0000-000000000902', 'tenant-hq-1', 'outlet-bistro-1', 'Aisha Khan', 'aisha@dineiq.com', '555-0902'),
    ('e0000000-0000-0000-0000-000000000903', 'tenant-hq-1', 'outlet-bistro-1', 'Vikram Singh', 'vikram@dineiq.com', '555-0903'),
    ('e0000000-0000-0000-0000-000000000904', 'tenant-hq-1', 'outlet-bistro-1', 'Sneha Patel', 'sneha@dineiq.com', '555-0904');

-- Seed customer feedback (formerly seeded reviews)
INSERT INTO customer_feedback (id, tenant_id, outlet_id, customer_id, review_text, rating, source, sentiment, confidence_score, triage_status, review_date) VALUES
    ('123e4567-e89b-12d3-a456-426614174001', 'tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000901', 'Excellent Wagyu steak, fast service and clean patio!', 5.00, 'Google', 'POSITIVE', 0.998, 'PROCESSED', CURRENT_TIMESTAMP - INTERVAL '1 day'),
    ('123e4567-e89b-12d3-a456-426614174002', 'tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000902', 'The Cheeseburger was cold, and service took 45 minutes.', 2.00, 'Zomato', 'NEGATIVE', 0.987, 'PROCESSED', CURRENT_TIMESTAMP - INTERVAL '2 days'),
    ('123e4567-e89b-12d3-a456-426614174003', 'tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000903', 'Good salad and espresso. Quick delivery.', 4.00, 'Swiggy', 'POSITIVE', 0.965, 'PROCESSED', CURRENT_TIMESTAMP - INTERVAL '3 days'),
    ('123e4567-e89b-12d3-a456-426614174004', 'tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000904', 'Amazing ambiance and wonderful customer support by staff!', 5.00, 'Google', 'POSITIVE', 0.997, 'PROCESSED', CURRENT_TIMESTAMP - INTERVAL '4 hours'),
    ('123e4567-e89b-12d3-a456-426614174005', 'tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000901', 'Very slow service, waited over an hour for pasta.', 1.00, 'Zomato', 'NEGATIVE', 0.999, 'PROCESSED', CURRENT_TIMESTAMP - INTERVAL '6 hours');

-- Seed category mappings
INSERT INTO feedback_category_mapping (feedback_id, category_id) VALUES
    ('123e4567-e89b-12d3-a456-426614174001', 'c0000000-0000-0000-0000-000000000001'), -- Food
    ('123e4567-e89b-12d3-a456-426614174001', 'c0000000-0000-0000-0000-000000000002'), -- Service
    ('123e4567-e89b-12d3-a456-426614174002', 'c0000000-0000-0000-0000-000000000001'), -- Food
    ('123e4567-e89b-12d3-a456-426614174002', 'c0000000-0000-0000-0000-000000000002'), -- Service
    ('123e4567-e89b-12d3-a456-426614174003', 'c0000000-0000-0000-0000-000000000001'), -- Food
    ('123e4567-e89b-12d3-a456-426614174003', 'c0000000-0000-0000-0000-000000000004'), -- Delivery
    ('123e4567-e89b-12d3-a456-426614174004', 'c0000000-0000-0000-0000-000000000003'), -- Ambience
    ('123e4567-e89b-12d3-a456-426614174004', 'c0000000-0000-0000-0000-000000000002'), -- Service
    ('123e4567-e89b-12d3-a456-426614174005', 'c0000000-0000-0000-0000-000000000002'); -- Service

-- Seed weekly feedback summaries
INSERT INTO weekly_feedback_summary (tenant_id, outlet_id, week_start, week_end, total_reviews, positive_reviews, neutral_reviews, negative_reviews, average_rating, top_category, trending_metric) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '8 days', 10, 6, 2, 2, 4.10, 'Food', '+8% review volume'),
    ('tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '1 day', 15, 11, 2, 2, 4.30, 'Food', '90% Positive Sentiment on Service');
