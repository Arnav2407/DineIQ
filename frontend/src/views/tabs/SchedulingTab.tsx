import React, { useState, useEffect, useCallback } from 'react';
import { useScheduling } from '../../hooks/useScheduling';
import { 
  Calendar, Clock, Plus, X, Users, Check, AlertCircle, 
  FileText, Download, CheckCircle2, User, Loader2, Info
} from 'lucide-react';

interface SchedulingTabProps {
  tenantId: string;
  outletId: string;
}

export const SchedulingTab: React.FC<SchedulingTabProps> = ({ tenantId, outletId }) => {
  const {
    loading,
    error: schedulingError,
    staff,
    rosters,
    leaveRequests,
    availabilityList,
    attendanceRecords,
    payrollSummaries,
    fetchStaff,
    createStaff,
    fetchLeaveRequests,
    updateLeaveStatus,
    fetchRosters,
    createRoster,
    fetchAvailability,
    createAvailability,
    fetchAttendance,
    createManualAttendance,
    fetchPayrollSummaries,
    generatePayrollSummary,
    exportPayroll
  } = useScheduling();

  // Navigation tab: rosters, availability, attendance, leaves, payroll
  const [activeSubTab, setActiveSubTab] = useState<'rosters' | 'availability' | 'attendance' | 'leaves' | 'payroll'>('rosters');

  // Modals
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);

  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Forms
  const [staffForm, setStaffForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'Server',
    weekly_hours_cap: 40,
    leave_balance_days: 15
  });

  const [rosterForm, setRosterForm] = useState({
    start_date: '2026-07-20',
    end_date: '2026-07-26',
    shift_name: 'Morning Shift',
    shift_start_time: '2026-07-20T09:00',
    shift_end_time: '2026-07-20T17:00',
    assigned_staff_id: ''
  });

  const [availabilityForm, setAvailabilityForm] = useState({
    employee_id: '',
    available_from: '2026-07-20T00:00',
    available_to: '2026-07-24T23:59',
    status: 'Available' as 'Available' | 'Unavailable',
    remarks: ''
  });

  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: '',
    attendance_date: '2026-07-25',
    check_in: '2026-07-25T09:00',
    check_out: '2026-07-25T17:00',
    break_minutes: 60,
    attendance_status: 'Present' as 'Present' | 'Late',
    marked_by: 'Manager'
  });

  const [payrollForm, setPayrollForm] = useState({
    start_date: '2026-07-20',
    end_date: '2026-07-26',
    month: '2026-07'
  });

  const loadData = useCallback(() => {
    fetchStaff(tenantId, outletId);
    fetchLeaveRequests(tenantId, outletId);
    fetchRosters(tenantId, outletId);
    fetchAvailability(tenantId, outletId);
    fetchAttendance(tenantId, outletId);
  }, [tenantId, outletId, fetchStaff, fetchLeaveRequests, fetchRosters, fetchAvailability, fetchAttendance]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load appropriate data when tab changes
  useEffect(() => {
    if (activeSubTab === 'availability') {
      fetchAvailability(tenantId, outletId);
    } else if (activeSubTab === 'attendance') {
      fetchAttendance(tenantId, outletId);
    } else if (activeSubTab === 'payroll') {
      fetchPayrollSummaries(tenantId, outletId, payrollForm.month);
    }
  }, [activeSubTab, tenantId, outletId, fetchAvailability, fetchAttendance, fetchPayrollSummaries, payrollForm.month]);

  // Handle staff registration
  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    try {
      await createStaff({
        tenant_id: tenantId,
        outlet_id: outletId,
        ...staffForm
      });
      setTxSuccess('Employee registered successfully!');
      setStaffForm({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        role: 'Server',
        weekly_hours_cap: 40,
        leave_balance_days: 15
      });
      fetchStaff(tenantId, outletId);
      
      setTimeout(() => {
        setShowStaffModal(false);
        setTxSuccess(null);
      }, 1500);
    } catch (err: any) {
      setTxError(err.message || 'Failed to add staff.');
    }
  };

  // Handle Roster & Shift publishing
  const handleRosterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    const rosterPayload = {
      tenant_id: tenantId,
      outlet_id: outletId,
      start_date: rosterForm.start_date,
      end_date: rosterForm.end_date,
      shifts: [
        {
          name: rosterForm.shift_name,
          start_time: new Date(rosterForm.shift_start_time).toISOString(),
          end_time: new Date(rosterForm.shift_end_time).toISOString(),
          assignments: rosterForm.assigned_staff_id ? [rosterForm.assigned_staff_id] : []
        }
      ]
    };

    try {
      await createRoster(rosterPayload);
      setTxSuccess('Roster and shift published successfully!');
      fetchRosters(tenantId, outletId);
      
      setTimeout(() => {
        setShowRosterModal(false);
        setTxSuccess(null);
      }, 1500);
    } catch (err: any) {
      setTxError(err.message || 'Failed to publish roster.');
    }
  };

  // Handle Availability Logging
  const handleAvailabilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    try {
      await createAvailability({
        tenant_id: tenantId,
        outlet_id: outletId,
        employee_id: availabilityForm.employee_id,
        available_from: new Date(availabilityForm.available_from).toISOString(),
        available_to: new Date(availabilityForm.available_to).toISOString(),
        status: availabilityForm.status,
        remarks: availabilityForm.remarks
      });
      setTxSuccess('Availability constraint saved!');
      fetchAvailability(tenantId, outletId);
      
      setTimeout(() => {
        setShowAvailabilityModal(false);
        setTxSuccess(null);
      }, 1500);
    } catch (err: any) {
      setTxError(err.message || 'Failed to add availability record.');
    }
  };

  // Handle Manual Attendance marking
  const handleAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    try {
      await createManualAttendance({
        tenant_id: tenantId,
        outlet_id: outletId,
        employee_id: attendanceForm.employee_id,
        attendance_date: attendanceForm.attendance_date,
        check_in: new Date(attendanceForm.check_in).toISOString(),
        check_out: attendanceForm.check_out ? new Date(attendanceForm.check_out).toISOString() : null,
        break_minutes: Number(attendanceForm.break_minutes || 0),
        attendance_status: attendanceForm.attendance_status,
        marked_by: attendanceForm.marked_by
      });
      setTxSuccess('Attendance log recorded successfully!');
      fetchAttendance(tenantId, outletId);
      
      setTimeout(() => {
        setShowAttendanceModal(false);
        setTxSuccess(null);
      }, 1500);
    } catch (err: any) {
      setTxError(err.message || 'Failed to record manual attendance.');
    }
  };

  // Handle leave approval
  const handleLeaveAction = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      await updateLeaveStatus(id, status);
      fetchLeaveRequests(tenantId, outletId);
      fetchRosters(tenantId, outletId);
      fetchStaff(tenantId, outletId);
    } catch (err: any) {
      alert(`Conflict/Approval Error: ${err.message}`);
    }
  };

  // Generate monthly payroll summary
  const handleGeneratePayroll = async () => {
    setTxError(null);
    setTxSuccess(null);
    try {
      await generatePayrollSummary(tenantId, outletId, payrollForm.month);
      setTxSuccess('Payroll summaries generated successfully!');
      fetchPayrollSummaries(tenantId, outletId, payrollForm.month);
    } catch (err: any) {
      setTxError(err.message || 'Failed to compile payroll.');
    }
  };

  // Compile CSV
  const handlePayrollExport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await exportPayroll(tenantId, outletId, payrollForm.start_date, payrollForm.end_date);
    } catch (err: any) {
      alert(`Payroll exporter failed: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Sub-header Navigation */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex border-b border-dark-800 gap-2 overflow-x-auto pb-1 max-w-full">
          {[
            { id: 'rosters', label: 'Shift Roster Planner', icon: Calendar },
            { id: 'availability', label: 'Availability Planner', icon: Clock },
            { id: 'attendance', label: 'Attendance Manager', icon: CheckCircle2 },
            { id: 'leaves', label: `Leaves (${leaveRequests.filter(l => l.status === 'Pending').length} Pending)`, icon: FileText },
            { id: 'payroll', label: 'Payroll Console', icon: Download }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition font-display whitespace-nowrap ${
                  active 
                    ? 'border-brand-500 text-white' 
                    : 'border-transparent text-dark-400 hover:text-dark-200'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setStaffForm({ first_name: '', last_name: '', email: '', phone: '', role: 'Server', weekly_hours_cap: 40, leave_balance_days: 15 });
              setTxError(null);
              setTxSuccess(null);
              setShowStaffModal(true);
            }}
            className="glass-card border border-brand-500/30 text-brand-300 hover:bg-brand-500/10 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Users size={16} /> Add Employee
          </button>
          
          {activeSubTab === 'rosters' && (
            <button
              onClick={() => {
                setRosterForm({
                  start_date: '2026-07-20',
                  end_date: '2026-07-26',
                  shift_name: 'Morning Shift',
                  shift_start_time: '2026-07-20T09:00',
                  shift_end_time: '2026-07-20T17:00',
                  assigned_staff_id: staff[0]?.id || ''
                });
                setTxError(null);
                setTxSuccess(null);
                setShowRosterModal(true);
              }}
              className="glow-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus size={16} /> Publish Shifts
            </button>
          )}

          {activeSubTab === 'availability' && (
            <button
              onClick={() => {
                setAvailabilityForm({
                  employee_id: staff[0]?.id || '',
                  available_from: '2026-07-20T00:00',
                  available_to: '2026-07-24T23:59',
                  status: 'Available',
                  remarks: ''
                });
                setTxError(null);
                setTxSuccess(null);
                setShowAvailabilityModal(true);
              }}
              className="glow-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus size={16} /> Log Availability
            </button>
          )}

          {activeSubTab === 'attendance' && (
            <button
              onClick={() => {
                setAttendanceForm({
                  employee_id: staff[0]?.id || '',
                  attendance_date: new Date().toISOString().split('T')[0],
                  check_in: new Date().toISOString().substring(0, 16),
                  check_out: new Date().toISOString().substring(0, 16),
                  break_minutes: 60,
                  attendance_status: 'Present',
                  marked_by: 'Manager'
                });
                setTxError(null);
                setTxSuccess(null);
                setShowAttendanceModal(true);
              }}
              className="glow-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus size={16} /> Record Attendance
            </button>
          )}
        </div>
      </div>

      {/* SUB-TABS CONTENT */}
      <div className="flex-1">
        
        {/* SUB-TAB 1: ROSTER PLANNER */}
        {activeSubTab === 'rosters' && (
          <div className="glass-panel border border-dark-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white font-display mb-4">Published Rosters & Shifts</h3>
            
            <div className="space-y-6">
              {rosters.length > 0 ? (
                rosters.map((roster) => (
                  <div key={roster.id} className="border border-dark-800/80 bg-dark-900/10 rounded-2xl overflow-hidden animate-fadeIn">
                    <div className="bg-dark-900/40 p-4 border-b border-dark-800 flex justify-between items-center">
                      <div>
                        <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">Weekly Shift Roster</span>
                        <p className="text-xs text-dark-400 mt-0.5">Coverage: {roster.start_date} to {roster.end_date}</p>
                      </div>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-bold">
                        {roster.status}
                      </span>
                    </div>

                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {roster.shifts.map((shift) => {
                        const start = new Date(shift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const end = new Date(shift.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const dateStr = new Date(shift.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

                        return (
                          <div key={shift.id} className="glass-card p-4 rounded-xl border border-dark-800/50 flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between items-start gap-2">
                                <h4 className="text-xs font-bold text-white font-display">{shift.shift_name || shift.name}</h4>
                                <span className="text-[9px] bg-dark-900 border border-dark-800 text-brand-300 font-mono px-2 py-0.5 rounded-full">
                                  {dateStr}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 mt-2 text-[10px] text-dark-400 font-mono">
                                <span className="flex items-center gap-1">
                                  <Clock size={10} /> {start} - {end}
                                </span>
                                {shift.break_minutes !== undefined && (
                                  <span>Break: {shift.break_minutes} mins</span>
                                )}
                              </div>
                            </div>

                            <div className="border-t border-dark-800/40 pt-3 mt-4">
                              <span className="text-[9px] uppercase font-mono text-dark-500 block mb-1.5">Assigned Coverage:</span>
                              {shift.assignments && shift.assignments.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {shift.assignments.map(ass => (
                                    <span key={ass.id} className="text-[10px] bg-brand-500/10 text-brand-300 border border-brand-500/20 px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
                                      <User size={8} /> {ass.first_name} {ass.last_name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-red-400 italic">No assigned staff</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-dark-400 italic">
                  No weekly shift rosters published yet. Click "Publish Shifts" to plan assignments.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB-TAB 2: AVAILABILITY PLANNER */}
        {activeSubTab === 'availability' && (
          <div className="glass-panel border border-dark-800 rounded-2xl p-6">
            <div>
              <h3 className="text-lg font-bold text-white font-display mb-1">Staff Availability Logs</h3>
              <p className="text-xs text-dark-400 mb-6">Review employee availability constraints before publishing shift rosters.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availabilityList.length > 0 ? (
                availabilityList.map((avail) => {
                  const startStr = new Date(avail.available_from).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                  const endStr = new Date(avail.available_to).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                  const isAvailable = avail.status === 'Available';

                  return (
                    <div key={avail.id} className="glass-card p-4 rounded-xl border border-dark-800/50 flex flex-col justify-between animate-fadeIn">
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h4 className="text-sm font-bold text-white font-display">{avail.full_name || `${avail.first_name} ${avail.last_name}`}</h4>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            isAvailable 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {avail.status}
                          </span>
                        </div>
                        <span className="text-[10px] text-dark-400 font-mono block">Role: {avail.role}</span>
                        <div className="bg-dark-950/40 p-2.5 rounded-lg border border-dark-900/50 mt-3 text-xs space-y-1">
                          <p className="text-dark-400"><strong className="text-white">From:</strong> {startStr}</p>
                          <p className="text-dark-400"><strong className="text-white">To:</strong> {endStr}</p>
                        </div>
                      </div>

                      {avail.remarks && (
                        <p className="text-xs italic text-dark-500 mt-3 border-t border-dark-800/40 pt-2">
                          "{avail.remarks}"
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full text-center py-12 text-dark-400 italic">
                  No staff availability records filed. Click "Log Availability" to record constraints.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB-TAB 3: ATTENDANCE MANAGER */}
        {activeSubTab === 'attendance' && (
          <div className="glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-dark-800 bg-dark-900/10 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white font-display">Employee Attendance Logs</h3>
                <p className="text-xs text-dark-400 mt-1">Review check-in/check-out logs, break durations, and calculated metrics.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-dark-300">
                <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                  <tr>
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Check-In</th>
                    <th className="px-6 py-4">Check-Out</th>
                    <th className="px-6 py-4">Break (Mins)</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Working Hours</th>
                    <th className="px-6 py-4">Overtime</th>
                    <th className="px-6 py-4">Late Minutes</th>
                    <th className="px-6 py-4 text-right">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/40">
                  {attendanceRecords.length > 0 ? (
                    attendanceRecords.map((record) => {
                      let statusBadge = 'bg-green-500/10 text-green-400 border border-green-500/20';
                      if (record.attendance_status === 'Late') statusBadge = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
                      if (record.attendance_status === 'Absent') statusBadge = 'bg-red-500/10 text-red-400 border border-red-500/20';

                      const checkInStr = new Date(record.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const checkOutStr = record.check_out 
                        ? new Date(record.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                        : '--:--';

                      return (
                        <tr key={record.id} className="hover:bg-dark-900/20 transition animate-fadeIn">
                          <td className="px-6 py-4">
                            <div>
                              <span className="font-semibold text-white block">{record.full_name || `${record.first_name} ${record.last_name}`}</span>
                              <span className="text-[10px] text-dark-400 font-mono uppercase block mt-0.5">{record.role}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-white whitespace-nowrap">
                            {new Date(record.attendance_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-emerald-400">{checkInStr}</td>
                          <td className="px-6 py-4 font-mono text-xs text-orange-400">{checkOutStr}</td>
                          <td className="px-6 py-4 font-mono text-xs text-white">{record.break_minutes}</td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge}`}>
                              {record.attendance_status}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-white font-bold">
                            {Number(record.working_hours).toFixed(2)}h
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-brand-300">
                            {Number(record.overtime_hours) > 0 ? `+${Number(record.overtime_hours).toFixed(2)}h` : '0.00h'}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-amber-400">
                            {record.late_minutes > 0 ? `${record.late_minutes}m` : '0m'}
                          </td>
                          <td className="px-6 py-4 text-right text-xs font-mono text-dark-400">
                            {record.marked_by}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-dark-400 italic">
                        No attendance records logged for this outlet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-TAB 4: LEAVES MANAGER */}
        {activeSubTab === 'leaves' && (
          <div className="glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-dark-800 bg-dark-900/10 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white font-display">Staff Leave & Vacation Requests</h3>
                <p className="text-xs text-dark-400 mt-1">Approve or reject leave logs. Shift schedules automatically deduct approved periods.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-dark-300">
                <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                  <tr>
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Date Range</th>
                    <th className="px-6 py-4">Reason</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/40">
                  {leaveRequests.length > 0 ? (
                    leaveRequests.map((req) => {
                      let statusBadge = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
                      if (req.status === 'Approved') statusBadge = 'bg-green-500/10 text-green-400 border border-green-500/20';
                      if (req.status === 'Rejected') statusBadge = 'bg-red-500/10 text-red-400 border border-red-500/20';

                      return (
                        <tr key={req.id} className="hover:bg-dark-900/20 transition animate-fadeIn">
                          <td className="px-6 py-4">
                            <div>
                              <span className="font-semibold text-white block">{req.first_name} {req.last_name}</span>
                              <span className="text-[10px] text-dark-400 font-mono uppercase block mt-0.5">{req.role}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs bg-dark-900 border border-dark-800 text-dark-300 px-2 py-0.5 rounded-lg">
                              {req.leave_type || req.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-white">
                            {req.start_date} to {req.end_date}
                          </td>
                          <td className="px-6 py-4 text-xs text-dark-400 max-w-[200px] truncate">
                            {req.reason || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge}`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {req.status === 'Pending' ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => handleLeaveAction(req.id, 'Approved')}
                                  className="bg-green-600 hover:bg-green-500 text-white px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                >
                                  <Check size={12} /> Approve
                                </button>
                                <button
                                  onClick={() => handleLeaveAction(req.id, 'Rejected')}
                                  className="bg-red-950/40 hover:bg-red-900/30 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-dark-500 italic">Resolved ({req.approved_by || 'Manager'})</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-dark-400 italic">
                        No leave requests registered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-TAB 5: PAYROLL CONSOLE */}
        {activeSubTab === 'payroll' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            
            {/* CSV Exporter Form */}
            <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col gap-6">
              <div>
                <h3 className="text-lg font-bold text-white font-display">Export Payroll Spreadsheet</h3>
                <p className="text-xs text-dark-400 mt-1">Export shift schedule and attendance times between range into a CSV dataset.</p>
              </div>

              <form onSubmit={handlePayrollExport} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Start Date</label>
                    <input
                      type="date"
                      value={payrollForm.start_date}
                      onChange={(e) => setPayrollForm({ ...payrollForm, start_date: e.target.value })}
                      className="glass-input w-full bg-dark-950 text-xs"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">End Date</label>
                    <input
                      type="date"
                      value={payrollForm.end_date}
                      onChange={(e) => setPayrollForm({ ...payrollForm, end_date: e.target.value })}
                      className="glass-input w-full bg-dark-950 text-xs"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="glow-btn w-full py-2.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition text-xs cursor-pointer"
                >
                  <Download size={14} />
                  <span>Export Payroll CSV</span>
                </button>
              </form>

              <hr className="border-dark-800/80" />

              <div>
                <h3 className="text-lg font-bold text-white font-display">Generate Monthly summaries</h3>
                <p className="text-xs text-dark-400 mt-1">Compile working days, total actual working hours, overtime hours and leave offsets for a given calendar month.</p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Target Month</label>
                  <input
                    type="month"
                    value={payrollForm.month}
                    onChange={(e) => setPayrollForm({ ...payrollForm, month: e.target.value })}
                    className="glass-input w-full bg-dark-950 text-xs"
                    required
                  />
                </div>

                <button
                  type="button"
                  onClick={handleGeneratePayroll}
                  disabled={loading}
                  className="glass-card border border-brand-500/30 text-brand-300 hover:bg-brand-500/10 w-full py-2.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition text-xs cursor-pointer"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Info size={14} />}
                  <span>Generate Summary Records</span>
                </button>
              </div>
            </div>

            {/* Monthly Payroll Summary Table */}
            <div className="lg:col-span-2 glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col p-6">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-white font-display">Summary Dataset: {payrollForm.month}</h3>
                <p className="text-xs text-dark-400 mt-0.5">Stored database summaries generated for accounting.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-dark-300">
                  <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Hours</th>
                      <th className="px-4 py-3">Overtime</th>
                      <th className="px-4 py-3">Leaves</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/40">
                    {payrollSummaries.length > 0 ? (
                      payrollSummaries.map((summary) => (
                        <tr key={summary.id} className="hover:bg-dark-900/20 transition text-xs">
                          <td className="px-4 py-3 font-mono text-brand-300">{summary.employee_code || 'EMP-000'}</td>
                          <td className="px-4 py-3">
                            <div>
                              <span className="font-semibold text-white block">{summary.full_name || `${summary.first_name} ${summary.last_name}`}</span>
                              <span className="text-[10px] text-dark-400 font-mono block mt-0.5">{summary.role}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-white">{summary.working_days} days</td>
                          <td className="px-4 py-3 font-mono text-emerald-400 font-bold">{Number(summary.working_hours).toFixed(2)}h</td>
                          <td className="px-4 py-3 font-mono text-amber-400">+{Number(summary.overtime_hours).toFixed(2)}h</td>
                          <td className="px-4 py-3 font-mono text-orange-400">{summary.leave_days} days</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-dark-400 italic">
                          No generated summary logs found for this month.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* MODAL 1: ADD EMPLOYEE (STAFF) */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowStaffModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Users className="text-brand-400" /> Add Restaurant Employee
            </h3>

            <form onSubmit={handleStaffSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">First Name</label>
                  <input
                    type="text"
                    placeholder="Alice"
                    value={staffForm.first_name}
                    onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })}
                    className="glass-input w-full"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Last Name</label>
                  <input
                    type="text"
                    placeholder="Chef"
                    value={staffForm.last_name}
                    onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })}
                    className="glass-input w-full"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Email Address</label>
                <input
                  type="email"
                  placeholder="alice@dineiq.com"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  className="glass-input w-full text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Phone</label>
                  <input
                    type="text"
                    placeholder="555-0101"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="glass-input w-full text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Role</label>
                  <select
                    value={staffForm.role}
                    onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                    className="glass-input w-full bg-dark-950"
                  >
                    <option value="Chef">Chef</option>
                    <option value="Server">Server</option>
                    <option value="Bartender">Bartender</option>
                    <option value="Host">Host</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Weekly Cap (Hours)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={staffForm.weekly_hours_cap}
                    onChange={(e) => setStaffForm({ ...staffForm, weekly_hours_cap: Number(e.target.value) })}
                    className="glass-input w-full"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Leave Balance (Days)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={staffForm.leave_balance_days}
                    onChange={(e) => setStaffForm({ ...staffForm, leave_balance_days: Number(e.target.value) })}
                    className="glass-input w-full"
                    required
                  />
                </div>
              </div>

              {txSuccess && (
                <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <Check size={14} /> {txSuccess}
                </p>
              )}

              {txError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle size={14} /> {txError}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:bg-brand-800 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  <span>Register Employee</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PUBLISH SHIFTS */}
      {showRosterModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowRosterModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Calendar className="text-brand-400" /> Plan & Publish Shift
            </h3>

            <form onSubmit={handleRosterSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Roster Start Date</label>
                  <input
                    type="date"
                    value={rosterForm.start_date}
                    onChange={(e) => setRosterForm({ ...rosterForm, start_date: e.target.value })}
                    className="glass-input w-full bg-dark-950"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Roster End Date</label>
                  <input
                    type="date"
                    value={rosterForm.end_date}
                    onChange={(e) => setRosterForm({ ...rosterForm, end_date: e.target.value })}
                    className="glass-input w-full bg-dark-950"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Shift Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dinner Server Shift"
                  value={rosterForm.shift_name}
                  onChange={(e) => setRosterForm({ ...rosterForm, shift_name: e.target.value })}
                  className="glass-input w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Shift Start Time</label>
                  <input
                    type="datetime-local"
                    value={rosterForm.shift_start_time}
                    onChange={(e) => setRosterForm({ ...rosterForm, shift_start_time: e.target.value })}
                    className="glass-input w-full text-xs bg-dark-950"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Shift End Time</label>
                  <input
                    type="datetime-local"
                    value={rosterForm.shift_end_time}
                    onChange={(e) => setRosterForm({ ...rosterForm, shift_end_time: e.target.value })}
                    className="glass-input w-full text-xs bg-dark-950"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Assign Staff Member</label>
                <select
                  value={rosterForm.assigned_staff_id}
                  onChange={(e) => setRosterForm({ ...rosterForm, assigned_staff_id: e.target.value })}
                  className="glass-input w-full bg-dark-950 text-xs"
                  required
                >
                  <option value="" disabled>Select staff member</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || `${s.first_name} ${s.last_name}`} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              {txSuccess && (
                <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <Check size={14} /> {txSuccess}
                </p>
              )}

              {txError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex gap-2 animate-fadeIn">
                  <AlertCircle size={16} className="shrink-0 text-red-500 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-white font-display">Conflict Detected</h4>
                    <p className="mt-0.5 leading-relaxed">{txError}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowRosterModal(false)}
                  className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:bg-brand-800 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  <span>Publish Shift</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: LOG AVAILABILITY */}
      {showAvailabilityModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowAvailabilityModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Clock className="text-brand-400" /> Log Employee Availability
            </h3>

            <form onSubmit={handleAvailabilitySubmit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Employee</label>
                <select
                  value={availabilityForm.employee_id}
                  onChange={(e) => setAvailabilityForm({ ...availabilityForm, employee_id: e.target.value })}
                  className="glass-input w-full bg-dark-950 text-xs"
                  required
                >
                  <option value="" disabled>Select employee</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || `${s.first_name} ${s.last_name}`} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">From Time</label>
                  <input
                    type="datetime-local"
                    value={availabilityForm.available_from}
                    onChange={(e) => setAvailabilityForm({ ...availabilityForm, available_from: e.target.value })}
                    className="glass-input w-full text-xs bg-dark-950"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">To Time</label>
                  <input
                    type="datetime-local"
                    value={availabilityForm.available_to}
                    onChange={(e) => setAvailabilityForm({ ...availabilityForm, available_to: e.target.value })}
                    className="glass-input w-full text-xs bg-dark-950"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Status</label>
                <select
                  value={availabilityForm.status}
                  onChange={(e) => setAvailabilityForm({ ...availabilityForm, status: e.target.value as any })}
                  className="glass-input w-full bg-dark-950 text-xs"
                >
                  <option value="Available">Available</option>
                  <option value="Unavailable">Unavailable (Blockout)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Remarks / Reasons</label>
                <input
                  type="text"
                  placeholder="e.g. Dentists appointment, weekly recurring available"
                  value={availabilityForm.remarks}
                  onChange={(e) => setAvailabilityForm({ ...availabilityForm, remarks: e.target.value })}
                  className="glass-input w-full text-xs"
                />
              </div>

              {txSuccess && (
                <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <Check size={14} /> {txSuccess}
                </p>
              )}

              {txError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle size={14} /> {txError}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAvailabilityModal(false)}
                  className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:bg-brand-800 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Record</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: RECORD MANUAL ATTENDANCE */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowAttendanceModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <CheckCircle2 className="text-brand-400" /> Record Attendance (Manager Web-Entry)
            </h3>

            <form onSubmit={handleAttendanceSubmit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Employee</label>
                <select
                  value={attendanceForm.employee_id}
                  onChange={(e) => setAttendanceForm({ ...attendanceForm, employee_id: e.target.value })}
                  className="glass-input w-full bg-dark-950 text-xs"
                  required
                >
                  <option value="" disabled>Select employee</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || `${s.first_name} ${s.last_name}`} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Attendance Date</label>
                  <input
                    type="date"
                    value={attendanceForm.attendance_date}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, attendance_date: e.target.value })}
                    className="glass-input w-full text-xs bg-dark-950"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Break Time (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="240"
                    value={attendanceForm.break_minutes}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, break_minutes: Number(e.target.value) })}
                    className="glass-input w-full text-xs bg-dark-950"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Check-In Time</label>
                  <input
                    type="datetime-local"
                    value={attendanceForm.check_in}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, check_in: e.target.value })}
                    className="glass-input w-full text-xs bg-dark-950"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Check-Out Time</label>
                  <input
                    type="datetime-local"
                    value={attendanceForm.check_out}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, check_out: e.target.value })}
                    className="glass-input w-full text-xs bg-dark-950"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Status</label>
                  <select
                    value={attendanceForm.attendance_status}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, attendance_status: e.target.value as any })}
                    className="glass-input w-full bg-dark-950 text-xs"
                  >
                    <option value="Present">Present (On Schedule)</option>
                    <option value="Late">Late (Drift Warning)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Marked By</label>
                  <input
                    type="text"
                    value={attendanceForm.marked_by}
                    onChange={(e) => setAttendanceForm({ ...attendanceForm, marked_by: e.target.value })}
                    className="glass-input w-full text-xs"
                    required
                  />
                </div>
              </div>

              {txSuccess && (
                <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <Check size={14} /> {txSuccess}
                </p>
              )}

              {txError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle size={14} /> {txError}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAttendanceModal(false)}
                  className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:bg-brand-800 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  <span>Save Attendance</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
