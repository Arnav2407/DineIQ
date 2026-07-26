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

// Middleware: Authenticate and Decode JWT
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
    console.error('Scheduling Service JWT failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'scheduling-service' });
});

// Create Employee (Staff) Endpoint
app.post('/api/v1/scheduling/staff', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, first_name, last_name, email, phone, role, weekly_hours_cap, leave_balance_days } = req.body;
  try {
    const fullName = req.body.full_name || `${first_name} ${last_name}`.trim();
    const employeeCode = req.body.employee_code || 'EMP-' + Math.floor(100000 + Math.random() * 900000);
    const phoneNumber = req.body.phone_number || phone;
    const status = req.body.status || 'Active';

    const result = await pool.query(
      `INSERT INTO employees (tenant_id, outlet_id, employee_code, full_name, role, phone_number, status, first_name, last_name, email, weekly_hours_cap, leave_balance_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [tenant_id, outlet_id, employeeCode, fullName, role, phoneNumber, status, first_name, last_name, email, weekly_hours_cap || 40.00, leave_balance_days || 15.00]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/v1/scheduling/staff (lists all employees)
app.get('/api/v1/scheduling/staff', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id } = req.query;
  if (!tenant_id || !outlet_id) {
    return res.status(400).json({ error: 'tenant_id and outlet_id are required' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM employees WHERE tenant_id = $1 AND outlet_id = $2 ORDER BY first_name, last_name',
      [tenant_id, outlet_id]
    );
    return res.status(200).json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- POST /api/v1/rosters (Roster creation with Conflict Detection) ---
app.post('/api/v1/rosters', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, start_date, end_date, shifts } = req.body;

  if (!tenant_id || !outlet_id || !start_date || !end_date || !shifts) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, start_date, end_date, and shifts are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Conflict Detection Engine
    for (const shift of shifts) {
      const shiftStart = new Date(shift.start_time);
      const shiftEnd = new Date(shift.end_time);
      const shiftDateStr = shiftStart.toISOString().split('T')[0];

      for (const staffId of shift.assignments || []) {
        // A. Check for concurrent approved leave requests
        const leaveCheck = await client.query(
          `SELECT id, leave_type FROM leave_requests 
           WHERE employee_id = $1 AND status = 'Approved' 
             AND $2::date >= start_date AND $2::date <= end_date`,
          [staffId, shiftDateStr]
        );

        if (leaveCheck.rows.length > 0) {
          const staffNameRes = await client.query('SELECT first_name, last_name FROM employees WHERE id = $1', [staffId]);
          const staff = staffNameRes.rows[0] || { first_name: 'Employee', last_name: '' };
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'SCHEDULE_CONFLICT',
            message: `Conflict detected: ${staff.first_name} ${staff.last_name} is on approved leave (${leaveCheck.rows[0].leave_type}) on ${shiftDateStr}.`,
            staff_id: staffId,
            date: shiftDateStr,
            conflict_type: 'LEAVE'
          });
        }

        // B. Check for concurrent overlapping shifts for the same employee
        const overlapCheck = await client.query(
          `SELECT s.id, s.shift_name, s.start_time, s.end_time 
           FROM shift_schedule ss
           JOIN shifts s ON ss.shift_id = s.id
           WHERE ss.employee_id = $1 
             AND s.start_time < $2 AND s.end_time > $3`,
          [staffId, shiftEnd, shiftStart]
        );

        if (overlapCheck.rows.length > 0) {
          const staffNameRes = await client.query('SELECT first_name, last_name FROM employees WHERE id = $1', [staffId]);
          const staff = staffNameRes.rows[0] || { first_name: 'Employee', last_name: '' };
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'SCHEDULE_CONFLICT',
            message: `Conflict detected: ${staff.first_name} ${staff.last_name} is already assigned to overlapping shift '${overlapCheck.rows[0].shift_name}'.`,
            staff_id: staffId,
            date: shiftDateStr,
            conflict_type: 'OVERLAPPING_SHIFT'
          });
        }
      }
    }

    // 2. Commit Roster
    const rosterRes = await client.query(
      `INSERT INTO rosters (tenant_id, outlet_id, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, 'Published') RETURNING id`,
      [tenant_id, outlet_id, start_date, end_date]
    );
    const rosterId = rosterRes.rows[0].id;

    for (const shift of shifts) {
      const shiftRes = await client.query(
        `INSERT INTO shifts (tenant_id, outlet_id, roster_id, shift_name, name, start_time, end_time, break_minutes)
         VALUES ($1, $2, $3, $4, $4, $5, $6, $7) RETURNING id`,
        [tenant_id, outlet_id, rosterId, shift.name || shift.shift_name || 'Morning Shift', shift.start_time, shift.end_time, shift.break_minutes || 0]
      );
      const shiftId = shiftRes.rows[0].id;

      for (const staffId of shift.assignments || []) {
        const shiftDateStr = new Date(shift.start_time).toISOString().split('T')[0];
        await client.query(
          `INSERT INTO shift_schedule (tenant_id, outlet_id, shift_id, employee_id, shift_date, assigned_by)
           VALUES ($1, $2, $3, $4, $5, 'Manager')`,
          [tenant_id, outlet_id, shiftId, staffId, shiftDateStr]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({ status: 'SUCCESS', roster_id: rosterId, message: 'Roster saved successfully with no conflicts.' });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Failed to create roster:', error);
    return res.status(500).json({ error: 'Failed to create roster due to database error' });
  } finally {
    client.release();
  }
});

// GET /api/v1/rosters (lists rosters and shifts)
app.get('/api/v1/rosters', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id } = req.query;
  if (!tenant_id || !outlet_id) {
    return res.status(400).json({ error: 'tenant_id and outlet_id are required' });
  }
  try {
    const rostersRes = await pool.query(
      'SELECT * FROM rosters WHERE tenant_id = $1 AND outlet_id = $2 ORDER BY start_date DESC',
      [tenant_id, outlet_id]
    );
    
    const rosters = [];
    for (const roster of rostersRes.rows) {
      const shiftsRes = await pool.query(
        'SELECT * FROM shifts WHERE roster_id = $1 ORDER BY start_time ASC',
        [roster.id]
      );
      
      const shifts = [];
      for (const shift of shiftsRes.rows) {
        const assignmentsRes = await pool.query(
          `SELECT ss.employee_id as staff_id, emp.first_name, emp.last_name 
           FROM shift_schedule ss
           JOIN employees emp ON ss.employee_id = emp.id
           WHERE ss.shift_id = $1`,
          [shift.id]
        );
        
        shifts.push({
          ...shift,
          assignments: assignmentsRes.rows.map((a: any) => ({
            id: a.staff_id,
            first_name: a.first_name,
            last_name: a.last_name
          }))
        });
      }
      
      rosters.push({
        ...roster,
        shifts
      });
    }
    
    return res.status(200).json(rosters);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- POST /api/v1/attendance/clock-in ---
app.post('/api/v1/attendance/clock-in', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, staff_id, employee_id, device_timestamp, gps_latitude, gps_longitude } = req.body;
  const empId = employee_id || staff_id;

  if (!tenant_id || !outlet_id || !empId || !device_timestamp) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, employee_id/staff_id, and device_timestamp are required' });
  }

  try {
    const clockTime = new Date(device_timestamp);
    const todayStr = clockTime.toISOString().split('T')[0];

    // Find assigned shift matching today's date
    const shiftRes = await pool.query(
      `SELECT s.id, s.start_time, s.end_time, s.break_minutes 
       FROM shift_schedule ss
       JOIN shifts s ON ss.shift_id = s.id
       WHERE ss.employee_id = $1 AND ss.shift_date = $2::date`,
      [empId, todayStr]
    );

    let shiftId = null;
    let lateArrival = false;
    let lateMinutes = 0;
    let shiftHours = 0.00;
    let shiftStartTime = null;
    let outOfWindow = false;

    if (shiftRes.rows.length > 0) {
      const shift = shiftRes.rows[0];
      shiftId = shift.id;
      shiftStartTime = new Date(shift.start_time);
      const shiftEndTime = new Date(shift.end_time);

      shiftHours = Math.max(0, (shiftEndTime.getTime() - shiftStartTime.getTime()) / (1000 * 60 * 60) - (shift.break_minutes / 60.0));

      // drift in minutes
      const driftMinutes = (clockTime.getTime() - shiftStartTime.getTime()) / (1000 * 60);

      if (driftMinutes > 15) {
        lateArrival = true;
        lateMinutes = Math.round(driftMinutes);
      }
      if (Math.abs(driftMinutes) > 60) {
        outOfWindow = true;
      }
    } else {
      outOfWindow = true;
    }

    // Insert attendance record
    const result = await pool.query(
      `INSERT INTO attendance (tenant_id, outlet_id, employee_id, attendance_date, check_in, check_out, break_minutes, attendance_status, marked_by, shift_hours, shift_start_time, late_minutes, gps_latitude, gps_longitude)
       VALUES ($1, $2, $3, $4::date, $5, NULL, 0, $6, 'Self', $7, $8, $9, $10, $11) RETURNING *`,
      [tenant_id, outlet_id, empId, todayStr, clockTime, lateArrival ? 'Late' : 'Present', shiftHours, shiftStartTime, lateMinutes, gps_latitude, gps_longitude]
    );

    // Fetch employee name for notification
    pool.query('SELECT first_name, last_name FROM employees WHERE id = $1', [empId])
      .then(empRes => {
        const empName = empRes.rows[0] ? `${empRes.rows[0].first_name} ${empRes.rows[0].last_name}` : `ID: ${empId}`;
        fetch('http://reservation-service:3003/api/v1/reservations/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id,
            outlet_id,
            type: 'Employee Checked In',
            recipient: 'Manager',
            message: `Employee ${empName} has checked in (clocked in) at ${clockTime.toLocaleTimeString()}.`
          })
        }).catch((err: any) => console.error('Failed to post clock-in notification:', err.message));
      })
      .catch(err => console.error('Failed to fetch employee name for notification:', err));

    const responseRecord = {
      ...result.rows[0],
      staff_id: result.rows[0].employee_id,
      late_arrival: lateArrival,
      out_of_window: outOfWindow
    };

    return res.status(200).json(responseRecord);

  } catch (error: any) {
    console.error('Clock-in error:', error);
    return res.status(500).json({ error: 'Database error logging clock-in' });
  }
});

// --- POST /api/v1/attendance/clock-out ---
app.post('/api/v1/attendance/clock-out', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, staff_id, employee_id, device_timestamp, gps_latitude, gps_longitude } = req.body;
  const empId = employee_id || staff_id;

  if (!tenant_id || !outlet_id || !empId || !device_timestamp) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, employee_id/staff_id, and device_timestamp are required' });
  }

  try {
    const clockOutTime = new Date(device_timestamp);

    // Find active attendance record
    const activeRec = await pool.query(
      `SELECT * FROM attendance 
       WHERE employee_id = $1 AND check_out IS NULL 
       ORDER BY check_in DESC LIMIT 1`,
      [empId]
    );

    if (activeRec.rows.length === 0) {
      return res.status(404).json({ error: 'Active clock-in session not found for this employee.' });
    }

    const record = activeRec.rows[0];
    const checkInTime = new Date(record.check_in);
    
    // Formula: Working Hours = (Check-Out - Check-In) - Break Time
    const rawWorkingHours = (clockOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
    const breakHours = (record.break_minutes || 0) / 60.0;
    const workingHours = Math.max(0, rawWorkingHours - breakHours);

    // Formula: Overtime = Working Hours - Shift Hours
    const shiftHours = parseFloat(record.shift_hours || '0.00');
    const overtimeHours = Math.max(0, workingHours - shiftHours);

    // Update attendance record
    const result = await pool.query(
      `UPDATE attendance 
       SET check_out = $1, working_hours = $2, overtime_hours = $3, gps_latitude = COALESCE($4, gps_latitude), gps_longitude = COALESCE($5, gps_longitude) 
       WHERE id = $6 RETURNING *`,
      [clockOutTime, workingHours, overtimeHours, gps_latitude, gps_longitude, record.id]
    );

    const responseRecord = {
      ...result.rows[0],
      staff_id: result.rows[0].employee_id,
      out_of_window: false
    };

    return res.status(200).json(responseRecord);

  } catch (error: any) {
    console.error('Clock-out error:', error);
    return res.status(500).json({ error: 'Database error logging clock-out' });
  }
});

// --- POST /api/v1/attendance/manual (Manager Web-Marked Attendance) ---
app.post('/api/v1/attendance/manual', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, employee_id, attendance_date, check_in, check_out, break_minutes, attendance_status, marked_by } = req.body;

  if (!tenant_id || !outlet_id || !employee_id || !attendance_date || !check_in) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, employee_id, attendance_date, and check_in are required' });
  }

  try {
    const checkInTime = new Date(check_in);
    const checkOutTime = check_out ? new Date(check_out) : null;
    const breakMins = parseInt(break_minutes || 0);

    // Retrieve shift details if employee scheduled
    const shiftRes = await pool.query(
      `SELECT s.start_time, s.end_time, s.break_minutes 
       FROM shift_schedule ss
       JOIN shifts s ON ss.shift_id = s.id
       WHERE ss.employee_id = $1 AND ss.shift_date = $2::date`,
      [employee_id, attendance_date]
    );

    let shiftHours = 0.00;
    let shiftStartTime = null;
    let lateMinutes = 0;

    if (shiftRes.rows.length > 0) {
      const shift = shiftRes.rows[0];
      shiftStartTime = new Date(shift.start_time);
      const shiftEndTime = new Date(shift.end_time);
      shiftHours = Math.max(0, (shiftEndTime.getTime() - shiftStartTime.getTime()) / (1000 * 60 * 60) - (shift.break_minutes / 60.0));

      const driftMinutes = (checkInTime.getTime() - shiftStartTime.getTime()) / (1000 * 60);
      if (driftMinutes > 15) {
        lateMinutes = Math.round(driftMinutes);
      }
    }

    let workingHours = 0.00;
    let overtimeHours = 0.00;

    if (checkOutTime) {
      const rawWorkingHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
      workingHours = Math.max(0, rawWorkingHours - (breakMins / 60.0));
      overtimeHours = Math.max(0, workingHours - shiftHours);
    }

    const result = await pool.query(
      `INSERT INTO attendance (tenant_id, outlet_id, employee_id, attendance_date, check_in, check_out, break_minutes, attendance_status, marked_by, working_hours, overtime_hours, shift_hours, shift_start_time, late_minutes)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [tenant_id, outlet_id, employee_id, attendance_date, checkInTime, checkOutTime, breakMins, attendance_status || 'Present', marked_by || 'Manager', workingHours, overtimeHours, shiftHours, shiftStartTime, lateMinutes]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Manual attendance error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- GET /api/v1/attendance (Fetch attendance records for dashboard) ---
app.get('/api/v1/attendance', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id } = req.query;
  if (!tenant_id || !outlet_id) {
    return res.status(400).json({ error: 'tenant_id and outlet_id are required' });
  }
  try {
    const result = await pool.query(
      `SELECT att.*, emp.full_name, emp.first_name, emp.last_name, emp.role 
       FROM attendance att
       JOIN employees emp ON att.employee_id = emp.id
       WHERE att.tenant_id = $1 AND att.outlet_id = $2
       ORDER BY att.attendance_date DESC, att.check_in DESC`,
      [tenant_id, outlet_id]
    );
    return res.status(200).json(result.rows);
  } catch (error: any) {
    console.error('Get attendance error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- POST /api/v1/leave-requests ---
app.post('/api/v1/leave-requests', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, staff_id, employee_id, start_date, end_date, type, leave_type, reason } = req.body;
  const empId = employee_id || staff_id;
  const lType = leave_type || type;

  if (!tenant_id || !outlet_id || !empId || !start_date || !end_date || !lType) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, employee_id, start_date, end_date, and leave_type are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO leave_requests (tenant_id, outlet_id, employee_id, start_date, end_date, leave_type, type, status, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $6, 'Pending', $7) RETURNING *`,
      [tenant_id, outlet_id, empId, start_date, end_date, lType, reason || '']
    );
    
    const responseRecord = {
      ...result.rows[0],
      staff_id: result.rows[0].employee_id
    };
    return res.status(201).json(responseRecord);
  } catch (error: any) {
    console.error('Leave request error:', error);
    return res.status(500).json({ error: 'Database error creating leave request' });
  }
});

// --- GET /api/v1/leave-requests ---
app.get('/api/v1/leave-requests', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id } = req.query;
  if (!tenant_id || !outlet_id) {
    return res.status(400).json({ error: 'tenant_id and outlet_id are required' });
  }
  try {
    const result = await pool.query(
      `SELECT lr.*, lr.employee_id as staff_id, emp.first_name, emp.last_name, emp.role 
       FROM leave_requests lr
       JOIN employees emp ON lr.employee_id = emp.id
       WHERE lr.tenant_id = $1 AND lr.outlet_id = $2
       ORDER BY lr.created_at DESC`,
      [tenant_id, outlet_id]
    );
    return res.status(200).json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// --- PATCH /api/v1/leave-requests/:id ---
app.patch('/api/v1/leave-requests/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, approved_by } = req.body;

  if (!status || !['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Valid status (Approved or Rejected) is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch leave request
    const leaveRes = await client.query(
      `SELECT tenant_id, outlet_id, employee_id, start_date, end_date, status, leave_type 
       FROM leave_requests WHERE id = $1`,
      [id]
    );

    if (leaveRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const leave = leaveRes.rows[0];

    if (leave.status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Leave request has already been ${leave.status}` });
    }

    // 2. Perform actions on approval
    if (status === 'Approved') {
      const startDate = new Date(leave.start_date);
      const endDate = new Date(leave.end_date);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // Deduct days from employee balance
      const balanceCheck = await client.query('SELECT leave_balance_days FROM employees WHERE id = $1', [leave.employee_id]);
      if (balanceCheck.rows.length > 0) {
        const newBalance = parseFloat(balanceCheck.rows[0].leave_balance_days) - diffDays;
        if (newBalance < 0 && leave.leave_type === 'Vacation') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Insufficient leave balance. Remaining: ${balanceCheck.rows[0].leave_balance_days} days.` });
        }

        await client.query(
          `UPDATE employees SET leave_balance_days = $1, updated_at = NOW() WHERE id = $2`,
          [newBalance, leave.employee_id]
        );
      }

      // Automatically remove overlapping roster assignments
      await client.query(
        `DELETE FROM shift_schedule 
         WHERE employee_id = $1 AND shift_id IN (
           SELECT id FROM shifts 
           WHERE start_time::date >= $2::date AND start_time::date <= $3::date
         )`,
        [leave.employee_id, leave.start_date, leave.end_date]
      );
    }

    // 3. Update Leave Request Status
    const result = await client.query(
      `UPDATE leave_requests SET status = $1, approved_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, approved_by || 'Manager', id]
    );

    await client.query('COMMIT');
    
    const responseRecord = {
      ...result.rows[0],
      staff_id: result.rows[0].employee_id
    };
    return res.status(200).json(responseRecord);

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Leave approval error:', error);
    return res.status(500).json({ error: 'Database error updating leave request' });
  } finally {
    client.release();
  }
});

