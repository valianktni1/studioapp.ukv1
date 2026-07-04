import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Zap, Crown, Sparkles } from "lucide-react";
import { getBilling, billingCheckout, billingStatus, getErrorMessage } from "@/lib/api";

const PLAN_META = {
  starter: { icon: Sparkles, blurb: "For photographers getting started" },
  pro: { icon: Zap, blurb: "For busy wedding season workloads" },
  studio: { icon: Crown, blurb: "For established multi-shooter studios" },
};

export default function AdminBilling() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { const { data } = await getBilling(); setData(data); }
    catch (e) { toast.error(getErrorMessage(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle Stripe return
  useEffect(() => {
    const sid = params.get("session_id");
    if (!sid) return;
    let tries = 0;
    const poll = async () => {
      try {
        const { data: st } = await billingStatus(sid);
        if (st.payment_status === "paid") { toast.success(`You're now on the ${st.plan} plan!`); setParams({}); load(); return; }
        if (st.status === "expired" || tries > 8) { toast.info("Checkout not completed."); setParams({}); return; }
      } catch (e) { /* keep trying */ }
      tries += 1; setTimeout(poll, 1800);
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upgrade = async (plan) => {
    setBusy(plan);
    try {
      const { data: res } = await billingCheckout(plan, window.location.origin);
      window.location.href = res.url;
    } catch (e) { toast.error(getErrorMessage(e)); setBusy(null); }
  };

  if (!data) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#FDFCF8" }}>Loading…</div>;
  const u = data.usage;
  const pct = Math.min(100, Math.round((u.used / u.limit) * 100));

  return (
    <div className="min-h-screen" style={{ background: "#FDFCF8", color: "#1C1917", fontFamily: "Manrope, sans-serif" }}>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Button data-testid="billing-back" variant="ghost" onClick={() => navigate("/admin/dashboard")} className="mb-6 gap-2 text-xs tracking-wider"><ArrowLeft className="w-4 h-4" /> Dashboard</Button>
        <h1 className="text-4xl mb-2" style={{ fontFamily: "Cormorant Garamond, serif" }}>Plan &amp; Billing</h1>
        <p className="text-sm mb-8" style={{ color: "#57534E" }}>Your subscription and gallery usage.</p>

        <div className="rounded-lg border p-6 mb-10" style={{ borderColor: "rgba(0,0,0,0.1)", background: "#fff" }} data-testid="usage-card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-xs uppercase tracking-widest" style={{ color: "#57534E" }}>Current plan</span>
              <div className="text-2xl font-medium" style={{ fontFamily: "Cormorant Garamond, serif" }}>{u.plan_info.label} · £{u.plan_info.price}/mo</div>
            </div>
            <span className="text-xs px-3 py-1 rounded-full" style={{ background: u.trial_active ? "rgba(212,175,55,0.15)" : "rgba(74,222,128,0.15)", color: u.trial_active ? "#B8860B" : "#16a34a" }} data-testid="sub-status">
              {u.trial_active ? "Free trial" : u.subscription_status}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span data-testid="usage-text">{u.used} of {u.limit} galleries used</span>
            <span style={{ color: "#57534E" }}>{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E7E5E4" }}>
            <div data-testid="usage-bar" className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 90 ? "#DC2626" : pct >= 70 ? "#D4AF37" : "#1C1917" }} />
          </div>
          {pct >= 80 && (
            <p className="text-xs mt-3" style={{ color: "#B45309" }} data-testid="upgrade-nudge">
              You're close to your limit — upgrade below to keep adding galleries this season.
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {Object.entries(data.plans).map(([key, p]) => {
            const Meta = PLAN_META[key] || {}; const Icon = Meta.icon || Sparkles;
            const current = key === u.plan;
            return (
              <div key={key} data-testid={`plan-card-${key}`} className="rounded-lg border p-6 flex flex-col" style={{ borderColor: current ? "#D4AF37" : "rgba(0,0,0,0.1)", background: "#fff", boxShadow: current ? "0 0 0 1px #D4AF37" : "none" }}>
                <Icon className="w-6 h-6 mb-3" style={{ color: "#D4AF37" }} />
                <h3 className="text-xl font-medium" style={{ fontFamily: "Cormorant Garamond, serif" }}>{p.label}</h3>
                <div className="text-3xl font-semibold my-2">£{p.price}<span className="text-sm font-normal" style={{ color: "#57534E" }}>/mo</span></div>
                <p className="text-xs mb-4" style={{ color: "#57534E" }}>{Meta.blurb}</p>
                <ul className="text-sm space-y-2 mb-6 flex-1">
                  <li className="flex items-center gap-2"><Check className="w-4 h-4" style={{ color: "#16a34a" }} /> {p.gallery_limit} galleries</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4" style={{ color: "#16a34a" }} /> Unlimited photos &amp; videos</li>
                  <li className="flex items-center gap-2"><Check className="w-4 h-4" style={{ color: "#16a34a" }} /> Client share galleries</li>
                </ul>
                {current ? (
                  <Button disabled className="w-full rounded-sm text-xs uppercase tracking-widest" data-testid={`plan-current-${key}`}>Current plan</Button>
                ) : (
                  <Button data-testid={`plan-upgrade-${key}`} onClick={() => upgrade(key)} disabled={busy === key} className="w-full rounded-sm text-xs uppercase tracking-widest font-bold" style={{ background: "#1C1917", color: "#FDFCF8" }}>
                    {busy === key ? "Redirecting…" : `Choose ${p.label}`}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs mt-8" style={{ color: "#A8A29E" }}>Secure payments by Stripe · billed monthly · cancel anytime</p>
      </div>
    </div>
  );
}
