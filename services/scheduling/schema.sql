CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist
DROP TABLE IF EXISTS payroll_summary CASCADE;
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS shift_schedule CASCADE;
DROP TABLE IF EXISTS employee_availability CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS rosters CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- Also drop old tables for safety
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS roster_assignments CASCADE;
DROP TABLE IF EXISTS attendance_records CASCADE;

-- 1. Employees Table
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    employee_code VARCHAR(50) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'Server', 'Chef', 'Bartender', 'Host'
    phone_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Active' NOT NULL CHECK (status IN ('Active', 'Inactive')),
    
    -- Compatibility fields (for frontend and legacy queries)
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255) NOT NULL,
    weekly_hours_cap NUMERIC(6, 2) DEFAULT 40.00 NOT NULL,
    leave_balance_days NUMERIC(6, 2) DEFAULT 15.00 NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, email)
);

-- 2. Rosters Table (Schedule Containers for planning compatibility)
CREATE TABLE rosters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Draft' NOT NULL CHECK (status IN ('Draft', 'Published')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, outlet_id, start_date)
);

-- 3. Shifts Table
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    roster_id UUID REFERENCES rosters(id) ON DELETE CASCADE, -- Optional reference to roster groups
    shift_name VARCHAR(100) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    break_minutes INT DEFAULT 0 NOT NULL,
    
    -- Compatibility field
    name VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Shift Schedule Table (Roster Assignments)
CREATE TABLE shift_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    assigned_by VARCHAR(100),
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (shift_id, employee_id)
);

-- 5. Employee Availability Table
CREATE TABLE employee_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    available_from TIMESTAMP WITH TIME ZONE NOT NULL,
    available_to TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'Available' NOT NULL CHECK (status IN ('Available', 'Unavailable')),
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 6. Leave Requests Table
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(50) NOT NULL, -- e.g., 'Sick', 'Vacation', 'Unpaid', 'Personal'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'Pending' NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    approved_by VARCHAR(100),
    
    -- Compatibility fields
    type VARCHAR(50), 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 7. Attendance Table
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    check_in TIMESTAMP WITH TIME ZONE NOT NULL,
    check_out TIMESTAMP WITH TIME ZONE,
    break_minutes INT DEFAULT 0 NOT NULL,
    attendance_status VARCHAR(50) DEFAULT 'Present' NOT NULL CHECK (attendance_status IN ('Present', 'Absent', 'Late')),
    marked_by VARCHAR(100),
    
    -- Track calculations
    shift_hours NUMERIC(5, 2) DEFAULT 0.00 NOT NULL,
    working_hours NUMERIC(5, 2) DEFAULT 0.00 NOT NULL,
    overtime_hours NUMERIC(5, 2) DEFAULT 0.00 NOT NULL,
    shift_start_time TIMESTAMP WITH TIME ZONE,
    late_minutes INT DEFAULT 0 NOT NULL,
    
    -- GPS tracking
    gps_latitude NUMERIC(10, 8),
    gps_longitude NUMERIC(11, 8),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 8. Payroll Summary Table
CREATE TABLE payroll_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(50) NOT NULL,
    outlet_id VARCHAR(50) NOT NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- e.g. '2026-07'
    working_days INT DEFAULT 0 NOT NULL,
    working_hours NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    overtime_hours NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    leave_days INT DEFAULT 0 NOT NULL,
    generated_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (tenant_id, employee_id, month)
);

-- Indexes for performance and multi-tenancy constraints
CREATE INDEX idx_employees_tenant ON employees(tenant_id, outlet_id);
CREATE INDEX idx_rosters_dates ON rosters(tenant_id, outlet_id, start_date DESC);
CREATE INDEX idx_shifts_time ON shifts(tenant_id, outlet_id, start_time, end_time);
CREATE INDEX idx_shift_schedule_date ON shift_schedule(tenant_id, outlet_id, shift_date);
CREATE INDEX idx_leave_requests_dates ON leave_requests(employee_id, start_date, end_date);
CREATE INDEX idx_attendance_time ON attendance(employee_id, check_in DESC);
CREATE INDEX idx_availability_dates ON employee_availability(employee_id, available_from, available_to);

