import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Login } from './views/Login';
import { Dashboard } from './views/Dashboard';
import { AttendancePWA } from './views/AttendancePWA';
import { ReservationManager } from './views/ReservationManager';
import { PublicReservation } from './views/PublicReservation';
import { RoleGuard } from './components/RoleGuard';
import { Sparkles, LayoutDashboard, Clock, LogOut, CalendarDays } from 'lucide-react';
import { useAuth } from './hooks/useAuth';

export const App: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <Router>
      <div className="min-h-screen bg-dark-950 text-dark-100 flex flex-col">
        {/* Navigation Bar (visible if authenticated) */}
        {isAuthenticated && user && (
          <nav className="glass-panel border-b border-dark-800 px-6 py-4 flex justify-between items-center z-20">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-brand-400" />
              <span className="font-bold text-white font-display">DineIQ</span>
            </div>

            <div className="flex items-center gap-6">
              {/* Show links matching authorized roles */}
              {['Owner', 'Manager', 'Admin'].includes(user.role) && (
                <Link to="/dashboard" className="flex items-center gap-1.5 text-sm font-medium text-dark-300 hover:text-white transition">
                  <LayoutDashboard size={16} />
                  <span>Dashboard</span>
                </Link>
              )}

              {['Owner', 'Manager', 'Staff', 'Admin'].includes(user.role) && (
                <Link to="/reservations" className="flex items-center gap-1.5 text-sm font-medium text-dark-300 hover:text-white transition">
                  <CalendarDays size={16} />
                  <span>Reservations</span>
                </Link>
              )}

              <Link to="/attendance" className="flex items-center gap-1.5 text-sm font-medium text-dark-300 hover:text-white transition">
                <Clock size={16} />
                <span>Clock In/Out</span>
              </Link>

              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-sm font-medium text-red-400 hover:text-red-300 transition"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          </nav>
        )}

        {/* Content routing view block */}
        <main className="flex-1 flex flex-col">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/book" element={<PublicReservation />} />

            {/* Guarded Admin/Owner Dashboard */}
            <Route
              path="/dashboard"
              element={
                <RoleGuard allowedRoles={['Owner', 'Manager', 'Admin']}>
                  <Dashboard />
                </RoleGuard>
              }
            />

            {/* Guarded PWA Attendance View */}
            <Route
              path="/attendance"
              element={
                <RoleGuard allowedRoles={['Owner', 'Manager', 'Inventory Manager', 'Staff', 'Admin']}>
                  <AttendancePWA />
                </RoleGuard>
              }
            />

            {/* Guarded Reservations View */}
            <Route
              path="/reservations"
              element={
                <RoleGuard allowedRoles={['Owner', 'Manager', 'Staff', 'Admin']}>
                  <ReservationManager />
                </RoleGuard>
              }
            />

            {/* Fallbacks */}
            <Route
              path="*"
              element={<Navigate to={isAuthenticated ? "/attendance" : "/login"} replace />}
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