// --- POST /api/v1/scheduling/availability ---
app.post('/api/v1/scheduling/availability', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, employee_id, available_from, available_to, status, remarks } = req.body;

  if (!tenant_id || !outlet_id || !employee_id || !available_from || !available_to) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, employee_id, available_from, and available_to are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO employee_availability (tenant_id, outlet_id, employee_id, available_from, available_to, status, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tenant_id, outlet_id, employee_id, available_from, available_to, status || 'Available', remarks || '']
    );
    return res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Availability create error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- GET /api/v1/scheduling/availability ---
app.get('/api/v1/scheduling/availability', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id } = req.query;
  if (!tenant_id || !outlet_id) {
    return res.status(400).json({ error: 'tenant_id and outlet_id are required' });
  }

  try {
    const result = await pool.query(
      `SELECT ea.*, emp.full_name, emp.first_name, emp.last_name, emp.role 
       FROM employee_availability ea
       JOIN employees emp ON ea.employee_id = emp.id
       WHERE ea.tenant_id = $1 AND ea.outlet_id = $2
       ORDER BY ea.available_from ASC`,
      [tenant_id, outlet_id]
    );
    return res.status(200).json(result.rows);
  } catch (error: any) {
    console.error('Get availability error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- POST /api/v1/payroll/summary (Generate Payroll Summaries) ---
app.post('/api/v1/payroll/summary', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, month } = req.body;

  if (!tenant_id || !outlet_id || !month) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, and month are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch all employees in this tenant/outlet
    const empRes = await client.query(
      `SELECT id FROM employees WHERE tenant_id = $1 AND outlet_id = $2`,
      [tenant_id, outlet_id]
    );

    const summaries = [];
    const yearMonth = month; // 'YYYY-MM'

    for (const emp of empRes.rows) {
      const employeeId = emp.id;

      // 1. Calculate working days and actual working hours + overtime hours for this month
      const attendanceRes = await client.query(
        `SELECT COUNT(DISTINCT attendance_date) as working_days, 
                COALESCE(SUM(working_hours), 0) as working_hours,
                COALESCE(SUM(overtime_hours), 0) as overtime_hours
         FROM attendance 
         WHERE employee_id = $1 
           AND TO_CHAR(attendance_date, 'YYYY-MM') = $2`,
        [employeeId, yearMonth]
      );

      const attStats = attendanceRes.rows[0];

      // 2. Calculate approved leave days for this month
      const leaveRes = await client.query(
        `SELECT start_date, end_date FROM leave_requests 
         WHERE employee_id = $1 AND status = 'Approved' 
           AND (TO_CHAR(start_date, 'YYYY-MM') = $2 OR TO_CHAR(end_date, 'YYYY-MM') = $2)`,
        [employeeId, yearMonth]
      );

      let leaveDays = 0;
      for (const leave of leaveRes.rows) {
        const start = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        
        let current = new Date(start);
        while (current <= end) {
          const currentYearMonth = current.toISOString().substring(0, 7);
          if (currentYearMonth === yearMonth) {
            leaveDays++;
          }
          current.setDate(current.getDate() + 1);
        }
      }

      // 3. Upsert into payroll_summary
      const summaryRes = await client.query(
        `INSERT INTO payroll_summary (tenant_id, outlet_id, employee_id, month, working_days, working_hours, overtime_hours, leave_days, generated_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (tenant_id, employee_id, month) 
         DO UPDATE SET 
            working_days = EXCLUDED.working_days,
            working_hours = EXCLUDED.working_hours,
            overtime_hours = EXCLUDED.overtime_hours,
            leave_days = EXCLUDED.leave_days,
            generated_on = NOW()
         RETURNING *`,
        [tenant_id, outlet_id, employeeId, yearMonth, parseInt(attStats.working_days || 0), parseFloat(attStats.working_hours || 0), parseFloat(attStats.overtime_hours || 0), leaveDays]
      );

      summaries.push(summaryRes.rows[0]);
    }

    await client.query('COMMIT');
    return res.status(200).json(summaries);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Payroll summary generation error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// --- GET /api/v1/payroll/summary (Fetch compiled payroll summaries) ---
app.get('/api/v1/payroll/summary', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, month } = req.query;

  if (!tenant_id || !outlet_id || !month) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, and month are required' });
  }

  try {
    const result = await pool.query(
      `SELECT ps.*, emp.full_name, emp.first_name, emp.last_name, emp.role, emp.employee_code 
       FROM payroll_summary ps
       JOIN employees emp ON ps.employee_id = emp.id
       WHERE ps.tenant_id = $1 AND ps.outlet_id = $2 AND ps.month = $3
       ORDER BY emp.full_name ASC`,
      [tenant_id, outlet_id, month]
    );
    return res.status(200).json(result.rows);
  } catch (error: any) {
    console.error('Get payroll summary error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- GET /api/v1/payroll/export (CSV export compiler) ---
app.get('/api/v1/payroll/export', async (req: Request, res: Response) => {
  const { tenant_id, outlet_id, start_date, end_date } = req.query;

  if (!tenant_id || !outlet_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'tenant_id, outlet_id, start_date, and end_date are required parameters' });
  }

  try {
    // Compile scheduled vs actual hours, overtime (hours over cap), and leave days per staff member
    const query = `
      SELECT 
        st.id as staff_id,
        st.full_name,
        st.first_name,
        st.last_name,
        st.role,
        st.weekly_hours_cap,
        COALESCE((
          SELECT SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time))) / 3600
          FROM shift_schedule ss
          JOIN shifts s ON ss.shift_id = s.id
          WHERE ss.employee_id = st.id AND s.start_time >= $3::timestamp AND s.start_time <= $4::timestamp
        ), 0) as scheduled_hours,
        COALESCE((
          SELECT SUM(working_hours)
          FROM attendance ar
          WHERE ar.employee_id = st.id AND ar.check_in >= $3::timestamp AND ar.check_in <= $4::timestamp AND ar.check_out IS NOT NULL
        ), 0) as actual_hours,
        COALESCE((
          SELECT SUM(end_date - start_date + 1)
          FROM leave_requests lr
          WHERE lr.employee_id = st.id AND lr.status = 'Approved' 
            AND lr.start_date >= $3::date AND lr.start_date <= $4::date
        ), 0) as leave_days
      FROM employees st
      WHERE st.tenant_id = $1 AND st.outlet_id = $2
    `;

    const payrollRes = await pool.query(query, [tenant_id, outlet_id, start_date, end_date]);

    // Build CSV Content
    let csvContent = 'Staff ID,Full Name,Role,Weekly Cap,Scheduled Hours,Actual Hours,Overtime Hours,Approved Leave Days\n';

    payrollRes.rows.forEach(row => {
      const scheduled = parseFloat(row.scheduled_hours).toFixed(2);
      const actual = parseFloat(row.actual_hours).toFixed(2);
      const cap = parseFloat(row.weekly_hours_cap);
      
      // Overtime calculation: actual hours worked past cap
      let overtime = 0.00;
      if (parseFloat(actual) > cap) {
        overtime = parseFloat(actual) - cap;
      }

      csvContent += `"${row.staff_id}","${row.full_name || (row.first_name + ' ' + row.last_name)}","${row.role}",${cap},${scheduled},${actual},${overtime.toFixed(2)},${row.leave_days}\n`;
    });

    // Set Response Headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_export_${start_date}_to_${end_date}.csv`);
    return res.status(200).send(csvContent);

  } catch (error: any) {
    console.error('Payroll export failed:', error);
    return res.status(500).json({ error: 'Database query failure compiling payroll export' });
  }
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`Scheduling Service is running on port ${PORT}`);
});
