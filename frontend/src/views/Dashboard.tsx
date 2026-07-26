import React, { useState, useEffect } from 'react';
import { useSales } from '../hooks/useSales';
import { useInventory } from '../hooks/useInventory';
import { useFeedback } from '../hooks/useFeedback';
import { useAuth } from '../hooks/useAuth';
import { 
  Sparkles, LayoutDashboard, Archive, TrendingUp, Calendar, 
  MessageSquare, RefreshCw 
} from 'lucide-react';

// Subcomponents tabs
import { OverviewTab } from './tabs/OverviewTab';
import { InventoryTab } from './tabs/InventoryTab';
import { SalesTab } from './tabs/SalesTab';
import { SchedulingTab } from './tabs/SchedulingTab';
import { FeedbackTab } from './tabs/FeedbackTab';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenantId || 'tenant-hq-1';
  const outletId = user?.outletIds?.[0] || 'outlet-bistro-1';
  const userRole = user?.role || 'Staff';

  const [activeTab, setActiveTab] = useState<'overview' | 'inventory' | 'sales' | 'scheduling' | 'feedback'>('overview');

  const { trends, syncOfflineAlert, fetchTrends } = useSales();
  const { levels, fetchLevels } = useInventory();
  const { reviews, sentimentMetrics, fetchFeedback } = useFeedback();

  // Load data for overview card previews on load
  useEffect(() => {
    fetchTrends(tenantId, outletId);
    fetchLevels(tenantId, outletId);
    fetchFeedback(tenantId, outletId);
  }, [tenantId, outletId, fetchTrends, fetchLevels, fetchFeedback]);

  // Filters low stock items
  const lowStockItems = levels.filter(l => l.needs_reorder);

  // Trigger full reload
  const handleRefreshAll = () => {
    fetchTrends(tenantId, outletId);
    fetchLevels(tenantId, outletId);
    fetchFeedback(tenantId, outletId);
  };

  return (
    <div className="min-h-screen bg-dark-950 p-4 md:p-8 flex flex-col gap-6">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-display flex items-center gap-2">
            <Sparkles className="text-brand-400 animate-pulse" size={28} /> Centralized Operations Hub
          </h1>
          <p className="text-dark-400 text-sm mt-1">Real-time multi-tenant telemetry and restaurant management dashboard console</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={handleRefreshAll}
            className="glass-card hover:bg-dark-800 p-2.5 rounded-xl transition text-dark-300 hover:text-white"
            title="Refresh All Operations Telemetry"
          >
            <RefreshCw size={18} />
          </button>
          <span className="glass-card px-4 py-2.5 rounded-xl text-xs font-semibold text-brand-300 font-mono">
            Tenant: {tenantId}
          </span>
          <span className="glass-card px-4 py-2.5 rounded-xl text-xs font-semibold text-brand-300 font-mono">
            Outlet: {outletId}
          </span>
          <span className="glass-card px-4 py-2.5 rounded-xl text-xs font-semibold text-violet-300 font-mono">
            Role: {userRole}
          </span>
        </div>
      </header>

      {/* Main Tabs Navigation Bar */}
      <div className="flex border-b border-dark-800 gap-2 overflow-x-auto pb-1 shrink-0">
        {[
          { id: 'overview', label: 'Operations Overview', icon: LayoutDashboard },
          { id: 'inventory', label: 'Inventory & Wastage', icon: Archive },
          { id: 'sales', label: 'Sales & Menu Performance', icon: TrendingUp },
          { id: 'scheduling', label: 'Shift Roster & Leaves', icon: Calendar },
          { id: 'feedback', label: 'Customer Sentiment & Reviews', icon: MessageSquare }
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 font-semibold text-sm transition font-display whitespace-nowrap ${
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

      {/* Tab Panel Viewport */}
      <div className="flex-1 mt-2">
        {activeTab === 'overview' && (
          <OverviewTab 
            tenantId={tenantId}
            outletId={outletId}
            trends={trends}
            lowStockItems={lowStockItems}
            sentimentMetrics={sentimentMetrics}
            reviews={reviews}
            syncOfflineAlert={syncOfflineAlert}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryTab 
            tenantId={tenantId}
            outletId={outletId}
            userRole={userRole}
          />
        )}

        {activeTab === 'sales' && (
          <SalesTab 
            tenantId={tenantId}
            outletId={outletId}
            trends={trends}
          />
        )}

        {activeTab === 'scheduling' && (
          <SchedulingTab 
            tenantId={tenantId}
            outletId={outletId}
          />
        )}

        {activeTab === 'feedback' && (
          <FeedbackTab 
            tenantId={tenantId}
            outletId={outletId}
          />
        )}
      </div>

    </div>
  );
};

export default Dashboard;
