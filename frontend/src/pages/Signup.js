import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, Check } from "lucide-react";
import { signupTenant, getErrorMessage } from "@/lib/api";

const PLANS = [
  { key: "starter", label: "Starter", price: 15, galleries: 10 },
  { key: "pro", label: "Professional", price: 35, galleries: 30 },
  { key: "studio", label: "Studio", price: 65, galleries: 60 },
];

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ business_name: "", username: "", password: "", plan: "starter" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.business_name || !form.username || !form.password) return toast.error("Please fill in all fields");
    setBusy(true);
    try {
      const { data } = await signupTenant(form);
      localStorage.setItem("admin_token", data.token);
      toast.success("Welcome to StudioApp — your 14-day trial has started!");
      navigate("/admin/dashboard");
    } catch (err) { toast.error(getErrorMessage(err)); setBusy(false); }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2" style={{ fontFamily: "Manrope, sans-serif" }}>
      <div className="hidden md:flex flex-col justify-center px-16" style={{ background: "#0B0B0F", color: "#F5F5F4" }}>
        <div className="flex items-center gap-2 text-2xl font-semibold mb-8"><Layers className="w-6 h-6" style={{ color: "#D4AF37" }} /> StudioApp</div>
        <h1 className="text-4xl mb-4" style={{ fontFamily: "Cormorant Garamond, serif" }}>Beautiful client galleries for photographers.</h1>
        <p className="text-white/60 mb-8">Deliver cinematic wedding galleries your couples will love. Start free for 14 days — no card required.</p>
        <ul className="space-y-3 text-white/80">
          {["Unlimited photos & videos", "Password-protected client shares", "Your own branding & logo", "Print orders & slideshows"].map((f) => (
            <li key={f} className="flex items-center gap-3"><Check className="w-4 h-4" style={{ color: "#D4AF37" }} /> {f}</li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-center px-6 py-12" style={{ background: "#FDFCF8" }}>
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="signup-form">
          <h2 className="text-3xl mb-1" style={{ fontFamily: "Cormorant Garamond, serif" }}>Start your free trial</h2>
          <p className="text-sm mb-8" style={{ color: "#57534E" }}>Already have an account? <button type="button" onClick={() => navigate("/admin")} className="underline">Sign in</button></p>

          <Label className="text-xs uppercase tracking-wider">Studio / business name</Label>
          <Input data-testid="signup-business" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className="mb-4 mt-1" placeholder="Rose Photography" />
          <Label className="text-xs uppercase tracking-wider">Username</Label>
          <Input data-testid="signup-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mb-4 mt-1" />
          <Label className="text-xs uppercase tracking-wider">Password</Label>
          <Input data-testid="signup-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mb-4 mt-1" />
          <Label className="text-xs uppercase tracking-wider">Plan (after trial)</Label>
          <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
            <SelectTrigger data-testid="signup-plan" className="mb-8 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLANS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label} · {p.galleries} galleries · £{p.price}/mo</SelectItem>)}
            </SelectContent>
          </Select>

          <Button data-testid="signup-submit" type="submit" disabled={busy} className="w-full rounded-sm uppercase tracking-widest text-xs font-bold py-3" style={{ background: "#1C1917", color: "#FDFCF8" }}>
            {busy ? "Creating your studio…" : "Start free trial"}
          </Button>
        </form>
      </div>
    </div>
  );
}
