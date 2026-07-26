import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface RoleGuardProps {
  allowedRoles: Array<'Owner' | 'Manager' | 'Inventory Manager' | 'Staff' | 'Admin'>;
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const isAuthorized = allowedRoles.includes(user.role);

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6">
        {/* Custom 403 Forbidden Glassmorphic View */}
        <div className="glass-panel max-w-md w-full rounded-2xl p-8 text-center border-red-500/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
          
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-6 animate-pulse">
            <ShieldAlert size={36} />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">403: Access Denied</h1>
          <p className="text-dark-400 text-sm mb-6 leading-relaxed">
            Your current credential claim <span className="text-red-400 font-semibold font-mono">[{user.role}]</span> is not authorized to access this route. Downstream API operations have been blocked.
          </p>

          <div className="flex flex-col gap-3">
            <Link 
              to="/dashboard"
              className="glow-btn bg-brand-600 hover:bg-brand-500 text-white font-medium py-2.5 rounded-lg transition"
            >
              Return to Dashboard
            </Link>
            <button 
              onClick={() => {
                localStorage.removeItem('dineiq_token');
                window.location.href = '/login';
              }}
              className="px-4 py-2 text-sm text-dark-400 hover:text-white transition"
            >
              Sign out and change account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render children and block downstream execution if credential mismatch occurred
  return <>{children}</>;
};
