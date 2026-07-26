import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export interface Vendor {
  id?: string;
  tenant_id?: string;
  outlet_id?: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  supplies?: string;
}

export interface IngredientLevel {
  ingredient_id: string;
  name: string;
  unit: string;
  min_threshold: number;
  cost_per_unit: number;
  current_balance: number;
  stock_value: number;
  needs_reorder: boolean;
  vendor?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  } | null;
}

export interface StockTransaction {
  id?: string;
  tenant_id: string;
  outlet_id: string;
  ingredient_id: string;
  type: 'opening' | 'closing' | 'purchase' | 'wastage' | 'consumption';
  quantity: number;
  unit_cost: number;
  vendor_id?: string;
  reason?: string;
  notes?: string;
  transaction_date?: string;
}

export interface DailyReconciliationPayload {
  tenant_id: string;
  outlet_id: string;
  ingredient_id: string;
  opening_quantity?: number;
  purchased_quantity?: number;
  closing_quantity: number;
  unit_cost?: number;
}

export interface PurchaseRecord {
  id: string;
  transaction_date: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  vendor_name: string;
  vendor_phone?: string;
  notes?: string;
}

export interface WastageDetail {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  reason: string;
  notes?: string;
  date: string;
}

export interface WastageReport {
  total_wastage_cost: number;
  total_wastage_qty: number;
  reason_summary: Array<{ reason: string; quantity: number; cost: number }>;
  details: WastageDetail[];
}

export interface ReorderAlert {
  alert_id: string;
  ingredient_id: string;
  ingredient_name: string;
  current_balance: number;
  min_threshold: number;
  unit: string;
  created_at: string;
  vendor_name: string;
  vendor_phone: string;
}

export interface InventoryAnalytics {
  inventory_value: number;
  food_cost_cogs: number;
  wastage_cost: number;
  monthly_purchase_cost: number;
  total_consumption_qty: number;
  total_wastage_qty: number;
  wastage_percentage: number;
  low_stock_count: number;
  top_consumed_ingredients: Array<{
    ingredient_name: string;
    unit: string;
    quantity: number;
    cost: number;
  }>;
  wastage_by_reason: Array<{
    reason: string;
    quantity: number;
    cost: number;
  }>;
}

export const useInventory = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<IngredientLevel[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [wastageReport, setWastageReport] = useState<WastageReport | null>(null);
  const [reorderAlerts, setReorderAlerts] = useState<ReorderAlert[]>([]);
  const [analytics, setAnalytics] = useState<InventoryAnalytics | null>(null);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('dineiq_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }, []);

  const fetchLevels = useCallback(async (tenantId: string, outletId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/levels?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLevels(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch inventory levels');
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchVendors = useCallback(async (tenantId: string, outletId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/vendors?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setVendors(data);
    } catch (err: any) {
      console.error('Failed to fetch vendors:', err);
    }
  }, [getHeaders]);

  const saveVendor = useCallback(async (vendor: Vendor) => {
    setLoading(true);
    try {
      const isEdit = Boolean(vendor.id);
      const url = isEdit 
        ? `${API_BASE}/api/v1/inventory/vendors/${vendor.id}`
        : `${API_BASE}/api/v1/inventory/vendors`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(vendor),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const saveIngredient = useCallback(async (ingredient: any) => {
    setLoading(true);
    try {
      const isEdit = Boolean(ingredient.id);
      const url = isEdit 
        ? `${API_BASE}/api/v1/inventory/ingredients/${ingredient.id}`
        : `${API_BASE}/api/v1/inventory/ingredients`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(ingredient),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const logTransaction = useCallback(async (transaction: StockTransaction) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/stock-transactions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(transaction),
      });

      if (res.status === 422) {
        const errData = await res.json();
        throw new Error(errData.detail?.message || 'NEGATIVE_STOCK_VIOLATION');
      }

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to record stock transaction');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const reconcileDailyStock = useCallback(async (payload: DailyReconciliationPayload) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/reconcile`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (err: any) {
      setError(err.message || 'Failed to reconcile daily stock');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchPurchases = useCallback(async (tenantId: string, outletId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/purchases?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPurchases(data);
    } catch (err: any) {
      console.error('Failed to fetch purchases:', err);
    }
  }, [getHeaders]);

  const fetchWastageReport = useCallback(async (tenantId: string, outletId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/wastage-report?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setWastageReport(data);
    } catch (err: any) {
      console.error('Failed to fetch wastage report:', err);
    }
  }, [getHeaders]);

  const fetchReorderAlerts = useCallback(async (tenantId: string, outletId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/reorder-alerts?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReorderAlerts(data);
    } catch (err: any) {
      console.error('Failed to fetch reorder alerts:', err);
    }
  }, [getHeaders]);

  const resolveReorderAlert = useCallback(async (alertId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/reorder-alerts/${alertId}/resolve`, {
        method: 'PUT',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    } catch (err: any) {
      console.error('Failed to resolve alert:', err);
    }
  }, [getHeaders]);

  const fetchAnalytics = useCallback(async (tenantId: string, outletId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/inventory/analytics?tenant_id=${tenantId}&outlet_id=${outletId}`, {
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAnalytics(data);
    } catch (err: any) {
      console.error('Failed to fetch inventory analytics:', err);
    }
  }, [getHeaders]);

  return {
    loading,
    error,
    levels,
    vendors,
    purchases,
    wastageReport,
    reorderAlerts,
    analytics,
    fetchLevels,
    fetchVendors,
    saveVendor,
    saveIngredient,
    logTransaction,
    reconcileDailyStock,
    fetchPurchases,
    fetchWastageReport,
    fetchReorderAlerts,
    resolveReorderAlert,
    fetchAnalytics,
  };
};
