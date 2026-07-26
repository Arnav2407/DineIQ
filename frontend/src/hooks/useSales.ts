import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export interface MenuItem {
  id?: string;
  tenant_id?: string;
  outlet_id?: string;
  sku: string;
  name: string;
  price: number;
  cost: number;
}

export interface CustomerBillItem {
  sku: string;
  quantity: number;
  unit_price?: number;
}

export interface CustomerBillPayload {
  tenant_id: string;
  outlet_id: string;
  transaction_id: string;
  payment_method: string;
  table_area: string;
  customer_count?: number;
  is_reservation?: boolean;
  items: CustomerBillItem[];
}

export interface DishAnalysis {
  sku: string;
  name: string;
  selling_price: number;
  ingredient_cost: number;
  unit_contribution_margin: number;
  total_contribution_margin: number;
  margin_percentage: number;
  quantity_sold: number;
  total_revenue: number;
}

export interface MealPeriodSummary {
  revenue: number;
  bills_count: number;
  avg_bill_value: number;
}

export interface TableAreaPerformance {
  table_area: string;
  revenue: number;
  total_orders: number;
  customers_served: number;
  avg_bill_value: number;
  occupancy_rate_pct: number;
  avg_dining_time_mins: number;
  reservation_ratio_pct: number;
}

export interface RecentInvoiceItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
}

export interface RecentInvoice {
  invoice_number: string;
  transaction_time: string;
  meal_period: string;
  payment_method: string;
  table_area: string;
  customer_count: number;
  total_amount: number;
  items: RecentInvoiceItem[];
}

export interface SalesTrendsResponse {
  date: string;
  revenue: number;
  comparisons: {
    day_over_day: { previous_revenue: number; growth_percentage: number };
    week_over_week: { previous_revenue: number; growth_percentage: number };
    month_over_month: { previous_revenue: number; growth_percentage: number };
  };
}

export interface SalesDashboardAnalytics {
  tenant_id: string;
  outlet_id: string;
  total_revenue: number;
  total_items_sold: number;
  total_bills: number;
  average_bill_value: number;
  dishes_revenue_analysis: DishAnalysis[];
  top_performing_items: DishAnalysis[];
  low_performing_items: DishAnalysis[];
  meal_period_analysis: Record<string, MealPeriodSummary>;
  table_area_performance: TableAreaPerformance[];
  daily_sales_trends: Array<{ date: string; revenue: number; orders: number }>;
  peak_sales_day: string;
  lowest_sales_day: string;
  sync_sentinel_alert: boolean;
  sync_alert_packet?: any;
}

export const useSales = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [invoices, setInvoices] = useState<RecentInvoice[]>([]);
  const [analytics, setAnalytics] = useState<SalesDashboardAnalytics | null>(null);
  const [trends, setTrends] = useState<SalesTrendsResponse | null>(null);
  const [syncOfflineAlert, setSyncOfflineAlert] = useState<boolean>(false);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('dineiq_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }, []);

  const fetchMenuItems = useCallback(async (tenantId: string, outletId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/sales/menu-items?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMenuItems(data);
    } catch (err: any) {
      console.error('Failed to fetch menu items:', err);
    }
  }, [getHeaders]);

  const saveMenuItem = useCallback(async (item: MenuItem) => {
    setLoading(true);
    try {
      const isEdit = Boolean(item.id);
      const url = isEdit 
        ? `${API_BASE}/api/v1/sales/menu-items/${item.id}`
        : `${API_BASE}/api/v1/sales/menu-items`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const recordCustomerBill = useCallback(async (payload: CustomerBillPayload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/sales/bill`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to record bill');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchInvoices = useCallback(async (tenantId: string, outletId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/sales/invoices?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInvoices(data);
    } catch (err: any) {
      console.error('Failed to fetch invoices:', err);
    }
  }, [getHeaders]);

  const fetchDashboardAnalytics = useCallback(async (tenantId: string, outletId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/sales/dashboard-analytics?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAnalytics(data);
      setSyncOfflineAlert(data.sync_sentinel_alert || false);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch sales analytics');
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchTrends = useCallback(async (tenantId: string, outletId: string, targetDate?: string) => {
    setLoading(true);
    setError(null);
    const dateStr = targetDate || new Date().toISOString().split('T')[0];
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/sales/trends?tenant_id=${tenantId}&outlet_id=${outletId}&target_date=${dateStr}`,
        { headers: getHeaders() }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTrends(data);
    } catch (err: any) {
      console.error('Failed to fetch sales trends:', err);
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  return {
    loading,
    error,
    menuItems,
    invoices,
    analytics,
    trends,
    syncOfflineAlert,
    fetchMenuItems,
    saveMenuItem,
    recordCustomerBill,
    fetchInvoices,
    fetchDashboardAnalytics,
    fetchTrends,
  };
};
