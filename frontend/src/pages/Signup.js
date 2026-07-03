import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { pub, TENANT_TOKEN_KEY, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Footer from "@/components/Footer";
import useTitle from "@/lib/useTitle";

const PLAN_LABELS = { starter: "Starter · £15/mo · 10 galleries", professional: "Professional · £35/mo · 30 galleries", studio: "Studio · £65/mo · 60 galleries" };

export default function Signup() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { loginWithToken } = useAuth();
  const [form, setForm] = useState({
    business_name: "", email: "", password: "",
    plan: ["starter", "professional", "studio"].includes(params.get("plan")) ? params.get("plan") : "starter",
  });
  const [busy, setBusy] = useState(false);
  useTitle("Create Account");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await pub.post("/admin/register", form);
      localStorage.setItem(TENANT_TOKEN_KEY, data.token);
      await loginWithToken(data.token);
      toast.success("Your studio account is ready");
      nav("/onboarding");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--sa-bg)" }}>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="font-display text-3xl font-bold block text-center mb-2" style={{ color: "var(--sa-gold)" }}>StudioApp</Link>
          <p className="text-center sa-label mb-8">Create your business account</p>
          <form onSubmit={submit} className="sa-card p-8 space-y-5" data-testid="signup-form">
            <div>
              <label className="sa-label block mb-2">Business name</label>
              <input className="sa-input" placeholder="Weddings by Mark" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required data-testid="signup-business" />
            </div>
            <div>
              <label className="sa-label block mb-2">Email</label>
              <input className="sa-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="signup-email" />
            </div>
            <div>
              <label className="sa-label block mb-2">Password</label>
              <input className="sa-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} data-testid="signup-password" />
            </div>
            <div>
              <label className="sa-label block mb-2">Plan</label>
              <select className="sa-input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} data-testid="signup-plan">
                {Object.entries(PLAN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <p className="text-xs mt-2" style={{ color: "var(--sa-muted)" }}>You can add payment later in Settings → Billing.</p>
            </div>
            <button className="sa-btn w-full" disabled={busy} data-testid="signup-submit">{busy ? "Creating…" : "Create my business account"} <ArrowRight size={16} /></button>
          </form>
          <p className="text-center text-sm mt-6" style={{ color: "var(--sa-muted)" }}>
            Already have an account? <Link to="/login" className="underline" style={{ color: "var(--sa-gold)" }} data-testid="link-login">Sign in</Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
