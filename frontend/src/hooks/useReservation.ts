import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export interface Table {
  table_id: string;
  table_number: string;
  capacity: number;
  area_name: string;
  status: string;
  upcoming_bookings: Array<{
    reservation_id: string;
    start_time: string;
    end_time: string;
  }>;
}

export interface Reservation {
  id: string;
  tenant_id: string;
  outlet_id: string;
  table_id: string;
  table_number?: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  party_size: number;
  start_time: string;
  end_time: string;
  status: 'Reserved' | 'Seated' | 'Cleared' | 'No Show' | 'Cancelled';
}

export const useReservation = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [collisionSlots, setCollisionSlots] = useState<any[]>([]);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('dineiq_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }, []);

  const fetchAvailability = useCallback(async (tenantId: string, outletId: string, areaName?: string, partySize?: number) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/api/v1/tables/availability?tenant_id=${tenantId}&outlet_id=${outletId}`;
      if (areaName) url += `&area_name=${areaName}`;
      if (partySize) url += `&party_size=${partySize}`;

      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTables(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch table availability');
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const createBooking = useCallback(async (bookingData: Omit<Reservation, 'id' | 'status'>) => {
    setLoading(true);
    setError(null);
    setCollisionSlots([]);
    try {
      const res = await fetch(`${API_BASE}/api/v1/reservations`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(bookingData),
      });

      if (res.status === 409) {
        const errData = await res.json();
        setCollisionSlots(errData.detail?.alternative_slots || []);
        throw new Error(errData.detail?.error || 'Table booking collision');
      }

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data as Reservation;
    } catch (err: any) {
      setError(err.message || 'Failed to create reservation');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const updateStatus = useCallback(async (reservationId: string, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/reservations/${reservationId}/status`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data as Reservation;
    } catch (err: any) {
      setError(err.message || 'Failed to update reservation status');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const joinWaitlist = useCallback(async (waitlistData: { tenant_id: string; outlet_id: string; guest_name: string; guest_phone: string; party_size: number }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/waitlist`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(waitlistData),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to add walk-in guest to waitlist');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchReservations = useCallback(async (tenantId: string, outletId: string, date?: string, status?: string) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/api/v1/reservations?tenant_id=${tenantId}&outlet_id=${outletId}`;
      if (date) url += `&date=${date}`;
      if (status) url += `&status=${status}`;
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reservations');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchWaitlist = useCallback(async (tenantId: string, outletId: string, status?: string) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/api/v1/waitlist?tenant_id=${tenantId}&outlet_id=${outletId}`;
      if (status) url += `&status=${status}`;
      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch waitlist');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const seatWaitlistEntry = useCallback(async (entryId: string, tableId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/waitlist/${entryId}/seat`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ table_id: tableId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (err: any) {
      setError(err.message || 'Failed to seat waitlist entry');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const updateWaitlistStatus = useCallback(async (entryId: string, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/waitlist/${entryId}/status`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (err: any) {
      setError(err.message || 'Failed to update waitlist status');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchNotifications = useCallback(async (tenantId: string, outletId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/reservations/notifications?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch notifications');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchAnalytics = useCallback(async (tenantId: string, outletId: string, startDate: string, endDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/analytics/reservations?tenant_id=${tenantId}&outlet_id=${outletId}&start_date=${startDate}&end_date=${endDate}`,
        { headers: getHeaders() }
      );
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reservation analytics');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const updateTableStatus = useCallback(async (tableId: string, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/tables/${tableId}/status`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to update table status');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  return {
    loading,
    error,
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
    updateTableStatus,
  };
};
