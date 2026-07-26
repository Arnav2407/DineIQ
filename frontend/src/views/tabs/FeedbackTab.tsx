import React, { useState, useEffect, useCallback } from 'react';
import { useFeedback } from '../../hooks/useFeedback';
import {
  MessageSquare, Star, Plus, X, Heart, RefreshCw, Loader2,
  Check, AlertCircle, Sparkles, Filter, Mail, FileText
} from 'lucide-react';

interface FeedbackTabProps {
  tenantId: string;
  outletId: string;
}

export const FeedbackTab: React.FC<FeedbackTabProps> = ({ tenantId, outletId }) => {
  const {
    loading, error: feedbackError, reviews, sentimentMetrics,
    fetchFeedback, ingestReviews
  } = useFeedback();

  // Navigation tab
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'weekly'>('feed');

  // Filters
  const [platformFilter, setPlatformFilter] = useState<string>('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('');

  // Modals
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  // Forms
  const [intakeForm, setIntakeForm] = useState({
    platform: 'Google',
    rating: 5,
    review_text: ''
  });

  const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

  const loadData = useCallback(() => {
    fetchFeedback(
      tenantId,
      outletId,
      platformFilter || undefined,
      sentimentFilter || undefined
    );
  }, [tenantId, outletId, platformFilter, sentimentFilter, fetchFeedback]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Submit mock review
  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    setTxSuccess(null);

    const payload = {
      tenant_id: tenantId,
      outlet_id: outletId,
      platform: intakeForm.platform,
      reviews: [
        {
          platform_review_id: `mock-rev-${Date.now()}`,
          rating: Number(intakeForm.rating),
          review_text: intakeForm.review_text,
          review_date: new Date().toISOString()
        }
      ]
    };

    try {
      await ingestReviews(payload);
      setTxSuccess('Review ingested! Backend NLP batch process triggered in background.');
      setIntakeForm({
        platform: 'Google',
        rating: 5,
        review_text: ''
      });

      // Periodic reload to catch NLP processed status changes
      setTimeout(() => {
        loadData();
      }, 1000);

      setTimeout(() => {
        setShowIntakeModal(false);
        setTxSuccess(null);
      }, 1800);
    } catch (err: any) {
      setTxError(err.message || 'Ingestion failed.');
    }
  };

  // Trigger retry triage
  const handleRetryTriage = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/feedback/retry-triage`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('dineiq_token') || ''}`
        }
      });
      if (!res.ok) throw new Error(await res.text());
      loadData();
    } catch (err: any) {
      alert(`Retry Triage failed: ${err.message}`);
    }
  };

  // Helper to render rating stars
  const renderStars = (rating: number) => {
    const stars = [];
    const floor = Math.floor(rating);
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          size={14}
          className={i <= floor ? 'text-amber-400 fill-amber-400' : 'text-dark-700'}
        />
      );
    }
    return <div className="flex gap-0.5">{stars}</div>;
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Sub-header Navigation */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex border-b border-dark-800 gap-2">
          {[
            { id: 'feed', label: 'Customer Reviews Feed', icon: MessageSquare },
            { id: 'weekly', label: 'Weekly Executive Summaries', icon: FileText }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition font-display ${active
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

        <div className="flex gap-3">
          <button
            onClick={handleRetryTriage}
            className="glass-card border border-brand-500/30 text-brand-300 hover:bg-brand-500/10 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition"
            title="Retry NLP processing for failed reviews"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Retry NLP Triage
          </button>
          <button
            onClick={() => {
              setIntakeForm({ platform: 'Google', rating: 5, review_text: '' });
              setTxError(null);
              setShowIntakeModal(true);
            }}
            className="glow-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition"
          >
            <Plus size={16} /> Simulate Customer Review
          </button>
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex-1">

        {/* SUB-TAB 1: REVIEWS FEED */}
        {activeSubTab === 'feed' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Left: Sentiment index and filters */}
            <div className="flex flex-col gap-6 lg:col-span-1">

              {/* Sentiment metrics card */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col">
                <h3 className="text-base font-bold text-white font-display mb-4">Sentiment Distribution</h3>

                <div className="flex gap-2.5 mb-6 h-5 w-full rounded-full overflow-hidden bg-dark-900">
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

                <div className="grid grid-cols-3 text-center text-xs font-mono font-bold">
                  <div className="text-green-400">
                    <span className="text-[10px] text-dark-500 uppercase block font-mono">Positive</span>
                    <span className="text-base mt-1 block">{(sentimentMetrics.positive_ratio * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-slate-400">
                    <span className="text-[10px] text-dark-500 uppercase block font-mono">Neutral</span>
                    <span className="text-base mt-1 block">{(sentimentMetrics.neutral_ratio * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-red-400">
                    <span className="text-[10px] text-dark-500 uppercase block font-mono">Negative</span>
                    <span className="text-base mt-1 block">{(sentimentMetrics.negative_ratio * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {/* Filters Card */}
              <div className="glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col gap-4">
                <h3 className="text-base font-bold text-white font-display flex items-center gap-1.5">
                  <Filter size={16} className="text-brand-400" /> Filter Reviews
                </h3>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Platform</label>
                  <select
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                    className="glass-input w-full bg-dark-950"
                  >
                    <option value="">All Platforms</option>
                    <option value="Google">Google</option>
                    <option value="Zomato">Zomato</option>
                    <option value="Swiggy">Swiggy</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Sentiment</label>
                  <select
                    value={sentimentFilter}
                    onChange={(e) => setSentimentFilter(e.target.value)}
                    className="glass-input w-full bg-dark-950"
                  >
                    <option value="">All Sentiments</option>
                    <option value="POSITIVE">Positive</option>
                    <option value="NEUTRAL">Neutral</option>
                    <option value="NEGATIVE">Negative</option>
                  </select>
                </div>
              </div>

            </div>

            {/* Right: Reviews List Feed */}
            <div className="lg:col-span-2 glass-panel border border-dark-800 rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="text-base font-bold text-white font-display mb-2">Customer Feedback Feed</h3>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {reviews.length > 0 ? (
                  reviews.map((rev) => {
                    let sentimentBadge = 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
                    if (rev.sentiment === 'POSITIVE') sentimentBadge = 'bg-green-500/10 text-green-400 border border-green-500/20';
                    if (rev.sentiment === 'NEGATIVE') sentimentBadge = 'bg-red-500/10 text-red-400 border border-red-500/20';

                    let triageBadge = 'bg-yellow-500/10 text-yellow-400';
                    if (rev.triage_status === 'PROCESSED') triageBadge = 'bg-emerald-500/10 text-emerald-400';
                    if (rev.triage_status === 'FAILED') triageBadge = 'bg-red-500/10 text-red-400';

                    const dateStr = new Date(rev.review_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

                    return (
                      <div key={rev.id} className="glass-card p-4 rounded-xl border border-dark-800 flex flex-col gap-3">
                        <div className="flex justify-between items-start gap-4 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white font-display text-sm">{rev.platform}</span>
                              {renderStars(rev.rating)}
                            </div>
                            <span className="text-[10px] text-dark-500 font-mono mt-1 block">Date: {dateStr}</span>
                          </div>

                          <div className="flex gap-2">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${sentimentBadge}`}>
                              {rev.sentiment}
                            </span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono ${triageBadge}`}>
                              NLP: {rev.triage_status}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-dark-200 leading-relaxed italic">"{rev.review_text}"</p>

                        {/* Keyword-based theme tags check */}
                        {rev.triage_status === 'PROCESSED' && (
                          <div className="flex flex-wrap gap-1.5 border-t border-dark-800/40 pt-3">
                            <span className="text-[9px] uppercase font-mono text-dark-500 mt-0.5">Themes:</span>
                            {/* Auto tags generation based on review text fallback if themes list empty */}
                            {(rev.review_text.toLowerCase().includes('food') || rev.review_text.toLowerCase().includes('delicious') || rev.review_text.toLowerCase().includes('steak')) && (
                              <span className="text-[9px] bg-brand-500/10 text-brand-300 border border-brand-500/10 px-2 py-0.5 rounded font-mono font-semibold">#FOOD_QUALITY</span>
                            )}
                            {(rev.review_text.toLowerCase().includes('slow') || rev.review_text.toLowerCase().includes('fast') || rev.review_text.toLowerCase().includes('wait')) && (
                              <span className="text-[9px] bg-brand-500/10 text-brand-300 border border-brand-500/10 px-2 py-0.5 rounded font-mono font-semibold">#SERVICE_SPEED</span>
                            )}
                            {(rev.review_text.toLowerCase().includes('clean') || rev.review_text.toLowerCase().includes('dirty')) && (
                              <span className="text-[9px] bg-brand-500/10 text-brand-300 border border-brand-500/10 px-2 py-0.5 rounded font-mono font-semibold">#CLEANLINESS</span>
                            )}
                            {(!rev.review_text.toLowerCase().includes('food') && !rev.review_text.toLowerCase().includes('wait') && !rev.review_text.toLowerCase().includes('clean')) && (
                              <span className="text-[9px] bg-dark-900 text-dark-400 border border-dark-800 px-2 py-0.5 rounded font-mono">#AMBIENCE</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-dark-400 italic text-center py-12">No matching reviews found.</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* SUB-TAB 2: WEEKLY SUMMARIES */}
        {activeSubTab === 'weekly' && (
          <div className="glass-panel border border-dark-800 rounded-2xl p-6 max-w-2xl mx-auto flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-white font-display flex items-center gap-1.5">
                <Mail className="text-brand-400" /> Weekly Feedback digest summary
              </h3>
              <p className="text-xs text-dark-400 mt-1">Simulated HTML digest template dispatched weekly to manager inbox</p>
            </div>

            {/* Compiled HTML preview layout */}
            <div className="bg-white rounded-2xl p-6 text-slate-800 border border-slate-200">
              <h2 className="text-xl font-bold text-indigo-600 font-display">DineIQ Weekly Feedback Digest</h2>
              <p className="text-xs text-slate-500 mt-1">Metrics summary for the last 7 days (Tenant: <strong>{tenantId}</strong>, Outlet: <strong>{outletId}</strong>):</p>

              <table className="w-full border-collapse mt-4 text-sm text-slate-700">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="p-2.5 border border-slate-200 text-left font-bold">Metric</th>
                    <th className="p-2.5 border border-slate-200 text-right font-bold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2.5 border border-slate-200 font-medium">Total Reviews Received</td>
                    <td className="p-2.5 border border-slate-200 text-right font-mono font-bold">{reviews.length}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 border border-slate-200 font-medium">Average Rating</td>
                    <td className="p-2.5 border border-slate-200 text-right font-mono font-bold">
                      {(reviews.reduce((acc, r) => acc + r.rating, 0) / (reviews.length || 1)).toFixed(2)} / 5.00
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 border border-slate-200 font-medium text-emerald-600">Positive Reviews</td>
                    <td className="p-2.5 border border-slate-200 text-right font-mono text-emerald-600 font-semibold">
                      {reviews.filter(r => r.sentiment === 'POSITIVE').length}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 border border-slate-200 font-medium text-red-600">Negative Reviews</td>
                    <td className="p-2.5 border border-slate-200 text-right font-mono text-red-600 font-semibold">
                      {reviews.filter(r => r.sentiment === 'NEGATIVE').length}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="border-t border-slate-100 mt-6 pt-4 text-[10px] text-slate-400">
                This digest was compiled automatically by DineIQ Feedback Engine.
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL: INPUT CUSTOMER REVIEW */}
      {showIntakeModal && (
        <div className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel border border-dark-800 rounded-2xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setShowIntakeModal(false)}
              className="absolute top-4 right-4 text-dark-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white font-display mb-4 flex items-center gap-2">
              <Sparkles className="text-brand-400" /> Simulate Customer Review
            </h3>

            <form onSubmit={handleIntakeSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Review Platform</label>
                  <select
                    value={intakeForm.platform}
                    onChange={(e) => setIntakeForm({ ...intakeForm, platform: e.target.value })}
                    className="glass-input w-full bg-dark-950"
                    required
                  >
                    <option value="Google">Google Reviews</option>
                    <option value="Zomato">Zomato Food</option>
                    <option value="Swiggy">Swiggy Orders</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono text-dark-400">Rating Stars</label>
                  <select
                    value={intakeForm.rating}
                    onChange={(e) => setIntakeForm({ ...intakeForm, rating: Number(e.target.value) })}
                    className="glass-input w-full bg-dark-950"
                    required
                  >
                    <option value={5}>5 Stars (Excellent)</option>
                    <option value={4}>4 Stars (Good)</option>
                    <option value={3}>3 Stars (Average)</option>
                    <option value={2}>2 Stars (Poor)</option>
                    <option value={1}>1 Star (Worst)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-mono text-dark-400">Review text message</label>
                <textarea
                  value={intakeForm.review_text}
                  onChange={(e) => setIntakeForm({ ...intakeForm, review_text: e.target.value })}
                  placeholder="e.g. Delicious food, but the service was a bit slow."
                  rows={4}
                  className="w-full bg-dark-950 text-xs p-3 rounded-lg border border-dark-800 text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  required
                ></textarea>
              </div>

              {txSuccess && (
                <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <Check size={14} /> {txSuccess}
                </p>
              )}

              {txError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                  <AlertCircle size={14} /> {txError}
                </p>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowIntakeModal(false)}
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
                  <span>Ingest Review</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
