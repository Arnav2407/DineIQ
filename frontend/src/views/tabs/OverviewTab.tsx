import React from 'react';
import { TrendingUp, AlertTriangle, MessageSquare, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { SalesTrendsResponse } from '../../hooks/useSales';
import type { IngredientLevel } from '../../hooks/useInventory';
import type { CustomerReview, RollingSentiment } from '../../hooks/useFeedback';

interface OverviewTabProps {
  tenantId: string;
  outletId: string;
  trends: SalesTrendsResponse | null;
  lowStockItems: IngredientLevel[];
  sentimentMetrics: RollingSentiment;
  reviews: CustomerReview[];
  syncOfflineAlert: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  tenantId,
  outletId,
  trends,
  lowStockItems,
  sentimentMetrics,
  reviews,
  syncOfflineAlert
}) => {
  return (
    <div className="flex flex-col gap-6">
      {/* Sync Failure Banner Sentinel */}
      {syncOfflineAlert && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-2xl flex justify-between items-center shadow-lg shadow-amber-500/5 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={24} />
            <div>
              <h4 className="text-sm font-bold text-white font-display">POS Sync Sentinel Warning</h4>
              <p className="text-xs text-amber-400/80 mt-0.5">The external POS Adapter integration has been offline for over 30 minutes. Statistics may be delayed.</p>
            </div>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-white px-3 py-1.5 rounded-lg transition"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Card 1: Sales Trends Summary */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-dark-500 tracking-wider">Today's Revenue (Sales Trends)</span>
            <p className="text-2xl font-black text-white font-mono mt-1">
              ₹{trends ? trends.revenue.toLocaleString() : '0'}
            </p>
            <span className="text-[10px] text-green-400 flex items-center gap-0.5 mt-0.5 font-bold">
              {trends && trends.comparisons.day_over_day.growth_percentage >= 0 ? (
                <>
                  <ArrowUpRight size={12} />
                  <span>+{trends.comparisons.day_over_day.growth_percentage.toFixed(1)}% DoD</span>
                </>
              ) : trends ? (
                <>
                  <ArrowDownRight size={12} />
                  <span>{trends.comparisons.day_over_day.growth_percentage.toFixed(1)}% DoD</span>
                </>
              ) : (
                <span>No growth metrics today</span>
              )}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <TrendingUp size={18} />
          </div>
        </div>

        {/* Card 2: Stock Level Guards Summary */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-dark-500 tracking-wider">Stock Level Guards</span>
            <p className={`text-2xl font-black font-mono mt-1 ${lowStockItems.length > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {lowStockItems.length} Warnings
            </p>
            <span className="text-[10px] text-dark-400 mt-0.5 block">
              {lowStockItems.length > 0 ? 'Ingredients require immediate reorder' : 'All ingredient levels secure'}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            lowStockItems.length > 0 
              ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' 
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            <AlertTriangle size={18} />
          </div>
        </div>

        {/* Card 3: Customer Sentiment Summary */}
        <div className="glass-panel rounded-2xl p-5 border border-dark-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono text-dark-500 tracking-wider">Customer Sentiment Index</span>
            <p className="text-2xl font-black text-green-400 font-mono mt-1">
              {(sentimentMetrics.positive_ratio * 100).toFixed(0)}% Positive
            </p>
            <span className="text-[10px] text-dark-400 mt-0.5 block">
              Based on rolling platform reviews feed
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
            <MessageSquare size={18} />
          </div>
        </div>

      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Column 1: Sales trends comparisons */}
        <section className="glass-panel rounded-2xl p-6 flex flex-col">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 font-display">
            <TrendingUp size={20} className="text-brand-400" /> Sales Trends Details
          </h2>

          {trends ? (
            <div className="flex flex-col gap-6">
              <div>
                <span className="text-xs text-dark-400 block uppercase font-mono">Today's Revenue</span>
                <span className="text-3xl font-extrabold text-white mt-1">₹{trends.revenue.toLocaleString()}</span>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center bg-dark-900/30 p-3.5 rounded-xl border border-dark-800">
                  <div>
                    <span className="text-xs font-semibold text-white">Day-over-Day</span>
                    <span className="text-[10px] text-dark-400 block mt-0.5">Previous: ₹{trends.comparisons.day_over_day.previous_revenue.toLocaleString()}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-bold ${trends.comparisons.day_over_day.growth_percentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {trends.comparisons.day_over_day.growth_percentage >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{trends.comparisons.day_over_day.growth_percentage.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-dark-900/30 p-3.5 rounded-xl border border-dark-800">
                  <div>
                    <span className="text-xs font-semibold text-white">Week-over-Week</span>
                    <span className="text-[10px] text-dark-400 block mt-0.5">Previous: ₹{trends.comparisons.week_over_week.previous_revenue.toLocaleString()}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-bold ${trends.comparisons.week_over_week.growth_percentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {trends.comparisons.week_over_week.growth_percentage >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{trends.comparisons.week_over_week.growth_percentage.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-dark-900/30 p-3.5 rounded-xl border border-dark-800">
                  <div>
                    <span className="text-xs font-semibold text-white">Month-over-Month</span>
                    <span className="text-[10px] text-dark-400 block mt-0.5">Previous: ₹{trends.comparisons.month_over_month.previous_revenue.toLocaleString()}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-bold ${trends.comparisons.month_over_month.growth_percentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {trends.comparisons.month_over_month.growth_percentage >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{trends.comparisons.month_over_month.growth_percentage.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-dark-400 italic">No sales trend comparisons recorded today.</p>
          )}
        </section>

        {/* Column 2: Inventory levels reorders */}
        <section className="glass-panel rounded-2xl p-6 flex flex-col">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 font-display">
            <AlertTriangle size={20} className="text-yellow-500" /> Stock Level Guards
          </h2>

          <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[300px] pr-1">
            {lowStockItems.length > 0 ? (
              lowStockItems.map((item, idx) => (
                <div key={idx} className="glass-card p-3 rounded-xl flex justify-between items-center border-l-2 border-l-yellow-500">
                  <div>
                    <h4 className="text-xs font-bold text-white">{item.name}</h4>
                    <span className="text-[10px] text-dark-400">Current: {item.current_balance} {item.unit}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full font-mono">
                      Needs: &gt;{item.min_threshold} {item.unit}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-dark-400 italic py-8">
                <span className="text-xs">All ingredient balances are safe.</span>
              </div>
            )}
          </div>
        </section>

        {/* Column 3: Customer feedback reviews sentiment */}
        <section className="glass-panel rounded-2xl p-6 flex flex-col">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 font-display">
            <MessageSquare size={20} className="text-brand-400" /> Customer Sentiment Details
          </h2>

          {/* Rolling sentiment score ratios */}
          <div className="flex gap-2 mb-6 h-4 w-full rounded-full overflow-hidden bg-dark-900">
            <div 
              style={{ width: `${sentimentMetrics.positive_ratio * 100}%` }} 
              className="bg-green-500 h-full transition-all duration-300"
              title="Positive"
            ></div>
            <div 
              style={{ width: `${sentimentMetrics.neutral_ratio * 100}%` }} 
              className="bg-slate-500 h-full transition-all duration-300"
              title="Neutral"
            ></div>
            <div 
              style={{ width: `${sentimentMetrics.negative_ratio * 100}%` }} 
              className="bg-red-500 h-full transition-all duration-300"
              title="Negative"
            ></div>
          </div>

          <div className="flex justify-between text-xs text-dark-400 mb-6 font-mono">
            <span>Pos: {(sentimentMetrics.positive_ratio * 100).toFixed(0)}%</span>
            <span>Neut: {(sentimentMetrics.neutral_ratio * 100).toFixed(0)}%</span>
            <span>Neg: {(sentimentMetrics.negative_ratio * 100).toFixed(0)}%</span>
          </div>

          <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[180px] pr-1">
            {reviews.slice(0, 3).map((rev, idx) => (
              <div key={idx} className="glass-card p-3 rounded-xl flex flex-col gap-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white">{rev.platform}</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
                    rev.sentiment === 'POSITIVE' 
                      ? 'bg-green-500/10 text-green-400' 
                      : rev.sentiment === 'NEGATIVE' 
                        ? 'bg-red-500/10 text-red-400' 
                        : 'bg-slate-500/10 text-slate-400'
                  }`}>
                    {rev.sentiment}
                  </span>
                </div>
                <p className="text-dark-300 mt-1 line-clamp-2 leading-relaxed italic">"{rev.review_text}"</p>
              </div>
            ))}
          </div>
        </section>

      </div>

    </div>
  );
};
