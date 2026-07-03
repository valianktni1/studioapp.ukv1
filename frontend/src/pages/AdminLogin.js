import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import { pub, TENANT_TOKEN_KEY, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Footer from "@/components/Footer";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { loginWithToken } = useAuth();
  useTitle("Photographer Login");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await pub.post("/admin/login", { email, password });
      localStorage.setItem(TENANT_TOKEN_KEY, data.token);
      await loginWithToken(data.token);
      toast.success("Welcome back");
      nav(data.onboarding_complete ? "/admin" : "/onboarding");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--sa-bg)" }}>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <Link to="/" className="font-display text-3xl font-bold block text-center mb-2" style={{ color: "var(--sa-gold)" }}>StudioApp</Link>
          <p className="text-center sa-label mb-8">Photographer sign in</p>
          <form onSubmit={submit} className="sa-card p-8 space-y-5" data-testid="admin-login-form">
            <div>
              <label className="sa-label block mb-2">Email</label>
              <input className="sa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" />
            </div>
            <div>
              <label className="sa-label block mb-2">Password</label>
              <input className="sa-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" />
            </div>
            <button className="sa-btn w-full" disabled={busy} data-testid="login-submit"><LogIn size={18} />{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p className="text-center text-sm mt-6" style={{ color: "var(--sa-muted)" }}>
            New here? <Link to="/signup" className="underline" style={{ color: "var(--sa-gold)" }} data-testid="link-signup">Create a business account</Link>
          </p>
          <p className="text-center text-sm mt-2" style={{ color: "var(--sa-muted)" }}>
            Platform owner? <Link to="/super-admin" className="underline" style={{ color: "var(--sa-gold)" }} data-testid="link-super-admin">Super Admin</Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
