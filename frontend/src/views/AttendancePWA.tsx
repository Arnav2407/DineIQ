import React, { useState, useEffect } from 'react';
import { Clock, Calendar, AlertCircle, FileText, CheckCircle2, User, MapPin } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export const AttendancePWA: React.FC = () => {
  // Mobile UI layout cap 375px
  const tenantId = 'tenant-hq-1';
  const outletId = 'outlet-bistro-1';
  const staffId = 'e0000000-0000-0000-0000-000000000002'; // Bob (Server)

  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [clockedInRecord, setClockedInRecord] = useState<any>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<number>(12);
  const [weeklyCap, setWeeklyCap] = useState<number>(30);
  
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);

  // Fetch initial data
  useEffect(() => {
    // 1. Mock/Set shifts roster (Monday Server Shift)
    setActiveShift({
      id: 'f0000000-0000-0000-0000-000000000102',
      name: 'Monday Server Shift',
      start_time: '2026-07-13T12:00:00.000Z',
      end_time: '2026-07-13T20:00:00.000Z',
    });

    // 2. Fetch leave requests from scheduling service
    fetch(`${API_BASE}/api/v1/scheduling/staff`) // In general, query database or list
      .then(() => {
        setLeaveRequests([
          { id: '1', start_date: '2026-07-20', end_date: '2026-07-22', type: 'Vacation', status: 'Approved' },
          { id: '2', start_date: '2026-07-27', end_date: '2026-07-28', type: 'Sick', status: 'Pending' }
        ]);
        setAlerts([
          'Next Roster published for week of 2026-07-13.',
          'Your leave request for 2026-07-20 has been Approved.'
        ]);
      }).catch(err => console.error(err));
  }, []);

  // Streams GPS and Clock-in action in 1 simple tap
  const handleClockAction = async () => {
    setClockLoading(true);
    setStatusMessage(null);
    setIsLocating(true);

    // Geolocation capture
    if (!navigator.geolocation) {
      setIsLocating(false);
      setClockLoading(false);
      setStatusMessage({ type: 'error', text: 'GPS Geolocation not supported by this device.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setGpsCoords(coords);
        setIsLocating(false);

        try {
          const isClockingOut = clockedInRecord !== null;
          const endpoint = isClockingOut ? 'clock-out' : 'clock-in';
          
          const res = await fetch(`${API_BASE}/api/v1/attendance/${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('dineiq_token') || ''}`
            },
            body: JSON.stringify({
              tenant_id: tenantId,
              outlet_id: outletId,
              staff_id: staffId,
              device_timestamp: new Date().toISOString(),
              gps_latitude: coords.lat,
              gps_longitude: coords.lng
            })
          });

          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();

          if (isClockingOut) {
            setClockedInRecord(null);
            setStatusMessage({ 
              type: 'success', 
              text: `Clock-out complete! Worked hours registered.` 
            });
          } else {
            setClockedInRecord(data);
            
            // Analyze drift warning messages
            if (data.late_arrival && data.out_of_window) {
              setStatusMessage({
                type: 'warn',
                text: 'Clocked In. Flagged: LATE ARRIVAL & OUT OF WINDOW (off-schedule).'
              });
            } else if (data.late_arrival) {
              setStatusMessage({
                type: 'warn',
                text: 'Clocked In. Flagged: LATE ARRIVAL (>15 mins drift).'
              });
            } else if (data.out_of_window) {
              setStatusMessage({
                type: 'warn',
                text: 'Clocked In. Flagged: OUT OF WINDOW (>60 mins drift).'
              });
            } else {
              setStatusMessage({
                type: 'success',
                text: 'Clocked In successfully. On schedule!'
              });
            }
          }
        } catch (err: any) {
          console.error(err);
          setStatusMessage({ type: 'error', text: err.message || 'Clock action database save failed.' });
        } finally {
          setClockLoading(false);
        }
      },
      (error) => {
        setIsLocating(false);
        setClockLoading(false);
        setStatusMessage({ type: 'error', text: `GPS error: ${error.message}. Location required to clock.` });
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100 flex justify-center py-4 px-2">
      {/* Target mobile layout limit of 375px */}
      <div className="w-[375px] min-h-[700px] rounded-3xl glass-panel relative flex flex-col p-4 overflow-hidden">
        
        {/* Header section */}
        <header className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Bob Server</h2>
              <span className="text-[10px] text-dark-400 font-mono">ID: ...0002</span>
            </div>
          </div>
          <div className="glass-card px-2.5 py-1 rounded-full text-[11px] font-medium text-brand-300">
            Bistro Outlet
          </div>
        </header>

        {/* Dynamic clock-in button section */}
        <section className="flex flex-col items-center mb-6 text-center">
          <div className="w-40 h-40 rounded-full flex items-center justify-center relative mb-4">
            {/* Pulsing ring */}
            <div className={`absolute inset-0 rounded-full border-2 ${clockedInRecord ? 'border-red-500/30 animate-ping' : 'border-brand-500/30 animate-pulse'}`}></div>
            
            <button
              onClick={handleClockAction}
              disabled={clockLoading}
              className={`w-36 h-36 rounded-full flex flex-col items-center justify-center shadow-lg transition-all duration-300 ${
                clockedInRecord 
                  ? 'bg-gradient-to-tr from-red-600 to-orange-500 text-white shadow-red-500/20 hover:shadow-red-500/40' 
                  : 'bg-gradient-to-tr from-brand-600 to-violet-500 text-white shadow-brand-500/20 hover:shadow-brand-500/40'
              }`}
            >
              {clockLoading ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                  <span className="text-[11px] font-mono tracking-wider">
                    {isLocating ? 'GPS LOCATING...' : 'SYNCING...'}
                  </span>
                </div>
              ) : (
                <>
                  <Clock size={32} className="mb-2" />
                  <span className="text-sm font-bold tracking-wider uppercase">
                    {clockedInRecord ? 'CLOCK OUT' : 'CLOCK IN'}
                  </span>
                  <span className="text-[9px] opacity-75 font-mono mt-1">1-TAP GPS LOCK</span>
                </>
              )}
            </button>
          </div>

          {gpsCoords && (
            <div className="flex items-center gap-1 text-[10px] text-dark-400 font-mono mb-2 bg-dark-900/40 px-2 py-1 rounded-md">
              <MapPin size={10} className="text-brand-400" />
              <span>GPS: {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</span>
            </div>
          )}

          {statusMessage && (
            <div className={`text-xs p-3 rounded-xl border w-full max-w-[320px] ${
              statusMessage.type === 'success' 
                ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                : statusMessage.type === 'warn' 
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' 
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {statusMessage.text}
            </div>
          )}
        </section>

        {/* Assigned shifts section */}
        <section className="mb-6">
          <h3 className="text-xs font-bold text-dark-300 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Calendar size={12} /> Today's Assigned Shift
          </h3>
          {activeShift ? (
            <div className="glass-card p-3 rounded-xl flex justify-between items-center">
              <div>
                <h4 className="text-xs font-bold text-white">{activeShift.name}</h4>
                <p className="text-[10px] text-dark-400 font-mono mt-1">
                  {new Date(activeShift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(activeShift.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] bg-dark-800 text-dark-300 px-2 py-0.5 rounded-full font-mono">
                  {weeklyCap}h cap
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-dark-400 italic">No assigned shift for today.</p>
          )}
        </section>

        {/* Leave Requests Balance & Status */}
        <section className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-bold text-dark-300 uppercase tracking-wider flex items-center gap-1">
              <FileText size={12} /> Leave & Vacation
            </h3>
            <span className="text-[11px] text-brand-300 font-bold">
              Balance: {leaveBalance} days
            </span>
          </div>
          
          <div className="flex flex-col gap-2 max-h-[110px] overflow-y-auto pr-1">
            {leaveRequests.map(req => (
              <div key={req.id} className="glass-card p-2.5 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <span className="font-semibold text-white">{req.type}</span>
                  <span className="text-[9px] text-dark-400 font-mono block mt-0.5">
                    {req.start_date} to {req.end_date}
                  </span>
                </div>
                <div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
                    req.status === 'Approved' 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                      : req.status === 'Pending' 
                        ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' 
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Alerts & Notifications */}
        <section className="mt-auto">
          <h3 className="text-xs font-bold text-dark-300 uppercase tracking-wider mb-2 flex items-center gap-1">
            <AlertCircle size={12} /> Notification Alerts
          </h3>
          <div className="flex flex-col gap-1.5">
            {alerts.map((alert, idx) => (
              <div key={idx} className="flex gap-2 items-start text-[11px] text-dark-400 bg-dark-900/30 p-2 rounded-lg border border-dark-800">
                <CheckCircle2 size={12} className="text-brand-400 shrink-0 mt-0.5" />
                <span className="leading-tight">{alert}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
};
