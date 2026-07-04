import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Palette } from "lucide-react";
import { getBranding, updateBranding, uploadBrandingLogo, brandingAssetUrl, getErrorMessage } from "@/lib/api";

export default function AdminBranding() {
  const navigate = useNavigate();
  const [b, setB] = useState({ business_name: "", accent_color: "#D4AF37", contact_email: "", tagline: "", logo_url: "" });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    getBranding().then(({ data }) => setB(data)).catch((e) => toast.error(getErrorMessage(e)));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await updateBranding({
        business_name: b.business_name, accent_color: b.accent_color,
        contact_email: b.contact_email, tagline: b.tagline,
      });
      setB(data); toast.success("Branding saved");
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const { data } = await uploadBrandingLogo(f); setB((p) => ({ ...p, logo_url: data.logo_url })); toast.success("Logo updated"); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FDFCF8", color: "#1C1917", fontFamily: "Manrope, sans-serif" }}>
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Button data-testid="branding-back" variant="ghost" onClick={() => navigate("/admin/dashboard")} className="mb-6 gap-2 text-xs tracking-wider"><ArrowLeft className="w-4 h-4" /> Dashboard</Button>
        <h1 className="text-4xl mb-2" style={{ fontFamily: "Cormorant Garamond, serif" }}>Branding</h1>
        <p className="text-sm mb-10" style={{ color: "#57534E" }}>How your studio appears to your couples on their galleries.</p>

        <div className="space-y-8">
          <div>
            <Label className="text-xs uppercase tracking-widest" style={{ color: "#57534E" }}>Studio logo</Label>
            <div className="flex items-center gap-4 mt-3">
              <div className="w-40 h-20 rounded border flex items-center justify-center overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.1)", background: "#1C1917" }}>
                {b.logo_url ? <img src={brandingAssetUrl(b.logo_url)} alt="logo" className="max-h-16 max-w-[140px] object-contain" data-testid="branding-logo-preview" /> : <span className="text-xs text-white/40">No logo</span>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogo} data-testid="branding-logo-input" />
              <Button data-testid="branding-logo-upload" variant="outline" onClick={() => fileRef.current?.click()} className="gap-2 rounded-sm"><Upload className="w-4 h-4" /> Upload logo</Button>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-widest" style={{ color: "#57534E" }}>Business name</Label>
            <Input data-testid="branding-name" value={b.business_name || ""} onChange={(e) => setB({ ...b, business_name: e.target.value })} className="mt-2" />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-widest" style={{ color: "#57534E" }}>Tagline</Label>
            <Input data-testid="branding-tagline" value={b.tagline || ""} onChange={(e) => setB({ ...b, tagline: e.target.value })} placeholder="Capturing your story" className="mt-2" />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-widest" style={{ color: "#57534E" }}>Contact email</Label>
            <Input data-testid="branding-email" value={b.contact_email || ""} onChange={(e) => setB({ ...b, contact_email: e.target.value })} placeholder="hello@yourstudio.com" className="mt-2" />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: "#57534E" }}><Palette className="w-4 h-4" /> Accent colour</Label>
            <div className="flex items-center gap-3 mt-2">
              <input type="color" data-testid="branding-accent" value={b.accent_color || "#D4AF37"} onChange={(e) => setB({ ...b, accent_color: e.target.value })} className="w-12 h-10 rounded border cursor-pointer" />
              <Input value={b.accent_color || ""} onChange={(e) => setB({ ...b, accent_color: e.target.value })} className="w-32" />
            </div>
          </div>

          <Button data-testid="branding-save" onClick={save} disabled={saving} className="bg-[#1C1917] text-[#FDFCF8] rounded-sm px-8 py-2 text-xs tracking-[0.15em] uppercase font-bold">
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </div>
    </div>
  );
}
