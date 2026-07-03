import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";
import { tenantApi, apiError } from "@/lib/api";

export const LogoUpload = ({ value, onUploaded }) => {
  const inputRef = useRef();
  const [busy, setBusy] = useState(false);

  const onChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    setBusy(true);
    try {
      const { data } = await tenantApi.post("/admin/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onUploaded(data.logo_url);
      toast.success("Logo uploaded");
    } catch (err) { toast.error(apiError(err)); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <div className="flex items-center gap-4" data-testid="logo-upload">
      <div className="h-16 w-16 rounded flex items-center justify-center overflow-hidden shrink-0"
        style={{ border: "1px solid var(--sa-border)", background: "var(--sa-surface)" }}>
        {value
          ? <img src={value} alt="logo" className="h-full w-full object-contain" data-testid="logo-preview" />
          : <span className="text-[10px] text-center px-1" style={{ color: "var(--sa-muted)" }}>No logo</span>}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={onChange} data-testid="logo-file-input" />
      <button type="button" className="sa-btn-ghost" disabled={busy} onClick={() => inputRef.current?.click()} data-testid="logo-upload-btn">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {busy ? "Uploading…" : (value ? "Replace logo" : "Upload logo")}
      </button>
    </div>
  );
};

export default LogoUpload;
