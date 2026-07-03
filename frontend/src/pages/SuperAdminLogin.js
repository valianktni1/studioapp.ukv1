import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { pub, superApi, SUPER_TOKEN_KEY, apiError } from "@/lib/api";
import Footer from "@/components/Footer";
import useTitle from "@/lib/useTitle";

export default function SuperAdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  useTitle("Super Admin");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await pub.post("/super-admin/login", { username, password });
      localStorage.setItem(SUPER_TOKEN_KEY, data.token);
      toast.success("Super Admin authenticated");
      nav("/super-admin/dashboard");
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
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldCheck size={22} style={{ color: "var(--sa-gold)" }} />
            <span className="font-display text-3xl font-bold" style={{ color: "var(--sa-gold)" }}>StudioApp</span>
          </div>
          <p className="text-center sa-label mb-8">Platform Super Admin</p>
          <form onSubmit={submit} className="sa-card p-8 space-y-5" data-testid="super-login-form">
            <div>
              <label className="sa-label block mb-2">Username</label>
              <input className="sa-input" value={username} onChange={(e) => setUsername(e.target.value)} required data-testid="super-username" />
            </div>
            <div>
              <label className="sa-label block mb-2">Password</label>
              <input className="sa-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="super-password" />
            </div>
            <button className="sa-btn w-full" disabled={busy} data-testid="super-submit">{busy ? "Authenticating…" : "Enter Console"}</button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
