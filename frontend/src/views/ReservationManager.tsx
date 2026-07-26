import React, { useState, useEffect, useCallback } from 'react';
import { useReservation } from '../hooks/useReservation';
import type { Table as DBTable, Reservation } from '../hooks/useReservation';
import { useAuth } from '../hooks/useAuth';
import { 
  Users, Calendar, Clock, Plus, X, Check, AlertCircle, 
  TrendingUp, BarChart2, MessageSquare, RefreshCw, 
  Sparkles, Mail, Phone, User, CalendarDays, CheckCircle2,
  Trash2, Landmark
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export const ReservationManager: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenantId || 'tenant-hq-1';
  const outletId = user?.outletIds?.[0] || 'outlet-bistro-1';

  const {
    loading,
    error: apiError,
    tables,
    collisionSlots,
    fetchAvailability,
    createBooking,
    updateStatus,
    joinWaitlist,
    fetchReservations,
    fetchWaitlist,
    seatWaitlistEntry,
    updateWaitlistStatus,
    fetchNotifications,
    fetchAnalytics,
    updateTableStatus
  } = useReservation();

  // Active Tab: 'tables' | 'reservations' | 'waitlist' | 'analytics'
  const [activeTab, setActiveTab] = useState<'tables' | 'reservations' | 'waitlist' | 'analytics'>('tables');
  
  // States
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  
  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [partySizeFilter, setPartySizeFilter] = useState<number>(0);
  
  // Form visibility / Modal states
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [seatingWaitlistEntry, setSeatingWaitlistEntry] = useState<any | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Forms
  const [bookingForm, setBookingForm] = useState({
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    party_size: 2,
    table_id: '',
    start_time: '',
    end_time: ''
  });

  const [waitlistForm, setWaitlistForm] = useState({
    guest_name: '',
    guest_phone: '',
    party_size: 2
  });

  // Fetch Data functions
  const loadTables = useCallback(() => {
    fetchAvailability(tenantId, outletId, selectedArea || undefined, partySizeFilter || undefined);
  }, [tenantId, outletId, selectedArea, partySizeFilter, fetchAvailability]);

  const loadReservations = useCallback(async () => {
    try {
      const res = await fetchReservations(tenantId, outletId, selectedDate);
      setReservations(res);
    } catch (err) {
      console.error(err);
    }
  }, [tenantId, outletId, selectedDate, fetchReservations]);

  const loadWaitlist = useCallback(async () => {
    try {
      const wait = await fetchWaitlist(tenantId, outletId, 'Waiting');
      setWaitlist(wait);
    } catch (err) {
      console.error(err);
    }
  }, [tenantId, outletId, fetchWaitlist]);

  const loadNotifications = useCallback(async () => {
    try {
      const notifs = await fetchNotifications(tenantId, outletId);
      setNotifications(notifs);
    } catch (err) {
      // Fail silently for notification polling
    }
  }, [tenantId, outletId, fetchNotifications]);

  const loadAnalytics = useCallback(async () => {
    try {
      // Load current day analytics
      const start = `${selectedDate}T00:00:00Z`;
      const end = `${selectedDate}T23:59:59Z`;
      const data = await fetchAnalytics(tenantId, outletId, start, end);
      setAnalyticsData(data);
    } catch (err) {
      console.error(err);
    }
  }, [tenantId, outletId, selectedDate, fetchAnalytics]);

  // Initial and Poll loaders
  useEffect(() => {
    loadTables();
    loadReservations();
    loadWaitlist();
    loadAnalytics();
    loadNotifications();
  }, [selectedDate, selectedArea, partySizeFilter, loadTables, loadReservations, loadWaitlist, loadAnalytics, loadNotifications]);

  // Periodic polling for real-time cache updates and notifications (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      loadTables();
      loadWaitlist();
      loadNotifications();
      if (activeTab === 'reservations') loadReservations();
      if (activeTab === 'analytics') loadAnalytics();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTab, loadTables, loadWaitlist, loadNotifications, loadReservations, loadAnalytics]);

  // Seeding default table times on selection
  const handleTableSelect = (table: DBTable) => {
    const now = new Date();
    // Round to next 30 minutes
    now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 30), 0, 0);
    const startStr = now.toISOString().substring(0, 16);
    
    now.setHours(now.getHours() + 1); // 1 hour booking duration
    const endStr = now.toISOString().substring(0, 16);

    setBookingForm({
      guest_name: '',
      guest_email: '',
      guest_phone: '',
      party_size: table.capacity,
      table_id: table.table_id,
      start_time: startStr,
      end_time: endStr
    });
    setFormError(null);
    setBookingSuccess(null);
    setShowBookingModal(true);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBookingSuccess(null);

    // Parse timezone offset for ISO string
    const startISO = new Date(bookingForm.start_time).toISOString();
    const endISO = new Date(bookingForm.end_time).toISOString();

    try {
      await createBooking({
        tenant_id: tenantId,
        outlet_id: outletId,
        table_id: bookingForm.table_id,
        guest_name: bookingForm.guest_name,
        guest_email: bookingForm.guest_email,
        guest_phone: bookingForm.guest_phone,
        party_size: bookingForm.party_size,
        start_time: startISO,
        end_time: endISO
      });

      setBookingSuccess('Reservation booked successfully!');
      setTimeout(() => {
        setShowBookingModal(false);
        setBookingSuccess(null);
      }, 1500);

      // Reload
      loadTables();
      loadReservations();
      loadAnalytics();
      loadNotifications();
    } catch (err: any) {
      setFormError(err.message || 'Booking conflict or database issue.');
    }
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await joinWaitlist({
        tenant_id: tenantId,
        outlet_id: outletId,
        guest_name: waitlistForm.guest_name,
        guest_phone: waitlistForm.guest_phone,
        party_size: waitlistForm.party_size
      });
      
      setBookingSuccess('Guest added to waitlist!');
      setTimeout(() => {
        setShowWaitlistModal(false);
        setBookingSuccess(null);
        setWaitlistForm({ guest_name: '', guest_phone: '', party_size: 2 });
      }, 1500);

      loadWaitlist();
      loadNotifications();
    } catch (err: any) {
      setFormError(err.message || 'Failed to join waitlist.');
    }
  };

  const handleReservationStatusChange = async (resId: string, newStatus: string) => {
    try {
      await updateStatus(resId, newStatus);
      loadReservations();
      loadTables();
      loadAnalytics();
      loadNotifications();
    } catch (err: any) {
      alert(`Error updating reservation: ${err.message}`);
    }
  };

  const handleWaitlistSeat = async (tableId: string) => {
    if (!seatingWaitlistEntry) return;
    try {
      await seatWaitlistEntry(seatingWaitlistEntry.id, tableId);
      setSeatingWaitlistEntry(null);
      loadWaitlist();
      loadTables();
      loadReservations();
      loadAnalytics();
      loadNotifications();
    } catch (err: any) {
      alert(`Error seating waitlist guest: ${err.message}`);
    }
  };

  const handleWaitlistCancel = async (entryId: string) => {
    try {
      await updateWaitlistStatus(entryId, 'Cancelled');
      loadWaitlist();
      loadNotifications();
    } catch (err: any) {
      alert(`Error cancelling waitlist entry: ${err.message}`);
    }
  };

  const handleMarkAvailable = async (tableId: string) => {
    try {
      await updateTableStatus(tableId, 'Available');
      loadTables();
    } catch (err: any) {
      alert(`Error updating table status: ${err.message}`);
    }
  };

  const handleSendReminder = async (res: Reservation) => {
    try {
      const timeStr = new Date(res.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msg = `Hi ${res.guest_name}, this is a reminder for your reservation today for Table T${res.table_number || ''} at ${timeStr}. We look forward to seeing you!`;
      
      const response = await fetch(`${API_BASE}/api/v1/reservations/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          outlet_id: outletId,
          type: 'Reservation Reminder',
          recipient: `${res.guest_name} (${res.guest_phone})`,
          message: msg
        })
      });
      if (!response.ok) throw new Error(await response.text());
      alert(`Manual reminder sent successfully to ${res.guest_name}!`);
      loadNotifications();
    } catch (err: any) {
      alert(`Error sending reminder: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 p-4 md:p-8 flex flex-col lg:flex-row gap-6">
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white font-display flex items-center gap-2">
              <CalendarDays className="text-brand-400" /> Hostess Hub & Queue
            </h1>
            <p className="text-dark-400 text-sm mt-1">Real-time table occupancy, bookings engine, and waitlist dispatcher</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => { loadTables(); loadReservations(); loadWaitlist(); loadNotifications(); }}
              className="glass-card hover:bg-dark-800 p-2.5 rounded-xl transition text-dark-300 hover:text-white"
              title="Refresh Data"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin text-brand-400' : ''} />
            </button>
            <button
              onClick={() => {
                setWaitlistForm({ guest_name: '', guest_phone: '', party_size: 2 });
                setFormError(null);
                setShowWaitlistModal(true);
              }}
              className="glass-card border border-brand-500/30 text-brand-300 hover:bg-brand-500/10 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition"
            >
              <Users size={16} /> Waitlist Walk-in
            </button>
            <button
              onClick={() => {
                setBookingForm({
                  guest_name: '',
                  guest_email: '',
                  guest_phone: '',
                  party_size: 2,
                  table_id: tables[0]?.table_id || '',
                  start_time: new Date().toISOString().substring(0, 16),
                  end_time: new Date(Date.now() + 3600000).toISOString().substring(0, 16)
                });
                setFormError(null);
                setBookingSuccess(null);
                setShowBookingModal(true);
              }}
              className="glow-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition"
            >
              <Plus size={16} /> Book Table
            </button>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex border-b border-dark-800 gap-2">
          {[
            { id: 'tables', label: 'Tables & Status', icon: Landmark },
            { id: 'reservations', label: 'Bookings List', icon: Calendar },
            { id: 'waitlist', label: `Active Waitlist (${waitlist.length})`, icon: Users },
            { id: 'analytics', label: 'Insights & Analytics', icon: BarChart2 }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition font-display ${
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

        {/* Tab Contents */}
        <div className="flex-1">
          
          {/* TAB 1: TABLES GRID */}
          {activeTab === 'tables' && (
            <div className="flex flex-col gap-6">
              {/* Occupancy Summary Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass-panel border border-emerald-500/20 bg-emerald-500/5 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-emerald-400 block font-bold">Available</span>
                    <span className="text-2xl font-extrabold text-white mt-1 font-mono">
                      {tables.filter(t => t.status === 'Available').length} Tables
                    </span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                </div>

                <div className="glass-panel border border-amber-500/20 bg-amber-500/5 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-amber-400 block font-bold">Reserved</span>
                    <span className="text-2xl font-extrabold text-white mt-1 font-mono">
                      {tables.filter(t => t.status === 'Reserved').length} Tables
                    </span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]"></span>
                </div>

                <div className="glass-panel border border-purple-500/20 bg-purple-500/5 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-purple-400 block font-bold">Occupied</span>
                    <span className="text-2xl font-extrabold text-white mt-1 font-mono">
                      {tables.filter(t => t.status === 'Occupied').length} Tables
                    </span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]"></span>
                </div>

                <div className="glass-panel border border-cyan-500/20 bg-cyan-500/5 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-cyan-400 block font-bold">Cleaning</span>
                    <span className="text-2xl font-extrabold text-white mt-1 font-mono">
                      {tables.filter(t => t.status === 'Cleaning').length} Tables
                    </span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]"></span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap gap-4 items-center bg-dark-900/30 p-4 rounded-xl border border-dark-800/80">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Area Filter</label>
                  <select 
                    value={selectedArea} 
                    onChange={e => setSelectedArea(e.target.value)}
                    className="glass-input text-xs py-1.5 pr-8 bg-dark-950"
                  >
                    <option value="">All Areas</option>
                    <option value="Indoor">Indoor</option>
                    <option value="Patio">Patio</option>
                    <option value="Bar">Bar</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Min Capacity</label>
                  <select 
                    value={partySizeFilter} 
                    onChange={e => setPartySizeFilter(Number(e.target.value))}
                    className="glass-input text-xs py-1.5 pr-8 bg-dark-950"
                  >
                    <option value={0}>Any Size</option>
                    <option value={2}>2+ Guests</option>
                    <option value={4}>4+ Guests</option>
                    <option value={6}>6+ Guests</option>
                  </select>
                </div>

                <div className="ml-auto text-xs text-dark-400 flex gap-4">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Available</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> Reserved</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block"></span> Occupied</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block"></span> Cleaning</span>
                </div>
              </div>

              {/* Table Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-6">
                {tables.map(table => {
                  let statusBg = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:border-emerald-500/40';
                  let statusBadge = 'bg-emerald-500/20 text-emerald-300';
                  if (table.status === 'Reserved') {
                    statusBg = 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:border-amber-500/40';
                    statusBadge = 'bg-amber-500/20 text-amber-300';
                  } else if (table.status === 'Occupied') {
                    statusBg = 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:border-purple-500/40';
                    statusBadge = 'bg-purple-500/20 text-purple-300';
                  } else if (table.status === 'Cleaning') {
                    statusBg = 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:border-cyan-500/40';
                    statusBadge = 'bg-cyan-500/20 text-cyan-300';
                  }

                  return (
                    <div 
                      key={table.table_id} 
                      className={`glass-panel border rounded-2xl p-5 flex flex-col justify-between h-48 transition cursor-pointer relative group ${statusBg}`}
                      onClick={() => table.status === 'Available' ? handleTableSelect(table) : table.status === 'Cleaning' ? handleMarkAvailable(table.table_id) : null}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-extrabold text-2xl font-display text-white group-hover:scale-105 transition-transform block">
                            {table.table_number}
                          </span>
                          <span className="text-[10px] text-dark-400 font-mono tracking-wider uppercase block mt-0.5">
                            {table.area_name}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge}`}>
                          {table.status}
                        </span>
                      </div>

                      {/* Display upcoming bookings or capacity */}
                      <div className="mt-4 flex-1 flex flex-col justify-end">
                        {table.upcoming_bookings && table.upcoming_bookings.length > 0 ? (
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-mono text-dark-400 block mb-1">Bookings Today:</span>
                            {table.upcoming_bookings.map((booking, i) => {
                              const time = new Date(booking.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              return (
                                <span key={i} className="text-[10px] bg-dark-900/60 border border-dark-800 text-dark-300 rounded px-1.5 py-0.5 block font-mono">
                                  {time}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-dark-400 text-xs italic">
                            No upcoming bookings
                          </div>
                        )}
                      </div>

                      <div className="border-t border-dark-800/40 pt-3 mt-3 flex justify-between items-center text-xs text-dark-300">
                        <span className="flex items-center gap-1"><Users size={12} /> Max {table.capacity}</span>
                        {table.status === 'Available' && (
                          <span className="text-[10px] text-brand-400 group-hover:underline font-semibold">Book Now →</span>
                        )}
                        {table.status === 'Cleaning' && (
                          <span className="text-[10px] text-cyan-400 group-hover:underline font-semibold font-bold animate-pulse">Finish Cleaning →</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: BOOKINGS LIST */}
          {activeTab === 'reservations' && (
            <div className="glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col">
              
              {/* Filter controls */}
              <div className="flex flex-wrap items-center justify-between p-6 gap-4 border-b border-dark-800/80 bg-dark-900/10">
                <div className="flex gap-4 items-center">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Reservation Date</label>
                    <input 
                      type="date" 
                      value={selectedDate} 
                      onChange={e => setSelectedDate(e.target.value)}
                      className="glass-input text-xs py-1.5 pr-4 bg-dark-950 text-white fill-white"
                    />
                  </div>
                </div>
                <span className="text-xs text-dark-400 font-mono">
                  Showing {reservations.length} bookings for {new Date(selectedDate).toLocaleDateString(undefined, {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-dark-300">
                  <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                    <tr>
                      <th className="px-6 py-4">Guest</th>
                      <th className="px-6 py-4">Table</th>
                      <th className="px-6 py-4">Party Size</th>
                      <th className="px-6 py-4">Time Slot</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/40">
                    {reservations.length > 0 ? (
                      reservations.map(res => {
                        let statusColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                        if (res.status === 'Seated') statusColor = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
                        if (res.status === 'Cleared') statusColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                        if (res.status === 'No Show') statusColor = 'bg-red-500/10 text-red-400 border border-red-500/20';
                        if (res.status === 'Cancelled') statusColor = 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';

                        const startTime = new Date(res.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        const endTime = new Date(res.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                        return (
                          <tr key={res.id} className="hover:bg-dark-900/20 transition">
                            <td className="px-6 py-4">
                              <div>
                                <span className="font-semibold text-white block">{res.guest_name}</span>
                                <span className="text-xs text-dark-400 flex items-center gap-1.5 mt-0.5 font-mono">
                                  <Phone size={10} /> {res.guest_phone}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-bold text-white bg-dark-900 px-2.5 py-1 rounded-lg border border-dark-800 font-mono text-xs">
                                T{res.table_number}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono font-semibold text-white">{res.party_size} Guests</td>
                            <td className="px-6 py-4 font-mono text-xs">
                              {startTime} - {endTime}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                                {res.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                {res.status === 'Reserved' && (
                                  <>
                                    <button
                                      onClick={() => handleSendReminder(res)}
                                      className="bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                                      title="Send Manual Reminder SMS"
                                    >
                                      <Clock size={12} /> Remind
                                    </button>
                                    <button
                                      onClick={() => handleReservationStatusChange(res.id, 'Seated')}
                                      className="bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                                    >
                                      <Check size={12} /> Seat
                                    </button>
                                    <button
                                      onClick={() => handleReservationStatusChange(res.id, 'No Show')}
                                      className="bg-red-950/40 hover:bg-red-900/30 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                                    >
                                      No-Show
                                    </button>
                                    <button
                                      onClick={() => handleReservationStatusChange(res.id, 'Cancelled')}
                                      className="bg-dark-900 hover:bg-dark-800 text-dark-300 border border-dark-800 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                )}
                                {res.status === 'Seated' && (
                                  <button
                                    onClick={() => handleReservationStatusChange(res.id, 'Cleared')}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                                  >
                                    <CheckCircle2 size={12} /> Clear Table
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-dark-400 italic">
                          No reservations found for this date.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: WAITLIST & WALK-INS */}
          {activeTab === 'waitlist' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* Waitlist Entries List */}
              <div className="xl:col-span-2 glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col gap-4">
                <h3 className="text-lg font-bold text-white font-display mb-2 flex items-center gap-2">
                  <Users size={18} className="text-brand-400" /> Active Walk-in Waitlist
                </h3>
                
                {waitlist.length > 0 ? (
                  <div className="space-y-4">
                    {waitlist.map((entry, idx) => (
                      <div 
                        key={entry.id}
                        className={`glass-card p-4 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition ${
                          seatingWaitlistEntry?.id === entry.id ? 'border-brand-500/60 shadow-lg shadow-brand-500/5' : 'border-dark-800'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-white text-base">{entry.guest_name}</span>
                            <span className="text-[10px] bg-dark-900 border border-dark-800 text-dark-300 font-mono px-2 py-0.5 rounded-full font-bold">
                              Party of {entry.party_size}
                            </span>
                          </div>
                          
                          <div className="flex gap-4 text-xs text-dark-400 mt-2 font-mono">
                            <span className="flex items-center gap-1"><Phone size={12} /> {entry.guest_phone}</span>
                            <span>Added: {new Date(entry.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 self-stretch md:self-auto justify-between border-t border-dark-800/40 md:border-none pt-3 md:pt-0">
                          <div className="text-left md:text-right">
                            <span className="text-[10px] text-dark-400 uppercase font-mono block">Estimated Wait</span>
                            <span className="text-lg font-extrabold text-brand-300 font-mono">{entry.estimated_wait_minutes} min</span>
                          </div>
                          
                          <div className="flex gap-2">
                            {seatingWaitlistEntry?.id === entry.id ? (
                              <button
                                onClick={() => setSeatingWaitlistEntry(null)}
                                className="bg-dark-900 hover:bg-dark-800 text-dark-300 border border-dark-800 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                              >
                                Cancel Seating
                              </button>
                            ) : (
                              <button
                                onClick={() => setSeatingWaitlistEntry(entry)}
                                className="bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                              >
                                <Check size={12} /> Seat Guest
                              </button>
                            )}
                            
                            <button
                              onClick={() => handleWaitlistCancel(entry.id)}
                              className="bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/10 hover:border-red-500/30 p-1.5 rounded-lg transition"
                              title="Cancel Entry"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-dark-400 italic">
                    Waitlist is currently empty.
                  </div>
                )}
              </div>

              {/* Seating Dispatcher Panel */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col gap-4">
                <h3 className="text-lg font-bold text-white font-display mb-2 flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-brand-400" /> Seat Waitlist Guest
                </h3>
                
                {seatingWaitlistEntry ? (
                  <div className="flex flex-col gap-4">
                    <div className="bg-brand-950/20 border border-brand-500/20 p-4 rounded-xl">
                      <span className="text-xs text-brand-400 uppercase font-mono block">Currently Seating</span>
                      <span className="text-lg font-bold text-white mt-0.5 block">{seatingWaitlistEntry.guest_name}</span>
                      <span className="text-xs text-dark-300 block mt-1">Party Size: {seatingWaitlistEntry.party_size} guests</span>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-mono uppercase tracking-wider text-dark-400 block mb-1">Select Available Table:</span>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {tables.filter(t => t.status === 'Available' && t.capacity >= seatingWaitlistEntry.party_size).length > 0 ? (
                          tables.filter(t => t.status === 'Available' && t.capacity >= seatingWaitlistEntry.party_size).map(table => (
                            <button
                              key={table.table_id}
                              onClick={() => handleWaitlistSeat(table.table_id)}
                              className="w-full text-left bg-dark-900/60 hover:bg-emerald-950/20 border border-dark-800 hover:border-emerald-500/40 p-3 rounded-xl flex justify-between items-center transition"
                            >
                              <div>
                                <span className="font-extrabold text-white text-base">Table {table.table_number}</span>
                                <span className="text-[10px] text-dark-400 block mt-0.5">{table.area_name} • Max {table.capacity}</span>
                              </div>
                              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-semibold">
                                Seat Here
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="text-xs text-dark-400 italic bg-dark-900/40 p-4 rounded-lg border border-dark-800/80 text-center">
                            No available tables with matching capacity (needs min {seatingWaitlistEntry.party_size}). Clear occupied tables or seat when available.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-dark-400 italic py-12">
                    <AlertCircle size={32} className="text-dark-600 mb-2" />
                    <span className="text-xs px-6">Select "Seat Guest" on any waitlist entry to assign an available table.</span>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 4: INSIGHTS & ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="flex flex-col gap-6">
              
              {/* Date Control */}
              <div className="flex flex-wrap items-center bg-dark-900/30 p-4 rounded-xl border border-dark-800/80 justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Telemetry Date</label>
                  <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={e => setSelectedDate(e.target.value)}
                    className="glass-input text-xs py-1.5 pr-4 bg-dark-950 text-white fill-white"
                  />
                </div>
                <span className="text-xs text-dark-400 font-mono">
                  Analytics Snapshot for: {new Date(selectedDate).toLocaleDateString()}
                </span>
              </div>

              {analyticsData ? (
                <>
                  {/* Grid Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                    <div className="glass-panel rounded-2xl p-5 flex flex-col border border-dark-800">
                      <span className="text-xs text-dark-400 uppercase font-mono tracking-wider">Total Bookings</span>
                      <span className="text-3xl font-extrabold text-white mt-2">{analyticsData.total_reservations}</span>
                      <span className="text-[10px] text-dark-400 block mt-2">Active or completed</span>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex flex-col border border-dark-800">
                      <span className="text-xs text-dark-400 uppercase font-mono tracking-wider">Seated Parties</span>
                      <span className="text-3xl font-extrabold text-purple-400 mt-2">{analyticsData.seated_count}</span>
                      <span className="text-[10px] text-dark-400 block mt-2">Walk-ins and booked</span>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex flex-col border border-dark-800">
                      <span className="text-xs text-dark-400 uppercase font-mono tracking-wider">Cancellations</span>
                      <span className="text-3xl font-extrabold text-zinc-400 mt-2">{analyticsData.cancellations}</span>
                      <span className="text-[10px] text-dark-400 block mt-2">Released bookings</span>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex flex-col border border-dark-800">
                      <span className="text-xs text-dark-400 uppercase font-mono tracking-wider">No-Show Rate</span>
                      <span className="text-3xl font-extrabold text-red-400 mt-2">
                        {(analyticsData.no_show_rate * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-dark-400 block mt-2">
                        {analyticsData.no_shows} expired
                      </span>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex flex-col border border-dark-800">
                      <span className="text-xs text-dark-400 uppercase font-mono tracking-wider">Avg Guests</span>
                      <span className="text-3xl font-extrabold text-blue-400 mt-2">{analyticsData.average_guests || 0}</span>
                      <span className="text-[10px] text-dark-400 block mt-2">Average party size</span>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 flex flex-col border border-dark-800">
                      <span className="text-xs text-dark-400 uppercase font-mono tracking-wider">Utilization</span>
                      <span className="text-3xl font-extrabold text-cyan-400 mt-2">
                        {analyticsData.table_utilization || 0}%
                      </span>
                      <span className="text-[10px] text-dark-400 block mt-2">Seated tables ratio</span>
                    </div>
                  </div>

                  {/* Hourly Distribution graph */}
                  <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col gap-6">
                    <h3 className="text-lg font-bold text-white font-display flex items-center gap-2">
                      <TrendingUp size={18} className="text-brand-400" /> Peak Hour Reservations Distribution
                    </h3>

                    {Object.keys(analyticsData.peak_hour_distribution).length > 0 ? (
                      <div className="flex items-end gap-2.5 h-64 pt-6 px-4 border-b border-l border-dark-800">
                        {Array.from({ length: 24 }).map((_, hour) => {
                          const count = analyticsData.peak_hour_distribution[hour] || 0;
                          const maxCount = Math.max(...Object.values(analyticsData.peak_hour_distribution) as number[], 1);
                          const heightPercent = (count / maxCount) * 100;
                          
                          // Only render active restaurant hours (e.g. 11am to 11pm) for screen space
                          if (hour < 11 || hour > 23) return null;
                          const formattedHour = hour > 12 ? `${hour - 12} PM` : `${hour} AM`;

                          return (
                            <div key={hour} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                              <span className="text-[10px] font-mono text-brand-300 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                {count}
                              </span>
                              <div 
                                style={{ height: `${heightPercent || 2}%` }}
                                className={`w-full rounded-t-lg transition-all duration-300 ${
                                  count > 0 ? 'bg-gradient-to-t from-brand-600 to-brand-400 group-hover:from-brand-500 group-hover:to-brand-300' : 'bg-dark-900'
                                }`}
                              ></div>
                              <span className="text-[10px] font-mono text-dark-400 uppercase select-none mt-2 truncate w-full text-center">
                                {formattedHour}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-20 text-dark-400 italic">
                        No peak hour telemetry recorded on this date.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-20 text-dark-400 italic">
                  Loading analytics snapshot...
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* Side Column: Notification & Live SMS Feed */}
      <aside className="w-full lg:w-96 glass-panel border border-dark-800 rounded-3xl p-6 flex flex-col h-[calc(100vh-4rem)] lg:sticky lg:top-8 max-h-[750px]">
        <div className="flex justify-between items-center border-b border-dark-800/80 pb-4 mb-4">
          <h3 className="text-lg font-bold text-white font-display flex items-center gap-2">
            <MessageSquare size={18} className="text-brand-300 animate-pulse" /> Live SMS & Alerts
          </h3>
          <span className="text-[9px] bg-brand-500/10 text-brand-300 border border-brand-500/20 px-2 py-0.5 rounded-full font-mono font-bold tracking-wider uppercase">
            Simulated
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {notifications.length > 0 ? (
            notifications.map((n, i) => {
              const time = new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'});
              let badgeColor = 'bg-brand-500/20 text-brand-300';
              if (n.type === 'Reservation Confirmed') badgeColor = 'bg-emerald-500/20 text-emerald-300';
              if (n.type === 'Reservation Reminder') badgeColor = 'bg-amber-500/20 text-amber-300';
              if (n.type === 'Table Ready') badgeColor = 'bg-purple-500/20 text-purple-300';
              if (n.type === 'Reservation Cancelled') badgeColor = 'bg-red-500/20 text-red-300';
              if (n.type === 'Waitlist Confirmed') badgeColor = 'bg-indigo-500/20 text-indigo-300';
              if (n.type === 'Low Stock Alert') badgeColor = 'bg-red-500/20 text-red-400 border border-red-500/30';
              if (n.type === 'Employee Checked In') badgeColor = 'bg-teal-500/20 text-teal-300';
              if (n.type === 'Daily Sales Summary') badgeColor = 'bg-cyan-500/20 text-cyan-300';
              if (n.type === 'New Reservation Received') badgeColor = 'bg-pink-500/20 text-pink-300';

              return (
                <div key={i} className="glass-card p-3 rounded-xl border border-dark-800/80 hover:border-dark-700/80 transition flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono ${badgeColor}`}>
                      {n.type}
                    </span>
                    <span className="text-[9px] text-dark-400 font-mono">{time}</span>
                  </div>
                  
                  <span className="text-[10px] text-dark-300 font-mono flex items-center gap-1">
                    <Phone size={10} className="text-dark-500" /> To: {n.recipient}
                  </span>
                  
                  <p className="text-dark-200 bg-dark-950/60 p-2.5 rounded-lg border border-dark-900 italic leading-relaxed mt-1 font-mono text-[11px]">
                    "{n.message}"
                  </p>
                </div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-dark-400 italic py-12">
              <span className="text-xs">No SMS logs recorded. Book a table or add waitlists to trigger simulated notifications.</span>
            </div>
          )}
        </div>
      </aside>

      {/* MODAL 1: BOOKING CREATOR */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-panel border border-dark-800 rounded-3xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex justify-between items-center border-b border-dark-800/60 pb-3">
              <h3 className="text-lg font-bold text-white font-display flex items-center gap-1.5">
                <CalendarDays size={18} className="text-brand-400" /> Book Table Reservation
              </h3>
              <button 
                onClick={() => setShowBookingModal(false)}
                className="text-dark-400 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            {bookingSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center text-center text-emerald-400 animate-pulse gap-3">
                <CheckCircle2 size={48} />
                <span className="font-bold text-lg">{bookingSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} className="space-y-4">
                
                {formError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Alternative Slots Warning Render */}
                {collisionSlots.length > 0 && (
                  <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-purple-300 flex items-center gap-1.5 mb-2">
                      <Sparkles size={14} /> Collision Alert: Table Already Booked
                    </h4>
                    <span className="text-[10px] text-purple-400/90 block mb-3">
                      Select one of these alternative slots available on matching/similar tables:
                    </span>
                    <div className="grid grid-cols-1 gap-2 max-h-[140px] overflow-y-auto">
                      {collisionSlots.map((slot, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setBookingForm(prev => ({
                              ...prev,
                              table_id: slot.table_id,
                              start_time: slot.start_time.substring(0, 16),
                              end_time: slot.end_time.substring(0, 16),
                            }));
                            setFormError(null);
                          }}
                          className="text-xs text-left bg-dark-900/80 hover:bg-purple-900/20 border border-dark-800 hover:border-purple-500/40 p-2.5 rounded-lg text-dark-200 hover:text-white transition flex justify-between items-center"
                        >
                          <div>
                            <span className="font-bold block text-white">Table {slot.table_number} ({slot.area_name})</span>
                            <span className="text-[10px] text-dark-400">
                              {new Date(slot.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(slot.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          </div>
                          <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-mono uppercase font-bold">Use Slot</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300">Guest Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={bookingForm.guest_name}
                      onChange={e => setBookingForm(prev => ({ ...prev, guest_name: e.target.value }))}
                      className="glass-input"
                    />
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300">Guest Phone</label>
                    <input
                      type="tel"
                      required
                      placeholder="555-0199"
                      value={bookingForm.guest_phone}
                      onChange={e => setBookingForm(prev => ({ ...prev, guest_phone: e.target.value }))}
                      className="glass-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300">Guest Email</label>
                    <input
                      type="email"
                      required
                      placeholder="jane@example.com"
                      value={bookingForm.guest_email}
                      onChange={e => setBookingForm(prev => ({ ...prev, guest_email: e.target.value }))}
                      className="glass-input"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300">Party Size</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={bookingForm.party_size}
                      onChange={e => setBookingForm(prev => ({ ...prev, party_size: Number(e.target.value) }))}
                      className="glass-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300">Start Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={bookingForm.start_time}
                      onChange={e => setBookingForm(prev => ({ ...prev, start_time: e.target.value }))}
                      className="glass-input"
                    />
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-dark-300">End Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={bookingForm.end_time}
                      onChange={e => setBookingForm(prev => ({ ...prev, end_time: e.target.value }))}
                      className="glass-input"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-dark-300">Assigned Table ID</label>
                  <select
                    value={bookingForm.table_id}
                    onChange={e => setBookingForm(prev => ({ ...prev, table_id: e.target.value }))}
                    className="glass-input pr-8 bg-dark-950"
                  >
                    {tables.map(t => (
                      <option key={t.table_id} value={t.table_id}>
                        Table {t.table_number} ({t.area_name}) - Cap: {t.capacity}
                      </option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="glow-btn w-full mt-4 flex items-center justify-center gap-2"
                >
                  {loading && <RefreshCw size={16} className="animate-spin" />}
                  <span>Book Reservation</span>
                </button>

              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: WAITLIST ADDITION */}
      {showWaitlistModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-panel border border-dark-800 rounded-3xl w-full max-w-md p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex justify-between items-center border-b border-dark-800/60 pb-3">
              <h3 className="text-lg font-bold text-white font-display flex items-center gap-1.5">
                <Users size={18} className="text-brand-400" /> Add Walk-in to Waitlist
              </h3>
              <button 
                onClick={() => setShowWaitlistModal(false)}
                className="text-dark-400 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            {bookingSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center text-center text-emerald-400 animate-pulse gap-3">
                <CheckCircle2 size={48} />
                <span className="font-bold text-lg">{bookingSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                
                {formError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-dark-300">Guest Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Jane Smith"
                    value={waitlistForm.guest_name}
                    onChange={e => setWaitlistForm(prev => ({ ...prev, guest_name: e.target.value }))}
                    className="glass-input"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-dark-300">Guest Phone</label>
                  <input
                    type="tel"
                    required
                    placeholder="555-4321"
                    value={waitlistForm.guest_phone}
                    onChange={e => setWaitlistForm(prev => ({ ...prev, guest_phone: e.target.value }))}
                    className="glass-input"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-dark-300">Party Size</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={waitlistForm.party_size}
                    onChange={e => setWaitlistForm(prev => ({ ...prev, party_size: Number(e.target.value) }))}
                    className="glass-input"
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="glow-btn w-full mt-4 flex items-center justify-center gap-2"
                >
                  {loading && <RefreshCw size={16} className="animate-spin" />}
                  <span>Join Waitlist</span>
                </button>

              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
