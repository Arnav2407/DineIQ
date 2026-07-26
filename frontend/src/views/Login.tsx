import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, Sparkles } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [showMfa, setShowMfa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      
      if (data.mfaRequired || data.mfa_required) {
        // MFA challenge path for privileged roles
        setShowMfa(true);
      } else {
        // Direct success
        const token = data.accessToken || data.access_token;
        const refreshToken = data.refreshToken || data.refresh_token;
        localStorage.setItem('dineiq_token', token);
        localStorage.setItem('dineiq_refresh_token', refreshToken);
        
        const userRole = data.user?.role || '';
        if (['Owner', 'Manager', 'Admin'].includes(userRole)) {
          window.location.href = '/dashboard';
        } else {
          window.location.href = '/attendance';
        }
      }
    } catch (err: any) {
      setError(err.message || 'Login credentials mismatch');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, mfaCode: mfaToken })
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const token = data.accessToken || data.access_token;
      const refreshToken = data.refreshToken || data.refresh_token;
      localStorage.setItem('dineiq_token', token);
      localStorage.setItem('dineiq_refresh_token', refreshToken);

      const userRole = data.user?.role || '';
      if (['Owner', 'Manager', 'Admin'].includes(userRole)) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/attendance';
      }
    } catch (err: any) {
      setError(err.message || 'Invalid TOTP code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative gradient glowing spheres */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl"></div>

      <div className="glass-panel max-w-md w-full rounded-2xl p-8 relative z-10">
        
        {/* Logo and header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-violet-500 items-center justify-center text-white mb-4 shadow-lg shadow-brand-500/20">
            <Sparkles size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-display">DineIQ Platform</h1>
          <p className="text-dark-400 text-xs mt-1">Multi-Tenant Hospitality Operations</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}

        {!showMfa ? (
          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-bold text-dark-300 uppercase block mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 text-dark-400" size={16} />
                <input
                  type="email"
                  required
                  placeholder="name@dineiq.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-dark-300 uppercase block mb-1">Secure Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 text-dark-400" size={16} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full pl-10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glow-btn w-full mt-2"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4">
            <div className="text-center mb-2">
              <div className="inline-flex w-10 h-10 rounded-full bg-yellow-500/10 items-center justify-center text-yellow-500 mb-2">
                <ShieldCheck size={20} />
              </div>
              <h2 className="text-sm font-bold text-white">MFA Validation Required</h2>
              <p className="text-[11px] text-dark-400 mt-1">Enter the 6-digit TOTP code generated by your Authenticator app.</p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-dark-300 uppercase block mb-1">Verification Code</label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="000000"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                className="glass-input w-full text-center text-lg tracking-widest"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glow-btn w-full mt-2"
            >
              {loading ? 'Verifying Code...' : 'Submit Verification'}
            </button>
          </form>
        )}

        {/* Public Booking Link */}
        <div className="text-center mt-6 border-t border-dark-800/60 pt-4">
          <p className="text-xs text-dark-400">
            Looking to book a table?{' '}
            <a href="/book" className="text-brand-400 hover:text-brand-300 font-semibold underline transition">
              Book a table online →
            </a>
          </p>
        </div>

      </div>
    </div>
  );
};
