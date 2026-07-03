import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import { pub, apiError } from "@/lib/api";

export default function PrintOrderModal({ token, accent, brand, onClose }) {
  const [sizes, setSizes] = useState([]);
  const [currency, setCurrency] = useState("GBP");
  const [qty, setQty] = useState({});
  const [customer, setCustomer] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pub.get(`/share/${token}/print-sizes`).then(({ data }) => { setSizes(data.sizes || []); setCurrency(data.currency || "GBP"); }).catch(() => {});
  }, [token]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const bump = (id, d) => setQty((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) + d) }));
  const total = sizes.reduce((a, s) => a + (qty[s.id] || 0) * s.price, 0);

  const submit = async (e) => {
    e.preventDefault();
    const items = sizes.filter((s) => qty[s.id] > 0).map((s) => ({ size_id: s.id, qty: qty[s.id] }));
    if (!items.length) return toast.error("Add at least one print");
    setBusy(true);
    try {
      const { data } = await pub.post(`/share/${token}/print-order`, { items, customer, origin_url: window.location.origin });
      if (data.paypal && data.approve_url) { window.location.href = data.approve_url; return; }
      toast.success(`Order received — ${brand} will be in touch to arrange payment.`);
      onClose();
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }} onClick={onClose} data-testid="print-modal">
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="sa-card p-8 w-full max-w-lg max-h-[90vh] overflow-auto" data-testid="print-form">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display italic text-3xl">Order Prints</h3>
          <button type="button" onClick={onClose}><X size={22} /></button>
        </div>
        {sizes.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--sa-muted)" }}>Print ordering isn't available for this gallery yet.</p>
        ) : (
          <>
            <div className="space-y-3 mb-5">
              {sizes.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded" style={{ border: "1px solid var(--sa-border)" }} data-testid={`print-size-${s.id}`}>
                  <div>
                    <div className="font-medium">{s.label}</div>
                    <div className="text-xs" style={{ color: "var(--sa-muted)" }}>{s.dimensions} · {currency} {s.price.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="p-1.5 rounded-full" style={{ border: "1px solid var(--sa-border)" }} onClick={() => bump(s.id, -1)} data-testid={`print-minus-${s.id}`}><Minus size={14} /></button>
                    <span className="w-6 text-center" data-testid={`print-qty-${s.id}`}>{qty[s.id] || 0}</span>
                    <button type="button" className="p-1.5 rounded-full" style={{ border: "1px solid var(--sa-border)" }} onClick={() => bump(s.id, 1)} data-testid={`print-plus-${s.id}`}><Plus size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <input className="sa-input" placeholder="Your name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} data-testid="print-name" />
              <input className="sa-input" type="email" placeholder="Your email" required value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} data-testid="print-email" />
            </div>
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl" data-testid="print-total">{currency} {total.toFixed(2)}</div>
              <button className="sa-btn" style={{ background: accent }} disabled={busy || total <= 0} data-testid="print-submit"><ShoppingBag size={16} /> {busy ? "…" : "Place order"}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
