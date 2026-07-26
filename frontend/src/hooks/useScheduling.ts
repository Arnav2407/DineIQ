import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export interface Staff {
  id: string;
  tenant_id: string;
  outlet_id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  employee_code?: string;
  email: string;
  phone?: string;
  phone_number?: string;
  role: string;
  status?: string;
  weekly_hours_cap: number;
  leave_balance_days: number;
  created_at: string;
}

export interface ShiftAssignment {
  id: string;
  first_name: string;
  last_name: string;
}

export interface RosterShift {
  id: string;
  name: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  break_minutes?: number;
  assignments: ShiftAssignment[];
}

export interface Roster {
  id: string;
  tenant_id: string;
  outlet_id: string;
  start_date: string;
  end_date: string;
  status: 'Draft' | 'Published';
  shifts: RosterShift[];
}

export interface LeaveRequest {
  id: string;
  tenant_id: string;
  outlet_id: string;
  employee_id?: string;
  staff_id: string;
  first_name: string;
  last_name: string;
  role: string;
  start_date: string;
  end_date: string;
  leave_type: 'Sick' | 'Vacation' | 'Unpaid' | 'Personal';
  type?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reason?: string;
  approved_by?: string;
  created_at: string;
}

export interface EmployeeAvailability {
  id: string;
  tenant_id: string;
  outlet_id: string;
  employee_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  available_from: string;
  available_to: string;
  status: 'Available' | 'Unavailable';
  remarks?: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  tenant_id: string;
  outlet_id: string;
  employee_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  attendance_date: string;
  check_in: string;
  check_out?: string;
  break_minutes: number;
  attendance_status: 'Present' | 'Absent' | 'Late';
  marked_by?: string;
  working_hours: number;
  overtime_hours: number;
  shift_hours: number;
  shift_start_time?: string;
  late_minutes: number;
  gps_latitude?: number;
  gps_longitude?: number;
  created_at: string;
}

export interface PayrollSummary {
  id: string;
  tenant_id: string;
  outlet_id: string;
  employee_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  employee_code?: string;
  month: string;
  working_days: number;
  working_hours: number;
  overtime_hours: number;
  leave_days: number;
  generated_on: string;
}

export const useScheduling = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [availabilityList, setAvailabilityList] = useState<EmployeeAvailability[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [payrollSummaries, setPayrollSummaries] = useState<PayrollSummary[]>([]);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('dineiq_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }, []);

  const fetchStaff = useCallback(async (tenantId: string, outletId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/scheduling/staff?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setStaff(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch staff list');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const createStaff = useCallback(async (staffData: Partial<Staff>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/scheduling/staff`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(staffData),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to add staff member');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchLeaveRequests = useCallback(async (tenantId: string, outletId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/leave-requests?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // Map database schema fields if necessary
      const mapped = data.map((d: any) => ({
        ...d,
        staff_id: d.employee_id || d.staff_id,
        leave_type: d.leave_type || d.type,
      }));
      setLeaveRequests(mapped);
      return mapped;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch leave requests');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const createLeaveRequest = useCallback(async (leaveData: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/leave-requests`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(leaveData),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to file leave request');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const updateLeaveStatus = useCallback(async (id: string, status: 'Approved' | 'Rejected') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/leave-requests/${id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const errText = await res.text();
        let errMsg = errText;
        try {
          const errObj = JSON.parse(errText);
          errMsg = errObj.error || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to process leave request');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchRosters = useCallback(async (tenantId: string, outletId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/rosters?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRosters(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch roster schedule');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const createRoster = useCallback(async (rosterData: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/rosters`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(rosterData),
      });
      if (res.status === 409) {
        const errObj = await res.json();
        throw new Error(errObj.message || 'SCHEDULE_CONFLICT');
      }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to create roster schedule');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchAvailability = useCallback(async (tenantId: string, outletId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/scheduling/availability?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAvailabilityList(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch availability records');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const createAvailability = useCallback(async (availabilityData: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/scheduling/availability`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(availabilityData),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to create availability record');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchAttendance = useCallback(async (tenantId: string, outletId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/attendance?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAttendanceRecords(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch attendance logs');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const createManualAttendance = useCallback(async (attendanceData: any) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/attendance/manual`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(attendanceData),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to log manual attendance');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchPayrollSummaries = useCallback(async (tenantId: string, outletId: string, month: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/payroll/summary?tenant_id=${tenantId}&outlet_id=${outletId}&month=${month}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPayrollSummaries(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payroll summaries');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const generatePayrollSummary = useCallback(async (tenantId: string, outletId: string, month: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/payroll/summary`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ tenant_id: tenantId, outlet_id: outletId, month }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPayrollSummaries(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to generate payroll summary');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const exportPayroll = useCallback(async (tenantId: string, outletId: string, startDate: string, endDate: string) => {
    setError(null);
    try {
      const token = localStorage.getItem('dineiq_token');
      const url = `${API_BASE}/api/v1/payroll/export?tenant_id=${tenantId}&outlet_id=${outletId}&start_date=${startDate}&end_date=${endDate}`;
      
      const res = await fetch(url, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        }
      });
      if (!res.ok) throw new Error(await res.text());
      
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `payroll_${startDate}_to_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      setError(err.message || 'Failed to export payroll');
      throw err;
    }
  }, []);

  return {
    loading,
    error,
    staff,
    rosters,
    leaveRequests,
    availabilityList,
    attendanceRecords,
    payrollSummaries,
    fetchStaff,
    createStaff,
    fetchLeaveRequests,
    createLeaveRequest,
    updateLeaveStatus,
    fetchRosters,
    createRoster,
    fetchAvailability,
    createAvailability,
    fetchAttendance,
    createManualAttendance,
    fetchPayrollSummaries,
    generatePayrollSummary,
    exportPayroll,
  };
};
