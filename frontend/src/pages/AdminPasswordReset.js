import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { forgotPassword, resetPassword } from "@/lib/api";

export default function AdminPasswordReset() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [identifier, setIdentifier] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(identifier);
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Something went wrong");
    } finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
      toast.success("Password reset — please sign in");
      setTimeout(() => navigate("/admin"), 1800);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not reset password");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#FDFCF8' }}>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <img src="/studioapp-logo.png" alt="StudioApp" className="h-12 w-auto" />
        </div>

        {token ? (
          done ? (
            <div className="text-center" data-testid="reset-done">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-600" />
              <h2 className="text-3xl font-medium mb-2" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Password reset</h2>
              <p style={{ color: '#57534E', fontFamily: 'Manrope, sans-serif' }}>Taking you to sign in…</p>
            </div>
          ) : (
            <>
              <h2 className="text-4xl mb-3 font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Set a new password</h2>
              <p className="text-base mb-10" style={{ color: '#57534E', fontFamily: 'Manrope, sans-serif' }}>Choose a new password for your studio admin account.</p>
              <form onSubmit={handleReset} className="space-y-8">
                <div className="space-y-2">
                  <Label className="text-xs tracking-[0.15em] uppercase font-semibold" style={{ color: '#57534E' }}>New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-0 top-3.5 w-4 h-4 text-[#A8A29E]" />
                    <Input data-testid="reset-new-password" type={showPw ? "text" : "password"} value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="border-0 border-b border-[#D4D4D8] bg-transparent rounded-none pl-6 pr-10 py-3 focus-visible:ring-0 focus-visible:border-[#1C1917] text-base"
                      placeholder="At least 6 characters" required />
                    <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-0 top-3 text-[#A8A29E] hover:text-[#1C1917]">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button data-testid="reset-submit-btn" type="submit" disabled={loading || newPassword.length < 6}
                  className="w-full bg-[#1C1917] text-[#FDFCF8] hover:bg-[#1C1917]/90 rounded-sm px-8 py-6 text-xs tracking-[0.2em] uppercase font-bold">
                  {loading ? "Resetting…" : "Reset Password"}
                </Button>
              </form>
            </>
          )
        ) : sent ? (
          <div className="text-center" data-testid="forgot-sent">
            <Mail className="w-12 h-12 mx-auto mb-4 text-[#D4AF37]" />
            <h2 className="text-3xl font-medium mb-2" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Check your email</h2>
            <p className="mb-8" style={{ color: '#57534E', fontFamily: 'Manrope, sans-serif' }}>If an account matches, we've sent a reset link to your studio's email. It expires in 1 hour.</p>
            <button onClick={() => navigate("/admin")} className="text-sm text-[#1C1917] underline underline-offset-4 hover:text-[#D4AF37]">Back to sign in</button>
          </div>
        ) : (
          <>
            <h2 className="text-4xl mb-3 font-medium" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Forgot password</h2>
            <p className="text-base mb-10" style={{ color: '#57534E', fontFamily: 'Manrope, sans-serif' }}>Enter your username or email and we'll send a reset link to your studio's email.</p>
            <form onSubmit={handleForgot} className="space-y-8">
              <div className="space-y-2">
                <Label className="text-xs tracking-[0.15em] uppercase font-semibold" style={{ color: '#57534E' }}>Username or Email</Label>
                <div className="relative">
                  <Mail className="absolute left-0 top-3.5 w-4 h-4 text-[#A8A29E]" />
                  <Input data-testid="forgot-identifier" value={identifier} onChange={e => setIdentifier(e.target.value)}
                    className="border-0 border-b border-[#D4D4D8] bg-transparent rounded-none pl-6 pr-0 py-3 focus-visible:ring-0 focus-visible:border-[#1C1917] text-base"
                    placeholder="Your username or email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
                </div>
              </div>
              <Button data-testid="forgot-submit-btn" type="submit" disabled={loading}
                className="w-full bg-[#1C1917] text-[#FDFCF8] hover:bg-[#1C1917]/90 rounded-sm px-8 py-6 text-xs tracking-[0.2em] uppercase font-bold">
                {loading ? "Sending…" : "Send Reset Link"}
              </Button>
              <button type="button" onClick={() => navigate("/admin")} className="w-full flex items-center justify-center gap-2 text-sm text-[#57534E] hover:text-[#1C1917]">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
