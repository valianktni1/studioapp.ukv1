import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { tenantApi, apiError } from "@/lib/api";
import LogoUpload from "@/components/LogoUpload";
import { useAuth } from "@/context/AuthContext";
import Footer from "@/components/Footer";
import useTitle from "@/lib/useTitle";

export default function TenantOnboarding() {
  const nav = useNavigate();
  const { loading, admin, tenant, refresh } = useAuth();
  const [step, setStep] = useState(0);
  useTitle("Studio Setup");
  const [form, setForm] = useState({
    business_name: "", contact_email: "", phone: "", website: "",
    logo_url: "", accent_color: "#D4AF37", secondary_color: "#0A0A0B",
  });

  useEffect(() => {
    if (loading) return;
    if (!admin) { nav("/login"); return; }
    if (tenant?.onboarding_complete) { nav("/admin"); return; }
    if (tenant) setForm((f) => ({ ...f, business_name: tenant.business_name || "", contact_email: tenant.email || "", logo_url: tenant.logo_url || "" }));
  }, [loading, admin, tenant]);

  const finish = async () => {
    try {
      await tenantApi.post("/admin/onboarding", form);
      await refresh();
      toast.success("Your studio is ready");
      nav("/admin");
    } catch (err) { toast.error(apiError(err)); }
  };

  const steps = ["Business", "Branding", "Finish"];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--sa-bg)" }}>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl">
          <h1 className="font-display text-4xl mb-2">Welcome to StudioApp</h1>
          <p style={{ color: "var(--sa-muted)" }} className="mb-8">Let&rsquo;s set up your studio brand.</p>

          <div className="flex items-center gap-2 mb-8">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className="h-1 rounded" style={{ background: i <= step ? "var(--sa-gold)" : "var(--sa-border)" }} />
                <span className="text-xs mt-1 block" style={{ color: i <= step ? "var(--sa-gold)" : "var(--sa-muted)" }}>{s}</span>
              </div>
            ))}
          </div>

          <div className="sa-card p-8 space-y-5" data-testid="onboarding-card">
            {step === 0 && (
              <>
                <div><label className="sa-label block mb-2">Business name</label><input className="sa-input" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} data-testid="ob-name" /></div>
                <div><label className="sa-label block mb-2">Contact email</label><input className="sa-input" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} data-testid="ob-email" /></div>
                <div><label className="sa-label block mb-2">Phone</label><input className="sa-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="ob-phone" /></div>
                <div><label className="sa-label block mb-2">Website</label><input className="sa-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} data-testid="ob-website" /></div>
              </>
            )}
            {step === 1 && (
              <>
                <div><label className="sa-label block mb-2">Logo (used on galleries &amp; emails)</label><LogoUpload value={form.logo_url} onUploaded={(url) => setForm({ ...form, logo_url: url })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="sa-label block mb-2">Accent colour</label><input type="color" className="sa-input h-12 p-1" value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} data-testid="ob-accent" /></div>
                  <div><label className="sa-label block mb-2">Background</label><input type="color" className="sa-input h-12 p-1" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} data-testid="ob-secondary" /></div>
                </div>
              </>
            )}
            {step === 2 && (
              <div className="text-center py-6">
                <Check size={40} style={{ color: "var(--sa-gold)" }} className="mx-auto mb-4" />
                <h3 className="font-display text-2xl mb-2">{form.business_name || "Your studio"} is ready</h3>
                <p style={{ color: "var(--sa-muted)" }}>You can fine-tune branding and SMTP any time in Settings.</p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button className="sa-btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)} data-testid="ob-back"><ArrowLeft size={16} /> Back</button>
              {step < 2
                ? <button className="sa-btn" onClick={() => setStep(step + 1)} data-testid="ob-next">Continue <ArrowRight size={16} /></button>
                : <button className="sa-btn" onClick={finish} data-testid="ob-finish">Enter dashboard <ArrowRight size={16} /></button>}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
