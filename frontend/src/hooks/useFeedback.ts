import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export interface CustomerReview {
  id: string;
  platform: 'Google' | 'Zomato' | 'Swiggy';
  platform_review_id: string;
  rating: number;
  review_text: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  triage_status: 'PENDING' | 'PROCESSED' | 'FAILED';
  review_date: string;
}

export interface RollingSentiment {
  positive_ratio: number;
  neutral_ratio: number;
  negative_ratio: number;
}

export const useFeedback = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [sentimentMetrics, setSentimentMetrics] = useState<RollingSentiment>({
    positive_ratio: 0,
    neutral_ratio: 0,
    negative_ratio: 0,
  });

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('dineiq_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }, []);

  const fetchFeedback = useCallback(async (tenantId: string, outletId: string, platform?: string, sentiment?: string) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/api/v1/feedback/reviews?tenant_id=${tenantId}&outlet_id=${outletId}`;
      if (platform) url += `&platform=${platform}`;
      if (sentiment) url += `&sentiment=${sentiment}`;

      const res = await fetch(url, { headers: getHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReviews(data.reviews || []);
      setSentimentMetrics(data.rolling_sentiment || {
        positive_ratio: 0,
        neutral_ratio: 0,
        negative_ratio: 0,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch customer reviews');
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const ingestReviews = useCallback(async (payload: { tenant_id: string; outlet_id: string; platform: string; reviews: any[] }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/feedback/ingest`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to ingest feedback data');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  return {
    loading,
    error,
    reviews,
    sentimentMetrics,
    fetchFeedback,
    ingestReviews,
  };
};