-- Seed initial employees
INSERT INTO employees (id, tenant_id, outlet_id, employee_code, full_name, first_name, last_name, email, phone_number, role, weekly_hours_cap, leave_balance_days) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'tenant-hq-1', 'outlet-bistro-1', 'EMP-001', 'Alice Chef', 'Alice', 'Chef', 'alice@dineiq.com', '555-0101', 'Chef', 40.00, 15.00),
    ('e0000000-0000-0000-0000-000000000002', 'tenant-hq-1', 'outlet-bistro-1', 'EMP-002', 'Bob Server', 'Bob', 'Server', 'bob@dineiq.com', '555-0102', 'Server', 30.00, 12.00),
    ('e0000000-0000-0000-0000-000000000003', 'tenant-hq-1', 'outlet-bistro-1', 'EMP-003', 'Charlie Bartender', 'Charlie', 'Bartender', 'charlie@dineiq.com', '555-0103', 'Bartender', 40.00, 10.00),
    ('e0000000-0000-0000-0000-000000000004', 'tenant-hq-1', 'outlet-bistro-1', 'EMP-004', 'Diana Host', 'Diana', 'Host', 'diana@dineiq.com', '555-0104', 'Host', 35.00, 14.00),
    ('e0000000-0000-0000-0000-000000000005', 'tenant-hq-1', 'outlet-bistro-1', 'EMP-005', 'Ethan Server', 'Ethan', 'Server', 'ethan@dineiq.com', '555-0105', 'Server', 40.00, 8.00);

-- Seed rosters
INSERT INTO rosters (id, tenant_id, outlet_id, start_date, end_date, status) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE - 1, CURRENT_DATE + 6, 'Published');

-- Seed shifts for the roster
INSERT INTO shifts (id, tenant_id, outlet_id, roster_id, shift_name, name, start_time, end_time, break_minutes) VALUES
    ('f0000000-0000-0000-0000-000000000101', 'tenant-hq-1', 'outlet-bistro-1', 'f0000000-0000-0000-0000-000000000001', 'Morning Chef Shift', 'Morning Chef Shift', CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '6 hours', 60),
    ('f0000000-0000-0000-0000-000000000102', 'tenant-hq-1', 'outlet-bistro-1', 'f0000000-0000-0000-0000-000000000001', 'Evening Server Shift', 'Evening Server Shift', CURRENT_TIMESTAMP + INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '10 hours', 60),
    ('f0000000-0000-0000-0000-000000000103', 'tenant-hq-1', 'outlet-bistro-1', 'f0000000-0000-0000-0000-000000000001', 'Night Bartender Shift', 'Night Bartender Shift', CURRENT_TIMESTAMP + INTERVAL '4 hours', CURRENT_TIMESTAMP + INTERVAL '12 hours', 30);

-- Seed shift schedules
INSERT INTO shift_schedule (shift_id, employee_id, tenant_id, outlet_id, shift_date, assigned_by) VALUES
    ('f0000000-0000-0000-0000-000000000101', 'e0000000-0000-0000-0000-000000000001', 'tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE, 'Manager'),
    ('f0000000-0000-0000-0000-000000000102', 'e0000000-0000-0000-0000-000000000002', 'tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE, 'Manager'),
    ('f0000000-0000-0000-0000-000000000103', 'e0000000-0000-0000-0000-000000000003', 'tenant-hq-1', 'outlet-bistro-1', CURRENT_DATE, 'Manager');

-- Seed leave requests
INSERT INTO leave_requests (tenant_id, outlet_id, employee_id, start_date, end_date, leave_type, type, status, reason) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000002', CURRENT_DATE + 5, CURRENT_DATE + 7, 'Vacation', 'Vacation', 'Approved', 'Family vacation'),
    ('tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000005', CURRENT_DATE + 2, CURRENT_DATE + 3, 'Sick', 'Sick', 'Pending', 'Flu symptoms');

-- Seed attendance logs
-- Alice checked in 2 hours ago, check out is null (Present)
INSERT INTO attendance (tenant_id, outlet_id, employee_id, attendance_date, check_in, check_out, break_minutes, attendance_status, working_hours, overtime_hours, shift_hours, shift_start_time, late_minutes) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000001', CURRENT_DATE, CURRENT_TIMESTAMP - INTERVAL '2 hours', NULL, 0, 'Present', 0.00, 0.00, 8.00, CURRENT_TIMESTAMP - INTERVAL '2 hours', 0);

-- Bob completed shift yesterday
INSERT INTO attendance (tenant_id, outlet_id, employee_id, attendance_date, check_in, check_out, break_minutes, attendance_status, working_hours, overtime_hours, shift_hours, shift_start_time, late_minutes) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000002', CURRENT_DATE - 1, CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '12 hours', CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '20 hours', 60, 'Present', 7.00, 0.00, 8.00, CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '12 hours', 0);

-- Charlie completed shift yesterday (arrived 1 hour late)
INSERT INTO attendance (tenant_id, outlet_id, employee_id, attendance_date, check_in, check_out, break_minutes, attendance_status, working_hours, overtime_hours, shift_hours, shift_start_time, late_minutes) VALUES
    ('tenant-hq-1', 'outlet-bistro-1', 'e0000000-0000-0000-0000-000000000003', CURRENT_DATE - 1, CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '16 hours', CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '23 hours', 30, 'Late', 6.50, 0.00, 8.00, CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '15 hours', 60);
