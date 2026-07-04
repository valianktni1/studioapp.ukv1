import React, { createContext, useContext, useEffect, useState } from "react";
import { tenantApi, TENANT_TOKEN_KEY } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, admin: null, tenant: null });

  const refresh = async () => {
    const t = localStorage.getItem(TENANT_TOKEN_KEY);
    if (!t) {
      setState({ loading: false, admin: null, tenant: null });
      return null;
    }
    try {
      const { data } = await tenantApi.get("/admin/me");
      setState({ loading: false, admin: data, tenant: data.tenant });
      return data;
    } catch {
      localStorage.removeItem(TENANT_TOKEN_KEY);
      setState({ loading: false, admin: null, tenant: null });
      return null;
    }
  };

  useEffect(() => { refresh(); }, []);

  const loginWithToken = async (token) => {
    localStorage.setItem(TENANT_TOKEN_KEY, token);
    return refresh();
  };

  const logout = () => {
    localStorage.removeItem(TENANT_TOKEN_KEY);
    setState({ loading: false, admin: null, tenant: null });
  };

  return (
    <AuthCtx.Provider value={{ ...state, refresh, loginWithToken, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}
