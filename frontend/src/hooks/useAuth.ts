import { useState, useEffect } from 'react';

export interface UserClaims {
  sub: string;
  iss: string;
  tenantId: string;
  outletIds: string[];
  role: 'Owner' | 'Manager' | 'Inventory Manager' | 'Staff' | 'Admin';
  permissions: string[];
  exp: number;
}

export const useAuth = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('dineiq_token'));
  const [user, setUser] = useState<UserClaims | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      try {
        const payloadBase64 = token.split('.')[1];
        const decodedClaims = JSON.parse(atob(payloadBase64)) as UserClaims;
        
        // Check expiry
        if (decodedClaims.exp * 1000 < Date.now()) {
          console.warn('JWT token has expired');
          logout();
        } else {
          setUser(decodedClaims);
        }
      } catch (err) {
        console.error('Failed to parse auth token:', err);
        logout();
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  }, [token]);

  const login = (accessToken: string, refreshToken: string) => {
    localStorage.setItem('dineiq_token', accessToken);
    localStorage.setItem('dineiq_refresh_token', refreshToken);
    setToken(accessToken);
  };

  const logout = () => {
    localStorage.removeItem('dineiq_token');
    localStorage.removeItem('dineiq_refresh_token');
    setToken(null);
    setUser(null);
  };

  return {
    token,
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };
};
