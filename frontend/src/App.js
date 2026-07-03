import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

import Landing from "@/pages/Landing";
import AdminLogin from "@/pages/AdminLogin";
import Signup from "@/pages/Signup";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminGalleryDetail from "@/pages/AdminGalleryDetail";
import AdminSettings from "@/pages/AdminSettings";
import TenantOnboarding from "@/pages/TenantOnboarding";
import SuperAdminLogin from "@/pages/SuperAdminLogin";
import SuperAdminDashboard from "@/pages/SuperAdminDashboard";
import ShareView from "@/pages/ShareView";

function Protected({ children }) {
  const { loading, admin, tenant } = useAuth();
  if (loading)
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</div>;
  if (!admin) return <Navigate to="/login" replace />;
  if (tenant && !tenant.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <Toaster theme="dark" position="top-right" richColors />
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<AdminLogin />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/onboarding" element={<TenantOnboarding />} />
              <Route path="/admin" element={<Protected><AdminDashboard /></Protected>} />
              <Route path="/admin/gallery/:id" element={<Protected><AdminGalleryDetail /></Protected>} />
              <Route path="/admin/settings" element={<Protected><AdminSettings /></Protected>} />
              <Route path="/super-admin" element={<SuperAdminLogin />} />
              <Route path="/superadmin" element={<SuperAdminLogin />} />
              <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />
              <Route path="/superadmin/dashboard" element={<SuperAdminDashboard />} />
              <Route path="/s/:token" element={<ShareView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}

export default App;
