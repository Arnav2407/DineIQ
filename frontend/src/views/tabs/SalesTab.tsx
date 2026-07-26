import React, { useState, useEffect, useCallback } from 'react';
import { useSales } from '../../hooks/useSales';
import type { CustomerBillPayload, MenuItem, DishAnalysis, TableAreaPerformance } from '../../hooks/useSales';
import { 
  TrendingUp, BarChart3, Database, RefreshCw, Loader2, 
  Check, AlertTriangle, Award, DollarSign, TrendingDown,
  Receipt, Plus, X, Users, MapPin, Clock, Calendar, PieChart,
  ShoppingBag, Sparkles, Filter, AlertCircle, PhoneCall
} from 'lucide-react';

interface SalesTabProps {
  tenantId: string;
  outletId: string;
  trends?: any;
  userRole?: string;
}

export const SalesTab: React.FC<SalesTabProps> = ({ tenantId, outletId, userRole = 'Staff' }) => {
  const { 
    menuItems, 
    invoices, 
    analytics, 
    loading, 
    error,
    fetchMenuItems,
    saveMenuItem,
    recordCustomerBill,
    fetchInvoices,
    fetchDashboardAnalytics
  } = useSales();

  // Navigation Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'billing' | 'dishes' | 'performers' | 'area_meal' | 'trends' | 'sync'>('billing');
  
  // Modals
  const [showBillModal, setShowBillModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  
  // Feedback
  const [billSuccess, setBillSuccess] = useState<string | null>(null);
  const [billError, setBillError] = useState<string | null>(null);

  // Forms
  const [billForm, setBillForm] = useState({
    transaction_id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
    payment_method: 'UPI',
    table_area: 'Indoor',
    customer_count: 2,
    is_reservation: false,
    selected_sku: '',
    selected_qty: 1,
    items: [] as Array<{ sku: string; name: string; quantity: number; unit_price: number }>
  });

  const [itemForm, setItemForm] = useState({
    id: '',
    sku: '',
    name: '',
    price: 250,
    cost: 100
  });

  // Sync simulator state
  const [syncType, setSyncType] = useState<'json' | 'csv'>('json');
  const [loadingSync, setLoadingSync] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const mockJsonPayload = `{
  "tenant_id": "${tenantId}",
  "outlet_id": "${outletId}",
  "transactions": [
    {
      "transaction_id": "INV-${Math.floor(1000 + Math.random() * 9000)}",
      "transaction_time": "${new Date().toISOString()}",
      "payment_method": "UPI",
      "table_area": "Indoor",
      "customer_count": 2,
      "items": [
        { "sku": "SKU-BIRYANI", "quantity": 2, "unit_price": 250.00 },
        { "sku": "SKU-NAAN", "quantity": 4, "unit_price": 45.00 }
      ]
    }
  ]
}`;

  const mockCsvPayload = `transaction_id,sku,quantity,unit_price,payment_method,table_area,transaction_time
INV-2001,SKU-BIRYANI,3,250.00,UPI,Indoor,${new Date().toISOString()}
INV-2001,SKU-NAAN,6,45.00,UPI,Indoor,${new Date().toISOString()}
INV-2002,SKU-BUTTER-CHK,2,320.00,Card,Family Hall,${new Date().toISOString()}`;

  const [jsonInput, setJsonInput] = useState(mockJsonPayload);
  const [csvInput, setCsvInput] = useState(mockCsvPayload);

  const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

  const refreshAllData = useCallback(() => {
    fetchMenuItems(tenantId, outletId);
    fetchInvoices(tenantId, outletId);
    fetchDashboardAnalytics(tenantId, outletId);
  }, [tenantId, outletId, fetchMenuItems, fetchInvoices, fetchDashboardAnalytics]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  // Set default selected SKU when menu items load
  useEffect(() => {
    if (menuItems.length > 0 && !billForm.selected_sku) {
      setBillForm(prev => ({ ...prev, selected_sku: menuItems[0].sku }));
    }
  }, [menuItems, billForm.selected_sku]);

  // Handle adding an item to the current bill line items
  const handleAddItemToBill = () => {
    if (!billForm.selected_sku) return;
    const item = menuItems.find(m => m.sku === billForm.selected_sku);
    if (!item) return;

    const existingIdx = billForm.items.findIndex(i => i.sku === item.sku);
    if (existingIdx >= 0) {
      const updated = [...billForm.items];
      updated[existingIdx].quantity += Number(billForm.selected_qty);
      setBillForm({ ...billForm, items: updated });
    } else {
      setBillForm({
        ...billForm,
        items: [
          ...billForm.items,
          {
            sku: item.sku,
            name: item.name,
            quantity: Number(billForm.selected_qty),
            unit_price: item.price
          }
        ]
      });
    }
  };

  // Submit customer bill
  const handleBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBillError(null);
    setBillSuccess(null);

    if (billForm.items.length === 0) {
      setBillError('Please add at least one menu dish to the bill.');
      return;
    }

    try {
      const payload: CustomerBillPayload = {
        tenant_id: tenantId,
        outlet_id: outletId,
        transaction_id: billForm.transaction_id,
        payment_method: billForm.payment_method,
        table_area: billForm.table_area,
        customer_count: billForm.customer_count,
        is_reservation: billForm.is_reservation,
        items: billForm.items.map(i => ({
          sku: i.sku,
          quantity: i.quantity,
          unit_price: i.unit_price
        }))
      };

      const result = await recordCustomerBill(payload);
      setBillSuccess(`Bill ${result.invoice_number} recorded! Total: ₹${result.total_amount.toFixed(2)} (${result.payment_method})`);
      
      setBillForm({
        transaction_id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
        payment_method: 'UPI',
        table_area: 'Indoor',
        customer_count: 2,
        is_reservation: false,
        selected_sku: menuItems[0]?.sku || '',
        selected_qty: 1,
        items: []
      });

      refreshAllData();

      setTimeout(() => {
        setShowBillModal(false);
        setBillSuccess(null);
      }, 1500);
    } catch (err: any) {
      setBillError(err.message || 'Failed to record customer bill.');
    }
  };

  // Save menu item
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBillError(null);
    setBillSuccess(null);

    try {
      await saveMenuItem({
        id: itemForm.id || undefined,
        tenant_id: tenantId,
        outlet_id: outletId,
        sku: itemForm.sku,
        name: itemForm.name,
        price: Number(itemForm.price),
        cost: Number(itemForm.cost)
      });

      setBillSuccess('Menu item saved successfully!');
      setItemForm({ id: '', sku: '', name: '', price: 250, cost: 100 });
      fetchMenuItems(tenantId, outletId);

      setTimeout(() => {
        setShowItemModal(false);
        setBillSuccess(null);
      }, 1500);
    } catch (err: any) {
      setBillError(err.message || 'Failed to save menu item.');
    }
  };

  // Run POS Sync Simulation
  const handleSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingSync(true);
    setSyncSuccess(null);
    setSyncError(null);

    try {
      let endpoint = '';
      let bodyPayload = '';

      if (syncType === 'json') {
        endpoint = `${API_BASE}/api/v1/sales/pos-sync/json`;
        bodyPayload = jsonInput;
        JSON.parse(jsonInput);
      } else {
        endpoint = `${API_BASE}/api/v1/sales/pos-sync/csv`;
        bodyPayload = JSON.stringify({
          tenant_id: tenantId,
          outlet_id: outletId,
          csv_data: csvInput
        });
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('dineiq_token') || ''}`
        },
        body: bodyPayload
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setSyncSuccess(`Sync Successful! Ingested ${data.records_synced} transactions. Total Revenue: ₹${data.revenue_ingested.toFixed(2)}`);
      refreshAllData();
    } catch (err: any) {
      setSyncError(err.message || 'Sync simulation failed. Verify format.');
    } finally {
      setLoadingSync(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Sentinel Warning */}
      {analytics?.sync_sentinel_alert && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-2xl flex justify-between items-center flex-wrap gap-4 animate-fadeIn">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={24} />
            <div>
              <h4 className="text-sm font-bold text-white font-display">POS Sync Sentinel Warning</h4>
              <p className="text-xs text-amber-400/80 mt-0.5">The external POS integration has been offline for over 30 minutes. Real-time billing telemetry is delayed.</p>
            </div>
          </div>
          <button 
            onClick={() => setActiveSubTab('sync')}
            className="text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-white px-3 py-1.5 rounded-xl transition cursor-pointer"
          >
            Open Sync Console
          </button>
        </div>
      )}

      {/* TOP KPI OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-dark-400 font-mono uppercase">Total Gross Sales</span>
            <h3 className="text-2xl font-bold text-white mt-1">
              ₹{(analytics?.total_revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </h3>
            <span className="text-[10px] text-emerald-400 mt-0.5 block flex items-center gap-0.5"><TrendingUp size={10} /> Live POS Telemetry</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
            <DollarSign size={20} />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-dark-400 font-mono uppercase">Average Bill Value</span>
            <h3 className="text-2xl font-bold text-white mt-1">
              ₹{(analytics?.average_bill_value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </h3>
            <span className="text-[10px] text-dark-400 mt-0.5 block">Across {analytics?.total_bills || 0} customer bills</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
            <Receipt size={20} />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-dark-400 font-mono uppercase">Total Items Sold</span>
            <h3 className="text-2xl font-bold text-white mt-1">{analytics?.total_items_sold || 0} Dishes</h3>
            <span className="text-[10px] text-dark-400 mt-0.5 block">{menuItems.length} Active menu dishes</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <ShoppingBag size={20} />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-dark-400 font-mono uppercase">Peak Sales Day</span>
            <h3 className="text-xl font-bold text-white mt-1">{analytics?.peak_sales_day || 'N/A'}</h3>
            <span className="text-[10px] text-dark-400 mt-0.5 block">Lowest: {analytics?.lowest_sales_day || 'N/A'}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
            <Calendar size={20} />
          </div>
        </div>
      </div>

      {/* SUB-HEADER NAVIGATION */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex border-b border-dark-800 gap-1 overflow-x-auto">
          {[
            { id: 'billing', label: 'Billing System & Invoices', icon: Receipt },
            { id: 'dishes', label: 'Revenue & Contribution Margins', icon: DollarSign },
            { id: 'performers', label: 'Top & Low Dishes', icon: Award },
            { id: 'area_meal', label: 'Meal Period & Table Areas', icon: MapPin },
            { id: 'trends', label: 'Sales Trends Analytics', icon: BarChart3 },
            { id: 'sync', label: 'POS Webhook Console', icon: Database }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition font-display whitespace-nowrap ${
                  active 
                    ? 'border-brand-500 text-white bg-brand-500/10 rounded-t-xl' 
                    : 'border-transparent text-dark-400 hover:text-dark-200'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ACTIONS */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setItemForm({ id: '', sku: `SKU-${Math.floor(100 + Math.random() * 900)}`, name: '', price: 250, cost: 100 });
              setShowItemModal(true);
            }}
            className="glass-card border border-dark-700 hover:border-brand-500/40 text-dark-200 hover:text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Plus size={14} /> Add Menu Item
          </button>
          <button
            onClick={() => {
              setBillForm({
                transaction_id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
                payment_method: 'UPI',
                table_area: 'Indoor',
                customer_count: 2,
                is_reservation: false,
                selected_sku: menuItems[0]?.sku || '',
                selected_qty: 1,
                items: []
              });
              setBillError(null);
              setShowBillModal(true);
            }}
            className="glow-btn px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Receipt size={14} /> Generate Customer Bill
          </button>
        </div>
      </div>

      {/* SUB-TAB CONTENTS */}
      <div className="flex-1">

        {/* SUB-TAB 1: FEATURE 1 - BILLING SYSTEM INTEGRATION */}
        {activeSubTab === 'billing' && (
          <div className="glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-dark-800 bg-dark-900/10 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h3 className="text-base font-bold text-white font-display">Customer Billing Log & POS Invoices</h3>
                <p className="text-xs text-dark-400 mt-0.5">Automated bill recording with invoice number, ordered dishes, payment method (UPI, Cash, Card), and table area</p>
              </div>
              <button
                onClick={() => {
                  setBillForm({
                    transaction_id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
                    payment_method: 'UPI',
                    table_area: 'Indoor',
                    customer_count: 2,
                    is_reservation: false,
                    selected_sku: menuItems[0]?.sku || '',
                    selected_qty: 1,
                    items: []
                  });
                  setShowBillModal(true);
                }}
                className="glow-btn px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                <Plus size={14} /> Record Bill
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-dark-300">
                <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                  <tr>
                    <th className="px-6 py-3.5">Invoice #</th>
                    <th className="px-6 py-3.5">Time</th>
                    <th className="px-6 py-3.5">Ordered Dishes</th>
                    <th className="px-6 py-3.5">Payment Method</th>
                    <th className="px-6 py-3.5">Table Area</th>
                    <th className="px-6 py-3.5 font-mono text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/40">
                  {invoices.length > 0 ? (
                    invoices.map((inv) => (
                      <tr key={inv.invoice_number} className="hover:bg-dark-900/20 transition">
                        <td className="px-6 py-4 font-mono font-bold text-brand-300">
                          #{inv.invoice_number}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-dark-400">
                          {new Date(inv.transaction_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          <span className="block text-[10px] text-dark-500">{inv.meal_period}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {inv.items.map((it, i) => (
                              <div key={i} className="text-xs flex items-center gap-2">
                                <span className="font-semibold text-white">{it.item_name}</span>
                                <span className="font-mono text-dark-400">x{it.quantity}</span>
                                <span className="font-mono text-dark-400 text-[10px]">(₹{it.total_amount})</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20">
                            {inv.payment_method}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-white">
                          {inv.table_area}
                        </td>
                        <td className="px-6 py-4 font-mono font-extrabold text-emerald-400 text-right text-base">
                          ₹{inv.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-dark-400 italic">
                        No customer bills recorded. Click "Generate Customer Bill" to log a new invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: FEATURE 2 & FEATURE 7 - REVENUE BY DISH & CONTRIBUTION MARGINS */}
        {activeSubTab === 'dishes' && (
          <div className="glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-dark-800 bg-dark-900/10 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h3 className="text-base font-bold text-white font-display">Revenue Tracking & Contribution Margin Reporting</h3>
                <p className="text-xs text-dark-400 mt-0.5">Dish-level sales revenue and gross profit margins: Contribution Margin = Selling Price - Ingredient Cost</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-dark-300">
                <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                  <tr>
                    <th className="px-6 py-3.5">Menu Dish Name</th>
                    <th className="px-6 py-3.5 font-mono text-center">SKU</th>
                    <th className="px-6 py-3.5 font-mono text-center">Plates Sold</th>
                    <th className="px-6 py-3.5 font-mono text-center">Selling Price</th>
                    <th className="px-6 py-3.5 font-mono text-center">Ingredient Cost</th>
                    <th className="px-6 py-3.5 font-mono text-center">Unit Margin</th>
                    <th className="px-6 py-3.5 font-mono text-right">Dish Revenue</th>
                    <th className="px-6 py-3.5 text-right">Profit Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800/40">
                  {analytics && analytics.dishes_revenue_analysis.length > 0 ? (
                    analytics.dishes_revenue_analysis.map((dish) => {
                      const marginPct = dish.margin_percentage;
                      let marginBadge = 'bg-red-500/10 text-red-400 border border-red-500/20';
                      if (marginPct >= 50) {
                        marginBadge = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                      } else if (marginPct >= 30) {
                        marginBadge = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
                      }

                      return (
                        <tr key={dish.sku} className="hover:bg-dark-900/20 transition">
                          <td className="px-6 py-4 font-semibold text-white">
                            {dish.name}
                          </td>
                          <td className="px-6 py-4 text-center font-mono text-xs text-dark-400">{dish.sku}</td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-white">{dish.quantity_sold}</td>
                          <td className="px-6 py-4 text-center font-mono text-white">₹{dish.selling_price}</td>
                          <td className="px-6 py-4 text-center font-mono text-dark-400">₹{dish.ingredient_cost}</td>
                          <td className="px-6 py-4 text-center font-mono text-brand-300 font-semibold">₹{dish.unit_contribution_margin}</td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400 text-base">
                            ₹{dish.total_revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${marginBadge}`}>
                              {marginPct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-dark-400 italic">
                        No dish performance data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-TAB 3: FEATURE 5 & FEATURE 6 - TOP & LOW PERFORMING DISHES */}
        {activeSubTab === 'performers' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Feature 5: Top-Performing Items */}
            <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2 mb-1">
                  <Award className="text-emerald-400" size={18} /> Top-Performing Dishes
                </h3>
                <p className="text-xs text-dark-400 mb-4">Best-selling menu items by order volume and revenue generation</p>
                
                <div className="space-y-3">
                  {analytics && analytics.top_performing_items.length > 0 ? (
                    analytics.top_performing_items.map((item, idx) => (
                      <div key={idx} className="glass-card p-4 rounded-xl flex justify-between items-center border border-dark-800">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                            #{idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-white block text-sm">{item.name}</span>
                            <span className="text-xs text-dark-400">Price: ₹{item.selling_price}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-white font-mono block">{item.quantity_sold} Orders</span>
                          <span className="text-xs text-emerald-400 font-mono font-bold">₹{item.total_revenue.toLocaleString()} Revenue</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-dark-400 italic text-center py-8">No order performance data.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 p-3 glass-card bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-400">
                💡 <strong>Strategy:</strong> Highlight top dishes on physical menus and digital ordering portals.
              </div>
            </div>

            {/* Feature 6: Low-Performing Items */}
            <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2 mb-1">
                  <TrendingDown className="text-red-400" size={18} /> Low-Performing Dishes
                </h3>
                <p className="text-xs text-dark-400 mb-4">Dishes with lowest sales volume requiring review (Improve, Replace, Remove)</p>
                
                <div className="space-y-3">
                  {analytics && analytics.low_performing_items.length > 0 ? (
                    analytics.low_performing_items.map((item, idx) => (
                      <div key={idx} className="glass-card p-4 rounded-xl flex justify-between items-center border border-dark-800">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                            #{idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-white block text-sm">{item.name}</span>
                            <span className="text-xs text-dark-400">Margin: {item.margin_percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-white font-mono block">{item.quantity_sold} Orders</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                            Action: Review Recipe
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-dark-400 italic text-center py-8">No low performer data.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 p-3 glass-card bg-red-500/5 border border-red-500/20 rounded-xl text-xs text-red-400">
                ⚠️ <strong>Action Plan:</strong> Evaluate whether to redesign recipes, reduce price, or remove low sellers.
              </div>
            </div>

          </div>
        )}

        {/* SUB-TAB 4: FEATURE 3 & FEATURE 4 - MEAL PERIOD & TABLE AREA PERFORMANCE */}
        {activeSubTab === 'area_meal' && (
          <div className="flex flex-col gap-6">
            
            {/* Feature 3: Meal Period Analysis */}
            <div className="glass-panel border border-dark-800 rounded-2xl p-6">
              <h3 className="text-base font-bold text-white font-display mb-1 flex items-center gap-2">
                <Clock className="text-purple-400" size={18} /> Feature 3: Meal Period Analysis
              </h3>
              <p className="text-xs text-dark-400 mb-4">Sales grouping by Breakfast, Lunch, Snacks, and Dinner ordering patterns</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {analytics && analytics.meal_period_analysis ? (
                  Object.entries(analytics.meal_period_analysis).map(([period, data], i) => (
                    <div key={i} className="glass-card p-5 rounded-2xl border border-dark-800 flex flex-col justify-between">
                      <div>
                        <span className="text-xs uppercase font-mono font-bold text-brand-300 block">{period}</span>
                        <h4 className="text-2xl font-extrabold text-white mt-2">₹{data.revenue.toLocaleString()}</h4>
                      </div>
                      <div className="mt-4 pt-3 border-t border-dark-800 space-y-1 text-xs text-dark-300">
                        <div className="flex justify-between">
                          <span className="text-dark-400">Total Bills:</span>
                          <span className="font-mono text-white">{data.bills_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400">Avg Bill Value:</span>
                          <span className="font-mono text-emerald-400 font-bold">₹{data.avg_bill_value.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-8 text-center text-dark-400 italic">No meal period data.</div>
                )}
              </div>
            </div>

            {/* Feature 4: Table Area Performance Analysis */}
            <div className="glass-panel border border-dark-800 rounded-2xl p-6">
              <h3 className="text-base font-bold text-white font-display mb-1 flex items-center gap-2">
                <MapPin className="text-brand-400" size={18} /> Feature 4: Table Area Performance Analysis
              </h3>
              <p className="text-xs text-dark-400 mb-4">Sales, occupancy rates, and turnover across Indoor, Outdoor, Family Hall, Rooftop, and Bar seating areas</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics && analytics.table_area_performance.length > 0 ? (
                  analytics.table_area_performance.map((area, idx) => (
                    <div key={idx} className="glass-card p-5 rounded-2xl border border-dark-800 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex justify-between items-center">
                          <h4 className="text-base font-bold text-white font-display">{area.table_area} Seating</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Occupancy: {area.occupancy_rate_pct.toFixed(0)}%
                          </span>
                        </div>
                        <h3 className="text-2xl font-extrabold text-emerald-400 mt-2">₹{area.revenue.toLocaleString()}</h3>
                      </div>

                      <div className="space-y-1.5 text-xs text-dark-300 pt-3 border-t border-dark-800 font-mono">
                        <div className="flex justify-between">
                          <span className="text-dark-400">Orders Processed:</span>
                          <span className="text-white font-bold">{area.total_orders} Bills</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400">Customers Served:</span>
                          <span className="text-white font-bold">{area.customers_served} Guests</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400">Avg Bill Value:</span>
                          <span className="text-brand-300 font-bold">₹{area.avg_bill_value.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400">Avg Dining Time:</span>
                          <span className="text-white">{area.avg_dining_time_mins} mins</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-dark-400">Reservation Ratio:</span>
                          <span className="text-purple-400 font-bold">{area.reservation_ratio_pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-8 text-center text-dark-400 italic">No table area performance data.</div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* SUB-TAB 5: FEATURE 8 - SALES TRENDS & GROWTH ANALYTICS */}
        {activeSubTab === 'trends' && (
          <div className="flex flex-col gap-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Daily Trend List */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6">
                <h3 className="text-base font-bold text-white font-display mb-1 flex items-center gap-2">
                  <BarChart3 className="text-brand-400" size={18} /> Daily Revenue Trend
                </h3>
                <p className="text-xs text-dark-400 mb-4">Historical daily revenue snapshots</p>

                <div className="space-y-3">
                  {analytics && analytics.daily_sales_trends.length > 0 ? (
                    analytics.daily_sales_trends.map((t, idx) => (
                      <div key={idx} className="glass-card p-4 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-white block">{t.date}</span>
                          <span className="text-dark-400">{t.orders} Orders</span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          ₹{t.revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-dark-400 italic text-center py-8">No daily trend snapshots recorded.</p>
                  )}
                </div>
              </div>

              {/* Peak & Growth Analytics */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-white font-display mb-1">Growth & Peak Performance Metrics</h3>
                  <p className="text-xs text-dark-400 mb-4">Key indicators for operational capacity planning</p>

                  <div className="space-y-4">
                    <div className="glass-card p-4 rounded-xl border border-dark-800 flex justify-between items-center">
                      <div>
                        <span className="text-xs text-dark-400 block">Peak Sales Day</span>
                        <span className="font-bold text-white text-base font-display">{analytics?.peak_sales_day || 'N/A'}</span>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <TrendingUp size={18} />
                      </div>
                    </div>

                    <div className="glass-card p-4 rounded-xl border border-dark-800 flex justify-between items-center">
                      <div>
                        <span className="text-xs text-dark-400 block">Lowest Sales Day</span>
                        <span className="font-bold text-white text-base font-display">{analytics?.lowest_sales_day || 'N/A'}</span>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                        <TrendingDown size={18} />
                      </div>
                    </div>

                    <div className="glass-card p-4 rounded-xl border border-dark-800 flex justify-between items-center">
                      <div>
                        <span className="text-xs text-dark-400 block">Average Daily Revenue</span>
                        <span className="font-mono font-bold text-emerald-400 text-base">
                          ₹{((analytics?.total_revenue || 0) / (analytics?.daily_sales_trends.length || 1)).toLocaleString(undefined, {maximumFractionDigits: 2})}
                        </span>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
                        <DollarSign size={18} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 glass-card bg-brand-500/5 border border-brand-500/20 rounded-xl text-xs text-brand-300">
                  📈 <strong>Insights:</strong> Leverage peak sales days for special promotional campaigns.
                </div>
              </div>

            </div>

          </div>
        )}

        {/* SUB-TAB 6: POS WEBHOOK CONSOLE */}
        {activeSubTab === 'sync' && (
          <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-white font-display flex items-center gap-2">
                <Database className="text-brand-400" /> POS Adapter Connection Console
              </h3>
              <p className="text-xs text-dark-400 mt-1">Simulate pushing external POS ticket records via JSON webhooks or CSV files</p>
            </div>

            <div className="flex border-b border-dark-800 gap-4">
              <button
                onClick={() => setSyncType('json')}
                className={`pb-3 font-semibold text-xs font-mono uppercase transition border-b-2 ${
                  syncType === 'json' ? 'border-brand-500 text-white' : 'border-transparent text-dark-400'
                }`}
              >
                Simulate JSON webhook payload
              </button>
              <button
                onClick={() => setSyncType('csv')}
                className={`pb-3 font-semibold text-xs font-mono uppercase transition border-b-2 ${
                  syncType === 'csv' ? 'border-brand-500 text-white' : 'border-transparent text-dark-400'
                }`}
              >
                Simulate CSV bulk upload
              </button>
            </div>

            <form onSubmit={handleSyncSubmit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">
                  {syncType === 'json' ? 'Raw Request JSON Body' : 'Raw CSV text content'}
                </label>
                <textarea
                  value={syncType === 'json' ? jsonInput : csvInput}
                  onChange={(e) => syncType === 'json' ? setJsonInput(e.target.value) : setCsvInput(e.target.value)}
                  rows={8}
                  className="w-full bg-dark-950 font-mono text-xs p-4 rounded-xl border border-dark-800 text-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                  required
                ></textarea>
              </div>

              {syncSuccess && (
                <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-3.5 rounded-xl flex items-center gap-1.5 animate-fadeIn">
                  <Check size={14} className="shrink-0" />
                  <p>{syncSuccess}</p>
                </div>
              )}

              {syncError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3.5 rounded-xl flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle size={14} className="shrink-0" />
                  <p>{syncError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loadingSync}
                className="glow-btn flex items-center gap-2 text-xs font-semibold py-2.5 px-6 rounded-xl cursor-pointer"
              >
                {loadingSync ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                <span>Trigger Ingest Sync</span>
              </button>
            </form>
          </div>
        )}

      </div>

      {/* MODAL 1: GENERATE CUSTOMER BILL (FEATURE 1) */}
      {showBillModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-lg p-6 relative flex flex-col max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowBillModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Receipt className="text-brand-400" /> Billing System - Generate Customer Invoice
            </h3>

            <form onSubmit={handleBillSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Invoice Number</label>
                  <input
                    type="text"
                    value={billForm.transaction_id}
                    onChange={(e) => setBillForm({ ...billForm, transaction_id: e.target.value })}
                    className="glass-input w-full font-mono text-xs font-bold text-white"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Payment Method</label>
                  <select
                    value={billForm.payment_method}
                    onChange={(e) => setBillForm({ ...billForm, payment_method: e.target.value })}
                    className="glass-input w-full bg-dark-950 text-xs"
                  >
                    <option value="UPI">UPI Payment</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Credit / Debit Card</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Table Seating Area</label>
                  <select
                    value={billForm.table_area}
                    onChange={(e) => setBillForm({ ...billForm, table_area: e.target.value })}
                    className="glass-input w-full bg-dark-950 text-xs"
                  >
                    <option value="Indoor">Indoor Hall</option>
                    <option value="Outdoor">Outdoor Patio</option>
                    <option value="Family Hall">Family Hall</option>
                    <option value="Rooftop">Rooftop Lounge</option>
                    <option value="Bar">Bar Seating</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Customer Count</label>
                  <input
                    type="number"
                    min="1"
                    value={billForm.customer_count}
                    onChange={(e) => setBillForm({ ...billForm, customer_count: Number(e.target.value) })}
                    className="glass-input w-full text-xs font-mono"
                    required
                  />
                </div>
              </div>

              {/* Add dish selector */}
              <div className="pt-3 border-t border-dark-800">
                <label className="text-[10px] uppercase font-mono text-dark-400 block mb-1">Add Menu Dish to Bill</label>
                <div className="flex gap-2">
                  <select
                    value={billForm.selected_sku}
                    onChange={(e) => setBillForm({ ...billForm, selected_sku: e.target.value })}
                    className="glass-input flex-1 bg-dark-950 text-xs"
                  >
                    {menuItems.map(m => (
                      <option key={m.sku} value={m.sku}>
                        {m.name} (₹{m.price})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={billForm.selected_qty}
                    onChange={(e) => setBillForm({ ...billForm, selected_qty: Number(e.target.value) })}
                    className="glass-input w-16 text-center text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddItemToBill}
                    className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="glass-card p-3 rounded-xl border border-dark-800 max-h-36 overflow-y-auto space-y-2">
                {billForm.items.length > 0 ? (
                  billForm.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-white block">{it.name}</span>
                        <span className="text-dark-400 text-[10px]">₹{it.unit_price} x {it.quantity}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="font-bold text-emerald-400">₹{it.unit_price * it.quantity}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = billForm.items.filter((_, i) => i !== idx);
                            setBillForm({ ...billForm, items: updated });
                          }}
                          className="text-red-400 hover:text-white"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-dark-400 italic text-center py-4">No dishes added yet. Select a dish above.</p>
                )}
              </div>

              {/* Bill Summary Footer */}
              {billForm.items.length > 0 && (
                <div className="flex justify-between items-center text-sm font-bold text-white pt-2 border-t border-dark-800 font-mono">
                  <span>Total Bill Amount:</span>
                  <span className="text-emerald-400 text-lg">
                    ₹{billForm.items.reduce((acc, i) => acc + (i.unit_price * i.quantity), 0).toFixed(2)}
                  </span>
                </div>
              )}

              {billSuccess && (
                <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg flex items-center gap-1.5">
                  <Check size={14} /> {billSuccess}
                </p>
              )}

              {billError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {billError}
                </p>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowBillModal(false)}
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
                  <span>Generate & Save Bill</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD/EDIT MENU ITEM */}
      {showItemModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowItemModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Plus className="text-brand-400" /> Add Menu Item
            </h3>

            <form onSubmit={handleItemSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">SKU Code</label>
                  <input
                    type="text"
                    placeholder="e.g. SKU-BIRYANI"
                    value={itemForm.sku}
                    onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                    className="glass-input w-full font-mono text-xs"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Dish Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Chicken Biryani"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                    className="glass-input w-full text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Selling Price (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value) })}
                    className="glass-input w-full font-mono text-xs"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Ingredient Cost (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={itemForm.cost}
                    onChange={(e) => setItemForm({ ...itemForm, cost: Number(e.target.value) })}
                    className="glass-input w-full font-mono text-xs"
                    required
                  />
                </div>
              </div>

              {/* Contribution margin preview */}
              <div className="p-3 glass-card border border-brand-500/20 bg-brand-500/5 rounded-xl text-xs space-y-1">
                <div className="flex justify-between text-dark-300">
                  <span>Selling Price:</span>
                  <span className="font-mono">₹{itemForm.price}</span>
                </div>
                <div className="flex justify-between text-dark-300">
                  <span>Ingredient Cost:</span>
                  <span className="font-mono">- ₹{itemForm.cost}</span>
                </div>
                <div className="pt-1 border-t border-dark-800 flex justify-between font-bold text-white text-xs">
                  <span>Estimated Contribution Margin:</span>
                  <span className="font-mono text-brand-300">
                    ₹{(itemForm.price - itemForm.cost).toFixed(2)} ({(((itemForm.price - itemForm.cost) / (itemForm.price || 1)) * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>

              {billSuccess && (
                <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg flex items-center gap-1.5">
                  <Check size={14} /> {billSuccess}
                </p>
              )}

              {billError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {billError}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Save Menu Dish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
