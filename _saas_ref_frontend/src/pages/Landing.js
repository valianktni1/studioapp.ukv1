import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, ShieldCheck, HardDrive, Share2, Video, Sparkles, ArrowRight } from "lucide-react";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import useTitle from "@/lib/useTitle";

const HERO = "https://images.pexels.com/photos/11813966/pexels-photo-11813966.jpeg";

const features = [
  { icon: Share2, title: "Client Galleries", body: "Password-protected, branded galleries your couples will love. View, favourite, download." },
  { icon: Video, title: "Video Delivery", body: "Web-optimised streaming with GPU transcoding and direct high-speed downloads." },
  { icon: HardDrive, title: "Gallery Plans", body: "Simple plans by gallery count — Starter 10, Professional 30, Studio 60. Upgrade any time." },
  { icon: ShieldCheck, title: "Secure & Isolated", body: "Every studio is fully isolated. 2FA, signed links, and expiring shares built in." },
  { icon: Sparkles, title: "Your Brand", body: "Your logo, colours and business name across every gallery and email. Zero StudioApp noise." },
  { icon: Camera, title: "Album Workflow", body: "Let couples heart favourites, choose covers and submit album selections in a few taps." },
];

export default function Landing() {
  useTitle("Wedding Photography Galleries");
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--sa-bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "var(--sa-header-bg)", backdropFilter: "blur(18px)", borderBottom: "1px solid var(--sa-border)" }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
          <span className="font-display text-2xl font-bold tracking-tight" style={{ color: "var(--sa-gold)" }} data-testid="brand-logo">StudioApp</span>
          <nav className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" className="sa-btn-ghost" data-testid="nav-login">Photographer Login</Link>
            <Link to="/signup" className="sa-btn" data-testid="nav-pricing">Start your studio</Link>
          </nav>
        </div>
      </header>

      <section className="relative">
        <img src={HERO} alt="studio" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,10,11,0.55) 0%, rgba(10,10,11,0.85) 70%, var(--sa-bg) 100%)" }} />
        <div className="relative max-w-7xl mx-auto px-6 sm:px-10 py-32 sm:py-44">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="sa-label mb-5" style={{ color: "rgba(255,255,255,0.7)" }}>The gallery platform for wedding photographers</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="font-display font-bold leading-none tracking-tight text-5xl sm:text-7xl max-w-4xl" style={{ color: "#FAFAFA" }}>
            Deliver breathtaking galleries under your own name.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
            className="mt-6 text-lg max-w-2xl" style={{ color: "rgba(255,255,255,0.82)" }}>
            StudioApp is the white-label home for your wedding photography &mdash; branded client galleries, video, backups and print orders, all in one elegant place.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-9 flex flex-wrap gap-4">
            <Link to="/signup" className="sa-btn" data-testid="hero-cta">Start your studio <ArrowRight size={18} /></Link>
            <Link to="/login" className="sa-btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.5)" }} data-testid="hero-login">I already have an account</Link>          </motion.div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 sm:px-10 py-24 w-full">
        <h2 className="font-display text-4xl font-semibold mb-3">Built by a Wedding Photographer for Photographers</h2>
        <p style={{ color: "var(--sa-muted)" }} className="mb-12 max-w-2xl">One calm, cinematic platform that keeps your brand front and centre.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div key={f.title} className="sa-card p-7" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.05 }} data-testid={`feature-${i}`}>
              <f.icon size={26} style={{ color: "var(--sa-gold)" }} strokeWidth={1.6} />
              <h3 className="font-display text-2xl mt-4 mb-2">{f.title}</h3>
              <p style={{ color: "var(--sa-muted)" }} className="text-sm leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="pricing" className="max-w-7xl mx-auto px-6 sm:px-10 py-24 w-full">
        <h2 className="font-display text-4xl font-semibold mb-12 text-center">Simple, studio-sized pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { name: "Starter", galleries: "10 galleries", price: 15, featured: false },
            { name: "Professional", galleries: "30 galleries", price: 35, featured: true },
            { name: "Studio", galleries: "60 galleries", price: 65, featured: false },
          ].map((p) => (
            <div key={p.name} className="sa-card p-8 flex flex-col" style={p.featured ? { borderColor: "var(--sa-gold)" } : {}} data-testid={`plan-${p.name.toLowerCase()}`}>
              {p.featured && <span className="sa-label mb-3" style={{ color: "var(--sa-gold)" }}>Most popular</span>}
              <h3 className="font-display text-3xl">{p.name}</h3>
              <div className="my-4"><span className="text-4xl font-bold">£{p.price}</span><span style={{ color: "var(--sa-muted)" }}>/mo</span></div>
              <p style={{ color: "var(--sa-muted)" }} className="mb-6">{p.galleries} &middot; unlimited photos &amp; video</p>
              <Link to={`/signup?plan=${p.name.toLowerCase()}`} className={p.featured ? "sa-btn mt-auto" : "sa-btn-ghost mt-auto"} data-testid={`plan-cta-${p.name.toLowerCase()}`}>Choose {p.name}</Link>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
