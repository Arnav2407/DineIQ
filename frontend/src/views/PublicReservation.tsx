import React, { useState } from 'react';
import { Calendar, Users, Phone, Mail, User, Clock, CheckCircle2, AlertCircle, Sparkles, ArrowLeft } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export const PublicReservation: React.FC = () => {
  // Constants
  const tenantId = 'tenant-hq-1';
  const outletId = 'outlet-bistro-1';

  // Form states
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedTime, setSelectedTime] = useState('19:00');
  const [areaName, setAreaName] = useState('Indoor');

  // Logic states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successReservation, setSuccessReservation] = useState<any | null>(null);
  const [checkedAvailability, setCheckedAvailability] = useState(false);
  const [availableTables, setAvailableTables] = useState<any[]>([]);

  // Helpers
  const formatDateTime = (dateStr: string, timeStr: string) => {
    const combinedStr = `${dateStr}T${timeStr}:00`;
    const dt = new Date(combinedStr);
    return dt;
  };

  const handleCheckAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCheckedAvailability(false);

    const startDT = formatDateTime(selectedDate, selectedTime);
    const endDT = new Date(startDT.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours booking

    try {
      const url = `${API_BASE}/api/v1/tables/free?tenant_id=${tenantId}&outlet_id=${outletId}&party_size=${partySize}&start_time=${startDT.toISOString()}&end_time=${endDT.toISOString()}${areaName ? `&area_name=${areaName}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      
      const tables = await res.json();
      setAvailableTables(tables);
      setCheckedAvailability(true);
      if (tables.length === 0) {
        setError('No tables matching your requests are available for the selected slot.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to search for available tables.');
    } finally {
      setLoading(false);
    }
  };

  const handleBookTable = async (tableId: string, tableNumber: string) => {
    setLoading(true);
    setError(null);

    const startDT = formatDateTime(selectedDate, selectedTime);
    const endDT = new Date(startDT.getTime() + 2 * 60 * 60 * 1000); // 2 hours

    try {
      const res = await fetch(`${API_BASE}/api/v1/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          outlet_id: outletId,
          table_id: tableId,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          party_size: partySize,
          start_time: startDT.toISOString(),
          end_time: endDT.toISOString()
        })
      });

      if (res.status === 409) {
        throw new Error('Table was booked by someone else just now. Please check availability again.');
      }
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setSuccessReservation({
        ...data,
        table_number: tableNumber
      });
    } catch (err: any) {
      setError(err.message || 'Failed to book the reservation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col justify-center items-center p-4 md:p-8 relative overflow-hidden">
      {/* Decorative glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl"></div>

      <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 md:p-8 relative z-10">
        
        {/* Header */}
        {!successReservation && (
          <div className="flex justify-between items-center mb-8 border-b border-dark-800/60 pb-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white font-display flex items-center gap-2">
                <Sparkles className="text-brand-400" /> Book a Table Online
              </h1>
              <p className="text-dark-400 text-xs mt-1">Reserve your dining experience at DineIQ Bistro</p>
            </div>
            <a 
              href="/login" 
              className="text-xs text-dark-300 hover:text-white flex items-center gap-1 bg-dark-900 border border-dark-800 px-3 py-2 rounded-xl transition"
            >
              <ArrowLeft size={14} /> Back to Login
            </a>
          </div>
        )}

        {/* Success View */}
        {successReservation ? (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-bounce">
              <CheckCircle2 size={36} />
            </div>
            
            <div>
              <h2 className="text-2xl font-bold text-white font-display">Reservation Confirmed!</h2>
              <p className="text-dark-400 text-sm mt-1">We have saved your slot and are preparing to welcome you.</p>
            </div>

            <div className="w-full max-w-md bg-dark-900/50 border border-dark-800 rounded-2xl p-6 text-left space-y-4 font-mono text-xs">
              <div className="flex justify-between border-b border-dark-800/40 pb-2">
                <span className="text-dark-400">Guest Name:</span>
                <span className="text-white font-bold">{successReservation.guest_name}</span>
              </div>
              <div className="flex justify-between border-b border-dark-800/40 pb-2">
                <span className="text-dark-400">Assigned Table:</span>
                <span className="text-brand-300 font-bold">Table {successReservation.table_number} ({areaName})</span>
              </div>
              <div className="flex justify-between border-b border-dark-800/40 pb-2">
                <span className="text-dark-400">Guests Count:</span>
                <span className="text-white font-bold">{successReservation.party_size} Guests</span>
              </div>
              <div className="flex justify-between border-b border-dark-800/40 pb-2">
                <span className="text-dark-400">Date:</span>
                <span className="text-white font-bold">{selectedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Time:</span>
                <span className="text-white font-bold">{selectedTime} ({new Date(successReservation.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</span>
              </div>
            </div>

            <p className="text-xs text-dark-400 max-w-md italic">
              * A confirmation notification has been triggered. You will also receive an automated SMS reminder 15 seconds before your scheduled arrival time.
            </p>

            <button 
              onClick={() => {
                setSuccessReservation(null);
                setCheckedAvailability(false);
                setGuestName('');
                setGuestEmail('');
                setGuestPhone('');
              }}
              className="glow-btn px-6 py-2.5 rounded-xl text-sm font-semibold"
            >
              Book Another Table
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-xl flex items-start gap-2 animate-in fade-in">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Check Availability Form */}
            <form onSubmit={handleCheckAvailability} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-dark-300 flex items-center gap-1.5">
                    <Calendar size={13} className="text-dark-400" /> Date
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="glass-input text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-dark-300 flex items-center gap-1.5">
                    <Clock size={13} className="text-dark-400" /> Arrival Time
                  </label>
                  <input
                    type="time"
                    required
                    value={selectedTime}
                    onChange={e => setSelectedTime(e.target.value)}
                    className="glass-input text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-dark-300 flex items-center gap-1.5">
                    <Users size={13} className="text-dark-400" /> Guests
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={12}
                    value={partySize}
                    onChange={e => setPartySize(Number(e.target.value))}
                    className="glass-input text-xs"
                  />
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-dark-300">Area Preference</label>
                  <select
                    value={areaName}
                    onChange={e => setAreaName(e.target.value)}
                    className="glass-input text-xs pr-8 bg-dark-950"
                  >
                    <option value="Indoor">Indoor (Main Hall)</option>
                    <option value="Patio">Patio (Outdoor)</option>
                    <option value="Bar">Bar (High Chairs)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button 
                    type="submit" 
                    disabled={loading}
                    className="glow-btn w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                  >
                    {loading ? 'Searching...' : 'Check Available Tables'}
                  </button>
                </div>

              </div>
            </form>

            {/* Step 2: Customer Details & Booking Trigger */}
            {checkedAvailability && availableTables.length > 0 && (
              <div className="border-t border-dark-800/80 pt-6 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Tables are Available! Provide Your Details to Book:
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300 flex items-center gap-1">
                      <User size={12} className="text-dark-500" /> Contact Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={guestName}
                      onChange={e => setGuestName(e.target.value)}
                      className="glass-input text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300 flex items-center gap-1">
                      <Phone size={12} className="text-dark-500" /> Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="555-0199"
                      value={guestPhone}
                      onChange={e => setGuestPhone(e.target.value)}
                      className="glass-input text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300 flex items-center gap-1">
                      <Mail size={12} className="text-dark-500" /> Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="jane@example.com"
                      value={guestEmail}
                      onChange={e => setGuestEmail(e.target.value)}
                      className="glass-input text-xs"
                    />
                  </div>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="text-left">
                    <span className="text-xs text-emerald-400 font-bold block">Assigned Table Selection</span>
                    <span className="text-[11px] text-dark-300 mt-1 block">
                      We have {availableTables.length} matches. Click below to book the first recommended slot automatically.
                    </span>
                  </div>

                  <button
                    onClick={() => handleBookTable(availableTables[0].table_id, availableTables[0].table_number)}
                    disabled={loading || !guestName || !guestPhone || !guestEmail}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-extrabold transition shrink-0"
                  >
                    {loading ? 'Booking...' : 'Confirm Reservation'}
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
