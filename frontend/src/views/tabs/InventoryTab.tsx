import React, { useState, useEffect, useCallback } from 'react';
import { useInventory } from '../../hooks/useInventory';
import type { StockTransaction, Vendor, IngredientLevel } from '../../hooks/useInventory';
import { 
  Archive, Plus, X, AlertTriangle, Users, BarChart3, 
  TrendingDown, TrendingUp, DollarSign, Loader2, Check,
  ShoppingCart, RefreshCw, Layers, Phone, Mail, FileText, AlertCircle, Edit3
} from 'lucide-react';

interface InventoryTabProps {
  tenantId: string;
  outletId: string;
  userRole: string;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ tenantId, outletId, userRole }) => {
  const { 
    levels, 
    vendors, 
    purchases, 
    wastageReport, 
    reorderAlerts, 
    analytics, 
    loading, 
    error,
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
    fetchAnalytics
  } = useInventory();
  
  // Navigation tabs
  const [activeSubTab, setActiveSubTab] = useState<'levels' | 'reconciliation' | 'purchases' | 'wastage' | 'analytics'>('levels');
  
  // Modal states
  const [showTxModal, setShowTxModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState<any | null>(null);
  
  // Feedback states
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  
  // Manager Override state for Negative Stock Guard
  const [needsOverride, setNeedsOverride] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [overrideChecked, setOverrideChecked] = useState(false);
  const [txPendingPayload, setTxPendingPayload] = useState<any | null>(null);

  // Forms
  const [txForm, setTxForm] = useState({
    ingredient_id: '',
    type: 'purchase' as 'opening' | 'closing' | 'purchase' | 'wastage' | 'consumption',
    quantity: 1,
    unit_cost: 0,
    vendor_id: '',
    reason: 'Burnt',
    notes: '',
  });

  const [reconcileForm, setReconcileForm] = useState({
    ingredient_id: '',
    opening_quantity: 0,
    purchased_quantity: 0,
    closing_quantity: 0,
  });

  const [vendorForm, setVendorForm] = useState({
    id: '',
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    supplies: '',
  });

  const [ingredientForm, setIngredientForm] = useState({
    id: '',
    name: '',
    unit: 'kg',
    min_threshold: 10,
    cost_per_unit: 50,
  });

  // Initial Data Fetching
  const refreshAllData = useCallback(() => {
    fetchLevels(tenantId, outletId);
    fetchVendors(tenantId, outletId);
    fetchPurchases(tenantId, outletId);
    fetchWastageReport(tenantId, outletId);
    fetchReorderAlerts(tenantId, outletId);
    fetchAnalytics(tenantId, outletId);
  }, [tenantId, outletId, fetchLevels, fetchVendors, fetchPurchases, fetchWastageReport, fetchReorderAlerts, fetchAnalytics]);

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  // Sync forms when ingredient list changes
  useEffect(() => {
    if (levels.length > 0 && !txForm.ingredient_id) {
      setTxForm(prev => ({
        ...prev,
        ingredient_id: levels[0].ingredient_id,
        unit_cost: levels[0].cost_per_unit
      }));
      setReconcileForm(prev => ({
        ...prev,
        ingredient_id: levels[0].ingredient_id,
        opening_quantity: levels[0].current_balance
      }));
    }
  }, [levels, txForm.ingredient_id]);

  // Standard transaction submit with stock guard
  const handleTxSubmit = async (e: React.FormEvent, skipOverrideCheck = false) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    const isStaff = !['Owner', 'Manager'].includes(userRole);
    
    const payload: StockTransaction = {
      tenant_id: tenantId,
      outlet_id: outletId,
      ingredient_id: txForm.ingredient_id,
      type: txForm.type,
      quantity: Number(txForm.quantity),
      unit_cost: Number(txForm.unit_cost),
      vendor_id: txForm.vendor_id || undefined,
      reason: txForm.type === 'wastage' ? txForm.reason : undefined,
      notes: txForm.notes || undefined,
    };

    if (['consumption', 'wastage'].includes(txForm.type) && !skipOverrideCheck) {
      const ingredient = levels.find(l => l.ingredient_id === txForm.ingredient_id);
      if (ingredient) {
        const balanceAfter = ingredient.current_balance - payload.quantity;
        if (balanceAfter < 0) {
          if (isStaff) {
            setTxError(`Staff cannot record negative stock for '${ingredient.name}'. Manager or Owner override required.`);
            return;
          }
          setNeedsOverride(true);
          setOverrideMessage(`Negative stock detected! Balance for '${ingredient.name}' drops to ${balanceAfter} ${ingredient.unit}. Confirm Manager Override to authorize.`);
          setTxPendingPayload(payload);
          return;
        }
      }
    }

    try {
      await logTransaction(payload);
      setTxSuccess('Stock transaction recorded successfully!');
      setNeedsOverride(false);
      setOverrideChecked(false);
      
      refreshAllData();
      
      setTimeout(() => {
        setShowTxModal(false);
        setTxSuccess(null);
      }, 1500);
    } catch (err: any) {
      setTxError(err.message || 'Failed to record stock transaction.');
    }
  };

  const handleOverrideSubmit = async () => {
    if (!overrideChecked) {
      setTxError('Please check the manager override authorization.');
      return;
    }
    if (!txPendingPayload) return;
    
    try {
      await logTransaction(txPendingPayload);
      setTxSuccess('Stock transaction recorded via Manager Override!');
      setNeedsOverride(false);
      setOverrideChecked(false);
      setTxPendingPayload(null);
      
      refreshAllData();
      
      setTimeout(() => {
        setShowTxModal(false);
        setTxSuccess(null);
      }, 1500);
    } catch (err: any) {
      setTxError(err.message || 'Override transaction failed.');
    }
  };

  // Daily Stock Reconciliation submit
  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    try {
      const result = await reconcileDailyStock({
        tenant_id: tenantId,
        outlet_id: outletId,
        ingredient_id: reconcileForm.ingredient_id,
        opening_quantity: Number(reconcileForm.opening_quantity),
        purchased_quantity: Number(reconcileForm.purchased_quantity),
        closing_quantity: Number(reconcileForm.closing_quantity),
      });

      setTxSuccess(`Reconciliation saved! Calculated Consumption: ${result.calculated_consumption} ${result.unit}`);
      refreshAllData();
      
      setTimeout(() => {
        setTxSuccess(null);
      }, 3000);
    } catch (err: any) {
      setTxError(err.message || 'Failed to perform daily reconciliation.');
    }
  };

  // Vendor save
  const handleVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    try {
      await saveVendor({
        id: vendorForm.id || undefined,
        tenant_id: tenantId,
        outlet_id: outletId,
        name: vendorForm.name,
        contact_name: vendorForm.contact_name,
        email: vendorForm.email,
        phone: vendorForm.phone,
        supplies: vendorForm.supplies,
      });

      setTxSuccess('Vendor saved successfully!');
      setVendorForm({ id: '', name: '', contact_name: '', email: '', phone: '', supplies: '' });
      fetchVendors(tenantId, outletId);
      
      setTimeout(() => {
        setShowVendorModal(false);
        setTxSuccess(null);
      }, 1500);
    } catch (err: any) {
      setTxError(err.message || 'Failed to save vendor.');
    }
  };

  // Ingredient save
  const handleIngredientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    try {
      await saveIngredient({
        id: ingredientForm.id || undefined,
        tenant_id: tenantId,
        outlet_id: outletId,
        name: ingredientForm.name,
        unit: ingredientForm.unit,
        min_threshold: Number(ingredientForm.min_threshold),
        cost_per_unit: Number(ingredientForm.cost_per_unit),
      });

      setTxSuccess('Ingredient saved successfully!');
      setIngredientForm({ id: '', name: '', unit: 'kg', min_threshold: 10, cost_per_unit: 50 });
      fetchLevels(tenantId, outletId);
      
      setTimeout(() => {
        setShowIngredientModal(false);
        setTxSuccess(null);
      }, 1500);
    } catch (err: any) {
      setTxError(err.message || 'Failed to save ingredient.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* REORDER ALERT NOTIFICATION BANNER */}
      {reorderAlerts.length > 0 && (
        <div className="glass-panel border-l-4 border-l-red-500 border-red-500/20 bg-red-500/10 rounded-2xl p-4 flex justify-between items-center flex-wrap gap-4 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white font-display flex items-center gap-2">
                LOW STOCK ALERT ({reorderAlerts.length} Item{reorderAlerts.length > 1 ? 's' : ''} Need Reordering)
              </h4>
              <p className="text-xs text-red-300 mt-0.5">
                {reorderAlerts.map(a => `${a.ingredient_name} (${a.current_balance} / ${a.min_threshold} ${a.unit})`).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const alert = reorderAlerts[0];
              setShowReorderModal(alert);
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-red-600/20"
          >
            <ShoppingCart size={14} /> Reorder Stock Now
          </button>
        </div>
      )}

      {/* SUB-HEADER NAVIGATION */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex border-b border-dark-800 gap-1 overflow-x-auto">
          {[
            { id: 'levels', label: 'Stock Levels & Alerts', icon: Archive },
            { id: 'reconciliation', label: 'Opening & Closing Stock', icon: RefreshCw },
            { id: 'purchases', label: 'Purchase & Vendors', icon: ShoppingCart },
            { id: 'wastage', label: 'Wastage Tracker', icon: AlertCircle },
            { id: 'analytics', label: '10-Point Analytics', icon: BarChart3 }
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

        {/* TOP ACTION BUTTONS */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              setIngredientForm({ id: '', name: '', unit: 'kg', min_threshold: 10, cost_per_unit: 50 });
              setTxError(null);
              setShowIngredientModal(true);
            }}
            className="glass-card border border-dark-700 hover:border-brand-500/40 text-dark-200 hover:text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Plus size={14} /> Add Ingredient
          </button>
          <button
            onClick={() => {
              setVendorForm({ id: '', name: '', contact_name: '', email: '', phone: '', supplies: '' });
              setTxError(null);
              setShowVendorModal(true);
            }}
            className="glass-card border border-brand-500/30 text-brand-300 hover:bg-brand-500/10 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Users size={14} /> Add Supplier
          </button>
          <button
            onClick={() => {
              setTxForm({
                ingredient_id: levels[0]?.ingredient_id || '',
                type: 'purchase',
                quantity: 1,
                unit_cost: levels[0]?.cost_per_unit || 10,
                vendor_id: vendors[0]?.id || '',
                reason: 'Burnt',
                notes: ''
              });
              setTxError(null);
              setNeedsOverride(false);
              setShowTxModal(true);
            }}
            className="glow-btn px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Plus size={14} /> Record Transaction
          </button>
        </div>
      </div>

      {/* SUB-TAB CONTENTS */}
      <div className="flex-1">
        
        {/* SUB-TAB 1: INGREDIENT STOCK LEVELS & REORDER FLAG */}
        {activeSubTab === 'levels' && (
          <div className="flex flex-col gap-6">
            
            {/* Top Inventory KPI Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-panel p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-dark-400 font-mono uppercase">Total Raw Ingredients</span>
                  <h3 className="text-2xl font-bold text-white mt-1">{levels.length} Items</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
                  <Layers size={20} />
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-dark-400 font-mono uppercase">Total Stock Value</span>
                  <h3 className="text-2xl font-bold text-white mt-1">
                    ₹{(analytics?.inventory_value || levels.reduce((acc, item) => acc + item.stock_value, 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <DollarSign size={20} />
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-dark-400 font-mono uppercase">Low Stock Alerts</span>
                  <h3 className="text-2xl font-bold text-red-400 mt-1">{reorderAlerts.length} Alert{reorderAlerts.length !== 1 ? 's' : ''}</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                  <AlertTriangle size={20} />
                </div>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-dark-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-dark-400 font-mono uppercase">Suppliers Registered</span>
                  <h3 className="text-2xl font-bold text-white mt-1">{vendors.length} Vendors</h3>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Users size={20} />
                </div>
              </div>
            </div>

            {/* Ingredients Table */}
            <div className="glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-dark-800 bg-dark-900/10 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-white font-display">Ingredient-Level Inventory Monitoring</h3>
                  <p className="text-xs text-dark-400 mt-0.5">Real-time balances, safety limits, unit costs, and supplier info</p>
                </div>
                <span className="text-xs text-dark-400 font-mono">
                  {levels.length} Ingredients Registered
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-dark-300">
                  <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                    <tr>
                      <th className="px-6 py-3.5">Ingredient</th>
                      <th className="px-6 py-3.5">Stock Level Meter</th>
                      <th className="px-6 py-3.5">Current Balance</th>
                      <th className="px-6 py-3.5">Minimum Safety Limit</th>
                      <th className="px-6 py-3.5">Cost / Unit</th>
                      <th className="px-6 py-3.5">Inventory Value</th>
                      <th className="px-6 py-3.5 text-right">Status & Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/40">
                    {levels.length > 0 ? (
                      levels.map((item) => {
                        const balance = item.current_balance;
                        const thresh = item.min_threshold;
                        const percent = Math.min((balance / (thresh * 2 || 1)) * 100, 100);
                        const isLow = item.needs_reorder || balance < thresh;

                        return (
                          <tr key={item.ingredient_id} className="hover:bg-dark-900/20 transition">
                            <td className="px-6 py-4">
                              <span className="font-semibold text-white block">{item.name}</span>
                              {item.vendor && (
                                <span className="text-[10px] text-dark-400 block mt-0.5">
                                  Supplier: {item.vendor.name}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 w-52">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 bg-dark-900 rounded-full overflow-hidden border border-dark-800">
                                  <div 
                                    style={{ width: `${percent}%` }}
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      isLow ? 'bg-red-500' : 'bg-emerald-500'
                                    }`}
                                  ></div>
                                </div>
                                <span className="text-[10px] text-dark-400 font-mono w-8 text-right">{percent.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono font-bold text-white">
                              {balance} {item.unit}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-dark-400">
                              {thresh} {item.unit}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-dark-300">
                              ₹{item.cost_per_unit} / {item.unit}
                            </td>
                            <td className="px-6 py-4 font-mono font-semibold text-emerald-400">
                              ₹{item.stock_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                                  isLow 
                                    ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}>
                                  {isLow ? 'LOW STOCK ALERT' : 'In Stock'}
                                </span>

                                <button
                                  onClick={() => {
                                    setIngredientForm({
                                      id: item.ingredient_id,
                                      name: item.name,
                                      unit: item.unit,
                                      min_threshold: item.min_threshold,
                                      cost_per_unit: item.cost_per_unit
                                    });
                                    setShowIngredientModal(true);
                                  }}
                                  className="p-1.5 glass-card hover:bg-dark-800 text-dark-300 hover:text-white rounded-lg transition"
                                  title="Edit Ingredient"
                                >
                                  <Edit3 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-dark-400 italic">
                          No ingredients found. Click "Add Ingredient" to register raw items.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: DAILY OPENING AND CLOSING STOCK MANAGEMENT */}
        {activeSubTab === 'reconciliation' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Form Column */}
            <div className="lg:col-span-5 glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                  <RefreshCw className="text-brand-400" size={18} /> Record Daily Opening & Closing Stock
                </h3>
                <p className="text-xs text-dark-400 mt-1 leading-relaxed">
                  Morning opening stock is logged at start of shift. At night, record remaining closing stock. The system automatically computes daily consumption using:
                </p>
                <div className="mt-3 bg-dark-900/60 border border-dark-800 p-3 rounded-xl font-mono text-xs text-brand-300 font-semibold text-center">
                  Consumption = Opening Stock + Purchased Stock - Closing Stock
                </div>
              </div>

              <form onSubmit={handleReconcileSubmit} className="space-y-4 mt-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Select Raw Ingredient</label>
                  <select
                    value={reconcileForm.ingredient_id}
                    onChange={(e) => {
                      const ing = levels.find(l => l.ingredient_id === e.target.value);
                      setReconcileForm({
                        ...reconcileForm,
                        ingredient_id: e.target.value,
                        opening_quantity: ing ? ing.current_balance : 0
                      });
                    }}
                    className="glass-input w-full bg-dark-950"
                    required
                  >
                    {levels.map((item) => (
                      <option key={item.ingredient_id} value={item.ingredient_id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Opening Stock</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={reconcileForm.opening_quantity}
                      onChange={(e) => setReconcileForm({ ...reconcileForm, opening_quantity: Number(e.target.value) })}
                      className="glass-input w-full font-mono text-sm"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Purchased Stock</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={reconcileForm.purchased_quantity}
                      onChange={(e) => setReconcileForm({ ...reconcileForm, purchased_quantity: Number(e.target.value) })}
                      className="glass-input w-full font-mono text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Closing Stock</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={reconcileForm.closing_quantity}
                      onChange={(e) => setReconcileForm({ ...reconcileForm, closing_quantity: Number(e.target.value) })}
                      className="glass-input w-full font-mono text-sm"
                      required
                    />
                  </div>
                </div>

                {/* Calculation Preview */}
                {(() => {
                  const selIng = levels.find(l => l.ingredient_id === reconcileForm.ingredient_id);
                  const op = Number(reconcileForm.opening_quantity) || 0;
                  const pur = Number(reconcileForm.purchased_quantity) || 0;
                  const cl = Number(reconcileForm.closing_quantity) || 0;
                  const calculated = Math.max(0, op + pur - cl);

                  return (
                    <div className="glass-card border border-brand-500/20 bg-brand-500/5 p-4 rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between text-dark-300">
                        <span>Opening Stock:</span>
                        <span className="font-mono">{op} {selIng?.unit || 'units'}</span>
                      </div>
                      <div className="flex justify-between text-dark-300">
                        <span>Purchased Stock:</span>
                        <span className="font-mono">+ {pur} {selIng?.unit || 'units'}</span>
                      </div>
                      <div className="flex justify-between text-dark-300">
                        <span>Night Closing Stock:</span>
                        <span className="font-mono">- {cl} {selIng?.unit || 'units'}</span>
                      </div>
                      <div className="pt-2 border-t border-dark-800 flex justify-between font-bold text-white text-sm">
                        <span>Calculated Daily Usage:</span>
                        <span className="font-mono text-brand-300">{calculated} {selIng?.unit || 'units'}</span>
                      </div>
                    </div>
                  );
                })()}

                {txSuccess && (
                  <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-3 rounded-xl flex items-center gap-2">
                    <Check size={16} /> {txSuccess}
                  </p>
                )}

                {txError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center gap-2">
                    <AlertTriangle size={16} /> {txError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="glow-btn w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  <span>Save Opening/Closing Log</span>
                </button>
              </form>
            </div>

            {/* Reconciliation Explanation & Stock Movement Summary */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Worked Example Card matching prompt */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6">
                <h4 className="text-sm font-bold text-white font-display mb-3 flex items-center gap-2">
                  <FileText className="text-emerald-400" size={16} /> Worked Example & Formula Rule
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-dark-300">
                  <div className="glass-card p-4 rounded-xl border border-dark-800 space-y-2">
                    <span className="font-bold text-white block">Morning Opening Record</span>
                    <p><span className="text-dark-500">Rice:</span> 50 kg</p>
                    <p><span className="text-dark-500">Chicken:</span> 30 kg</p>
                    <p><span className="text-dark-500">Tomato:</span> 15 kg</p>
                  </div>

                  <div className="glass-card p-4 rounded-xl border border-dark-800 space-y-2">
                    <span className="font-bold text-white block">Night Closing Record</span>
                    <p><span className="text-dark-500">Rice:</span> 35 kg</p>
                    <p><span className="text-dark-500">Chicken:</span> 20 kg</p>
                    <p><span className="text-dark-500">Tomato:</span> 5 kg</p>
                  </div>
                </div>

                <div className="mt-4 p-4 glass-card bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-dark-300">
                  <p className="font-semibold text-emerald-400 mb-1">Calculated Daily Consumption Result:</p>
                  <p>Rice Used = 50 (Opening) + 0 (Purchased) - 35 (Closing) = <strong className="text-white">15 kg</strong></p>
                  <p>Chicken Used = 30 (Opening) + 20 (Purchased) - 25 (Closing) = <strong className="text-white">25 kg</strong></p>
                </div>
              </div>

              {/* Current Balances Table */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex-1">
                <h4 className="text-sm font-bold text-white font-display mb-3">Live Ingredient Registers</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {levels.map(ing => (
                    <div key={ing.ingredient_id} className="glass-card p-3 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-white block">{ing.name}</span>
                        <span className="text-dark-400">Min Safety Limit: {ing.min_threshold} {ing.unit}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-white text-sm block">{ing.current_balance} {ing.unit}</span>
                        <span className="text-emerald-400 text-[10px]">₹{ing.cost_per_unit} / {ing.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* SUB-TAB 3: PURCHASE TRACKING & VENDOR MANAGEMENT */}
        {activeSubTab === 'purchases' && (
          <div className="flex flex-col gap-6">
            
            {/* Vendor Master Register Section */}
            <div className="glass-panel border border-dark-800 rounded-2xl p-6">
              <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white font-display">Vendor & Supplier Management</h3>
                  <p className="text-xs text-dark-400 mt-0.5">Supplier directory, contact numbers, and supplied ingredient categories</p>
                </div>
                <button
                  onClick={() => {
                    setVendorForm({ id: '', name: '', contact_name: '', email: '', phone: '', supplies: '' });
                    setShowVendorModal(true);
                  }}
                  className="glass-card border border-brand-500/30 text-brand-300 hover:bg-brand-500/10 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Users size={14} /> Register New Vendor
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vendors.length > 0 ? (
                  vendors.map(v => (
                    <div key={v.id} className="glass-card p-5 rounded-2xl border border-dark-800 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-base font-bold text-white font-display">{v.name}</h4>
                          <button
                            onClick={() => {
                              setVendorForm({
                                id: v.id || '',
                                name: v.name,
                                contact_name: v.contact_name || '',
                                email: v.email || '',
                                phone: v.phone || '',
                                supplies: v.supplies || ''
                              });
                              setShowVendorModal(true);
                            }}
                            className="p-1 text-dark-400 hover:text-white transition"
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>
                        
                        {v.supplies && (
                          <span className="text-[10px] bg-brand-500/10 text-brand-300 border border-brand-500/20 px-2 py-0.5 rounded-full inline-block mb-3">
                            Supplies: {v.supplies}
                          </span>
                        )}

                        <div className="space-y-1.5 text-xs text-dark-300">
                          {v.contact_name && <p><span className="text-dark-500">Contact:</span> {v.contact_name}</p>}
                          {v.phone && (
                            <p className="flex items-center gap-1.5">
                              <Phone size={12} className="text-emerald-400" />
                              <a href={`tel:${v.phone}`} className="hover:underline font-mono text-emerald-400">{v.phone}</a>
                            </p>
                          )}
                          {v.email && (
                            <p className="flex items-center gap-1.5">
                              <Mail size={12} className="text-blue-400" />
                              <a href={`mailto:${v.email}`} className="hover:underline text-dark-300">{v.email}</a>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-dark-800 flex justify-end">
                        <button
                          onClick={() => {
                            setTxForm({
                              ingredient_id: levels[0]?.ingredient_id || '',
                              type: 'purchase',
                              quantity: 20,
                              unit_cost: levels[0]?.cost_per_unit || 200,
                              vendor_id: v.id || '',
                              reason: '',
                              notes: `Purchase from ${v.name}`
                            });
                            setShowTxModal(true);
                          }}
                          className="text-xs text-brand-300 hover:text-white font-semibold flex items-center gap-1 transition"
                        >
                          <ShoppingCart size={12} /> Log Purchase Order &rarr;
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-8 text-center text-dark-400 italic">
                    No vendors registered. Click "Register New Vendor" to add supplier details.
                  </div>
                )}
              </div>
            </div>

            {/* Purchase History Table */}
            <div className="glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-dark-800 bg-dark-900/10 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-white font-display">Purchase Tracking & Inward Log</h3>
                  <p className="text-xs text-dark-400 mt-0.5">Records of all raw ingredient purchases from vendors with cost tracking</p>
                </div>
                <button
                  onClick={() => {
                    setTxForm({
                      ingredient_id: levels[0]?.ingredient_id || '',
                      type: 'purchase',
                      quantity: 10,
                      unit_cost: levels[0]?.cost_per_unit || 50,
                      vendor_id: vendors[0]?.id || '',
                      reason: '',
                      notes: ''
                    });
                    setShowTxModal(true);
                  }}
                  className="glow-btn px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Plus size={14} /> Record Purchase
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-dark-300">
                  <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                    <tr>
                      <th className="px-6 py-3.5">Purchase Date</th>
                      <th className="px-6 py-3.5">Vendor / Supplier</th>
                      <th className="px-6 py-3.5">Ingredient Item</th>
                      <th className="px-6 py-3.5">Quantity Purchased</th>
                      <th className="px-6 py-3.5">Unit Cost</th>
                      <th className="px-6 py-3.5">Total Amount</th>
                      <th className="px-6 py-3.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/40">
                    {purchases.length > 0 ? (
                      purchases.map(p => (
                        <tr key={p.id} className="hover:bg-dark-900/20 transition">
                          <td className="px-6 py-4 font-mono text-xs text-dark-400">
                            {new Date(p.transaction_date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 font-semibold text-white">
                            {p.vendor_name}
                            {p.vendor_phone && (
                              <span className="text-[10px] text-dark-400 block font-mono">{p.vendor_phone}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-semibold text-brand-300">
                            {p.ingredient_name}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-white">
                            {p.quantity} {p.unit}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-dark-300">
                            ₹{p.unit_cost}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-emerald-400">
                            ₹{p.total_cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </td>
                          <td className="px-6 py-4 text-xs text-dark-400 italic">
                            {p.notes || '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-dark-400 italic">
                          No purchase records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* SUB-TAB 4: WASTAGE TRACKING AND REPORTING */}
        {activeSubTab === 'wastage' && (
          <div className="flex flex-col gap-6">
            
            {/* Wastage Summary Cards */}
            {wastageReport && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel p-6 rounded-2xl border border-dark-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-dark-400 font-mono uppercase">Total Wastage Cost</span>
                    <h3 className="text-3xl font-extrabold text-red-400 mt-1">
                      ₹{wastageReport.total_wastage_cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </h3>
                    <span className="text-[10px] text-red-400/80 mt-1 block">Cost of spoiled, burnt or expired items</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                    <AlertTriangle size={24} />
                  </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl border border-dark-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-dark-400 font-mono uppercase">Total Wasted Quantity</span>
                    <h3 className="text-3xl font-extrabold text-white mt-1">
                      {wastageReport.total_wastage_qty} Units
                    </h3>
                    <span className="text-[10px] text-dark-400 mt-1 block">Cumulative raw quantity discarded</span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-400">
                    <Archive size={24} />
                  </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl border border-dark-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-dark-400 font-mono uppercase">Primary Wastage Reason</span>
                    <h3 className="text-2xl font-bold text-white mt-1">
                      {wastageReport.reason_summary[0]?.reason || 'N/A'}
                    </h3>
                    <span className="text-[10px] text-dark-400 mt-1 block">
                      {wastageReport.reason_summary[0] ? `₹${wastageReport.reason_summary[0].cost.toFixed(2)} loss` : 'No wastage logged'}
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400">
                    <TrendingDown size={24} />
                  </div>
                </div>
              </div>
            )}

            {/* Wastage Breakdown by Reason Cards */}
            <div className="glass-panel border border-dark-800 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-base font-bold text-white font-display">Wastage Breakdown by Reason</h3>
                  <p className="text-xs text-dark-400 mt-0.5">Categorized analysis of losses (Burnt, Rotten, Expired, Spoiled, Damaged)</p>
                </div>
                <button
                  onClick={() => {
                    setTxForm({
                      ingredient_id: levels[0]?.ingredient_id || '',
                      type: 'wastage',
                      quantity: 1,
                      unit_cost: levels[0]?.cost_per_unit || 40,
                      vendor_id: '',
                      reason: 'Burnt',
                      notes: ''
                    });
                    setShowTxModal(true);
                  }}
                  className="glow-btn px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Plus size={14} /> Log Wastage Entry
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {wastageReport && wastageReport.reason_summary.length > 0 ? (
                  wastageReport.reason_summary.map((item, idx) => (
                    <div key={idx} className="glass-card p-4 rounded-xl border border-dark-800 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-bold text-white font-display block mb-1">{item.reason}</span>
                        <p className="text-xs text-dark-400">Quantity Lost: <strong className="text-white">{item.quantity} units</strong></p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-dark-800 flex justify-between items-center font-mono">
                        <span className="text-[10px] text-dark-400">Total Loss:</span>
                        <span className="text-sm font-bold text-red-400">₹{item.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-8 text-center text-dark-400 italic">
                    No wastage entries recorded.
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Wastage Table */}
            <div className="glass-panel border border-dark-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-dark-800 bg-dark-900/10">
                <h3 className="text-base font-bold text-white font-display">Detailed Wastage Log</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-dark-300">
                  <thead className="bg-dark-900/40 text-dark-400 text-xs font-mono uppercase border-b border-dark-800">
                    <tr>
                      <th className="px-6 py-3.5">Date</th>
                      <th className="px-6 py-3.5">Ingredient</th>
                      <th className="px-6 py-3.5">Quantity Wasted</th>
                      <th className="px-6 py-3.5">Reason</th>
                      <th className="px-6 py-3.5">Estimated Cost</th>
                      <th className="px-6 py-3.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/40">
                    {wastageReport && wastageReport.details.length > 0 ? (
                      wastageReport.details.map(w => (
                        <tr key={w.id} className="hover:bg-dark-900/20 transition">
                          <td className="px-6 py-4 font-mono text-xs text-dark-400">
                            {new Date(w.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 font-semibold text-white">
                            {w.ingredient_name}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-white">
                            {w.quantity} {w.unit}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                              {w.reason}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-red-400">
                            ₹{w.total_cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </td>
                          <td className="px-6 py-4 text-xs text-dark-400 italic">
                            {w.notes || '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-dark-400 italic">
                          No wastage log records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* SUB-TAB 5: 10-POINT INVENTORY ANALYTICS DASHBOARD */}
        {activeSubTab === 'analytics' && (
          <div className="flex flex-col gap-6">
            
            {/* Top 4 Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Metric 1: Current Inventory Value */}
              <div className="glass-panel p-5 rounded-2xl border border-dark-800">
                <span className="text-[10px] text-dark-400 uppercase font-mono tracking-wider">1. Total Inventory Value</span>
                <h3 className="text-2xl font-extrabold text-white mt-1">
                  ₹{(analytics?.inventory_value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </h3>
                <span className="text-[10px] text-emerald-400 mt-1 block">Value of ingredients in stock</span>
              </div>

              {/* Metric 2: Food Cost (COGS) */}
              <div className="glass-panel p-5 rounded-2xl border border-dark-800">
                <span className="text-[10px] text-dark-400 uppercase font-mono tracking-wider">2. Food Cost (COGS)</span>
                <h3 className="text-2xl font-extrabold text-brand-300 mt-1">
                  ₹{(analytics?.food_cost_cogs || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </h3>
                <span className="text-[10px] text-dark-400 mt-1 block">Cost of ingredients consumed</span>
              </div>

              {/* Metric 3: Monthly Purchase Cost */}
              <div className="glass-panel p-5 rounded-2xl border border-dark-800">
                <span className="text-[10px] text-dark-400 uppercase font-mono tracking-wider">3. Monthly Purchase Cost</span>
                <h3 className="text-2xl font-extrabold text-blue-400 mt-1">
                  ₹{(analytics?.monthly_purchase_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </h3>
                <span className="text-[10px] text-blue-400/80 mt-1 block">Total procurement expense</span>
              </div>

              {/* Metric 4: Wastage Cost & Rate */}
              <div className="glass-panel p-5 rounded-2xl border border-dark-800">
                <span className="text-[10px] text-dark-400 uppercase font-mono tracking-wider">4. Wastage Cost & Rate</span>
                <h3 className="text-2xl font-extrabold text-red-400 mt-1">
                  ₹{(analytics?.wastage_cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </h3>
                <span className="text-[10px] text-red-400 mt-1 block">
                  {(analytics?.wastage_percentage || 0).toFixed(1)}% of total inventory usage
                </span>
              </div>

            </div>

            {/* 10-Point Detailed Analytics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Metric 5: Top Consumed Ingredients */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6">
                <h4 className="text-sm font-bold text-white font-display mb-4 flex items-center gap-2">
                  <TrendingUp className="text-brand-400" size={16} /> 5. Top Consumed Ingredients
                </h4>

                <div className="space-y-3">
                  {analytics && analytics.top_consumed_ingredients.length > 0 ? (
                    analytics.top_consumed_ingredients.map((item, idx) => (
                      <div key={idx} className="glass-card p-3 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-white block">{item.ingredient_name}</span>
                          <span className="text-dark-400">Total Usage: {item.quantity} {item.unit}</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-brand-300 block">₹{item.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          <span className="text-[10px] text-dark-500">COGS Impact</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-dark-400 italic text-center py-6">No consumption analytics available.</p>
                  )}
                </div>
              </div>

              {/* Metric 6: Wastage Analysis by Reason */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6">
                <h4 className="text-sm font-bold text-white font-display mb-4 flex items-center gap-2">
                  <AlertTriangle className="text-red-400" size={16} /> 6. Wastage Analysis by Reason
                </h4>

                <div className="space-y-3">
                  {analytics && analytics.wastage_by_reason.length > 0 ? (
                    analytics.wastage_by_reason.map((item, idx) => (
                      <div key={idx} className="glass-card p-3 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-white block">{item.reason}</span>
                          <span className="text-dark-400">{item.quantity} units spoiled/lost</span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-red-400 block">₹{item.cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          <span className="text-[10px] text-dark-500">Financial Loss</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-dark-400 italic text-center py-6">No wastage recorded in this period.</p>
                  )}
                </div>
              </div>

              {/* Metric 7 & 8: Reorder Status & Vendor Performance */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6">
                <h4 className="text-sm font-bold text-white font-display mb-4 flex items-center gap-2">
                  <ShoppingCart className="text-blue-400" size={16} /> 7 & 8. Vendor Performance & Reorder Status
                </h4>

                <div className="space-y-3">
                  {reorderAlerts.length > 0 ? (
                    reorderAlerts.map(a => (
                      <div key={a.alert_id} className="glass-card p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-white block">{a.ingredient_name}</span>
                          <span className="text-red-400 font-mono">Current: {a.current_balance} / Min: {a.min_threshold} {a.unit}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-dark-400 block">Supplier: {a.vendor_name}</span>
                          <a href={`tel:${a.vendor_phone}`} className="text-emerald-400 font-mono text-[10px] hover:underline font-bold">
                            Call {a.vendor_phone}
                          </a>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs text-center">
                      ✓ All ingredients are currently above minimum safety thresholds.
                    </div>
                  )}
                </div>
              </div>

              {/* Metric 9 & 10: Stock Movement & Overview Summary */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6">
                <h4 className="text-sm font-bold text-white font-display mb-4 flex items-center gap-2">
                  <BarChart3 className="text-emerald-400" size={16} /> 9 & 10. Daily Consumption & Movement Trend
                </h4>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between p-3 glass-card rounded-xl">
                    <span className="text-dark-300">Total Consumption Volume:</span>
                    <span className="font-mono font-bold text-white">{analytics?.total_consumption_qty || 0} Units</span>
                  </div>
                  <div className="flex justify-between p-3 glass-card rounded-xl">
                    <span className="text-dark-300">Total Wastage Volume:</span>
                    <span className="font-mono font-bold text-red-400">{analytics?.total_wastage_qty || 0} Units</span>
                  </div>
                  <div className="flex justify-between p-3 glass-card rounded-xl">
                    <span className="text-dark-300">Procurement Items:</span>
                    <span className="font-mono font-bold text-blue-400">{purchases.length} Purchase Logs</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* MODAL 1: RECORD STOCK TRANSACTION */}
      {showTxModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowTxModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Archive className="text-brand-400" /> Log Stock Transaction
            </h3>

            {needsOverride ? (
              <div className="space-y-6">
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-xl flex gap-3">
                  <AlertTriangle className="shrink-0 text-amber-500" size={24} />
                  <div>
                    <h4 className="text-sm font-bold text-white font-display">Manager Override Required</h4>
                    <p className="text-xs text-amber-400/80 mt-1 leading-relaxed">{overrideMessage}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="overrideCheck"
                    checked={overrideChecked}
                    onChange={(e) => setOverrideChecked(e.target.checked)}
                    className="w-4 h-4 bg-dark-900 border border-dark-800 rounded focus:ring-brand-500 text-brand-600 cursor-pointer"
                  />
                  <label htmlFor="overrideCheck" className="text-xs text-dark-200 cursor-pointer font-medium select-none">
                    Confirm manager override credentials verification
                  </label>
                </div>

                {txError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                    {txError}
                  </p>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => { setNeedsOverride(false); setOverrideChecked(false); }}
                    className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleOverrideSubmit}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/10"
                  >
                    Authorize Override
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => handleTxSubmit(e, false)} className="space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Select Ingredient</label>
                  <select
                    value={txForm.ingredient_id}
                    onChange={(e) => {
                      const ing = levels.find(l => l.ingredient_id === e.target.value);
                      setTxForm({
                        ...txForm,
                        ingredient_id: e.target.value,
                        unit_cost: ing ? ing.cost_per_unit : txForm.unit_cost
                      });
                    }}
                    className="glass-input w-full bg-dark-950"
                    required
                  >
                    <option value="" disabled>Select ingredient</option>
                    {levels.map((item) => (
                      <option key={item.ingredient_id} value={item.ingredient_id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Transaction Type</label>
                    <select
                      value={txForm.type}
                      onChange={(e) => setTxForm({ ...txForm, type: e.target.value as any })}
                      className="glass-input w-full bg-dark-950"
                      required
                    >
                      <option value="purchase">Purchase (Inward)</option>
                      <option value="consumption">Consumption (Used)</option>
                      <option value="wastage">Wastage (Spoiled/Burnt)</option>
                      <option value="opening">Opening Stock</option>
                      <option value="closing">Closing Stock</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Quantity</label>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      value={txForm.quantity}
                      onChange={(e) => setTxForm({ ...txForm, quantity: Number(e.target.value) })}
                      className="glass-input w-full"
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Unit Cost (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={txForm.unit_cost}
                    onChange={(e) => setTxForm({ ...txForm, unit_cost: Number(e.target.value) })}
                    className="glass-input w-full"
                    required
                  />
                </div>

                {txForm.type === 'purchase' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Supplier / Vendor</label>
                    <select
                      value={txForm.vendor_id}
                      onChange={(e) => setTxForm({ ...txForm, vendor_id: e.target.value })}
                      className="glass-input w-full bg-dark-950"
                    >
                      <option value="">Direct / Unregistered Vendor</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name} ({v.phone || 'No phone'})</option>
                      ))}
                    </select>
                  </div>
                )}

                {txForm.type === 'wastage' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-mono text-dark-400">Wastage Reason</label>
                    <select
                      value={txForm.reason}
                      onChange={(e) => setTxForm({ ...txForm, reason: e.target.value })}
                      className="glass-input w-full bg-dark-950"
                    >
                      <option value="Burnt">Burnt (Cooking error)</option>
                      <option value="Rotten">Rotten (Spoiled in storage)</option>
                      <option value="Expired">Expired (Passed date)</option>
                      <option value="Spoiled">Spoiled (Contaminated)</option>
                      <option value="Damaged">Damaged (Physical damage)</option>
                      <option value="Other">Other / Spilled</option>
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Notes / Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Daily shift stock update"
                    value={txForm.notes}
                    onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                    className="glass-input w-full text-xs"
                  />
                </div>

                {txSuccess && (
                  <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg flex items-center gap-1.5">
                    <Check size={14} /> {txSuccess}
                  </p>
                )}

                {txError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-1.5">
                    <AlertTriangle size={14} /> {txError}
                  </p>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowTxModal(false)}
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
                    <span>Save Transaction</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: REGISTER VENDOR */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowVendorModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Users className="text-brand-400" /> {vendorForm.id ? 'Edit Supplier' : 'Register Supplier Vendor'}
            </h3>

            <form onSubmit={handleVendorSubmit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Vendor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Fresh Farm / Sysco Foods"
                  value={vendorForm.name}
                  onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                  className="glass-input w-full"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Contact Person</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={vendorForm.contact_name}
                  onChange={(e) => setVendorForm({ ...vendorForm, contact_name: e.target.value })}
                  className="glass-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Email Address</label>
                  <input
                    type="email"
                    placeholder="orders@freshfarm.com"
                    value={vendorForm.email}
                    onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                    className="glass-input w-full text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Phone Contact</label>
                  <input
                    type="text"
                    placeholder="9876543210"
                    value={vendorForm.phone}
                    onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                    className="glass-input w-full text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Supplied Ingredients</label>
                <input
                  type="text"
                  placeholder="e.g. Chicken, Eggs, Milk"
                  value={vendorForm.supplies}
                  onChange={(e) => setVendorForm({ ...vendorForm, supplies: e.target.value })}
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
                  <AlertTriangle size={14} /> {txError}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowVendorModal(false)}
                  className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Save Supplier</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD/EDIT INGREDIENT */}
      {showIngredientModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowIngredientModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Archive className="text-brand-400" /> {ingredientForm.id ? 'Edit Ingredient' : 'Add Raw Ingredient'}
            </h3>

            <form onSubmit={handleIngredientSubmit} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Ingredient Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rice / Chicken / Tomato"
                  value={ingredientForm.name}
                  onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })}
                  className="glass-input w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Unit</label>
                  <select
                    value={ingredientForm.unit}
                    onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
                    className="glass-input w-full bg-dark-950 text-xs"
                  >
                    <option value="kg">kg</option>
                    <option value="liters">liters</option>
                    <option value="units">units</option>
                    <option value="pieces">pieces</option>
                    <option value="grams">grams</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Min Limit</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={ingredientForm.min_threshold}
                    onChange={(e) => setIngredientForm({ ...ingredientForm, min_threshold: Number(e.target.value) })}
                    className="glass-input w-full text-xs font-mono"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Cost/Unit (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={ingredientForm.cost_per_unit}
                    onChange={(e) => setIngredientForm({ ...ingredientForm, cost_per_unit: Number(e.target.value) })}
                    className="glass-input w-full text-xs font-mono"
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
                  <AlertTriangle size={14} /> {txError}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowIngredientModal(false)}
                  className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-semibold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Save Ingredient</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: QUICK REORDER DIALOG */}
      {showReorderModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-red-500/30 rounded-2xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setShowReorderModal(null)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-2 flex items-center gap-2">
              <AlertTriangle className="text-red-400" /> Reorder Notice: {showReorderModal.ingredient_name}
            </h3>

            <div className="glass-card bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-xs space-y-2 mb-4">
              <p><span className="text-dark-400">Current Stock Level:</span> <strong className="text-red-400 font-mono">{showReorderModal.current_balance} {showReorderModal.unit}</strong></p>
              <p><span className="text-dark-400">Minimum Safety Threshold:</span> <strong className="text-white font-mono">{showReorderModal.min_threshold} {showReorderModal.unit}</strong></p>
              <p><span className="text-dark-400">Assigned Vendor:</span> <strong className="text-white">{showReorderModal.vendor_name}</strong></p>
              {showReorderModal.vendor_phone && (
                <p><span className="text-dark-400">Phone Contact:</span> <strong className="text-emerald-400 font-mono">{showReorderModal.vendor_phone}</strong></p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (showReorderModal.alert_id) {
                    await resolveReorderAlert(showReorderModal.alert_id);
                  }
                  setShowReorderModal(null);
                  refreshAllData();
                }}
                className="flex-1 glass-card hover:bg-dark-800 text-white font-semibold py-2.5 rounded-xl transition text-xs cursor-pointer"
              >
                Mark Alert Resolved
              </button>
              <button
                onClick={() => {
                  const alertItem = showReorderModal;
                  setShowReorderModal(null);
                  const ing = levels.find(l => l.name === alertItem.ingredient_name);
                  setTxForm({
                    ingredient_id: ing ? ing.ingredient_id : (levels[0]?.ingredient_id || ''),
                    type: 'purchase',
                    quantity: 20,
                    unit_cost: ing ? ing.cost_per_unit : 50,
                    vendor_id: vendors[0]?.id || '',
                    reason: '',
                    notes: `Reorder replenishment for ${alertItem.ingredient_name}`
                  });
                  setShowTxModal(true);
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-1 cursor-pointer shadow-lg shadow-red-600/20"
              >
                <ShoppingCart size={14} /> Log Replenishment Order
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
