import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft, Search, Rocket, FolderPlus, UploadCloud, Share2, Play,
  Printer, Mail, Palette, CreditCard, HelpCircle, LifeBuoy,
} from "lucide-react";

const SECTIONS = [
  {
    id: "getting-started", title: "Getting started", icon: Rocket,
    items: [
      { q: "What is StudioApp?", a: "StudioApp is your private online gallery platform. You upload your photos and videos, organise them into client galleries, and share them with your clients via a secure link — with optional passwords, expiry dates, print ordering and downloads." },
      { q: "The 3 steps to your first gallery", a: "1) Click 'New Gallery' on your dashboard and give it a name (e.g. the couple's names + date). 2) Open the gallery and upload your images/videos into the folders. 3) Create a share link and send it to your client. That's it." },
      { q: "Where do I manage everything?", a: "Your dashboard is home. From the top bar you can reach Branding (your logo & colours), Settings (client email setup), Plan (your subscription & limits), Activity (what your clients are doing), and this Help centre anytime." },
    ],
  },
  {
    id: "galleries", title: "Creating & managing galleries", icon: FolderPlus,
    items: [
      { q: "How do I create a gallery?", a: "Click 'New Gallery' on the dashboard, enter a name, and (optionally) pick a template that pre-creates your usual folders (e.g. Ceremony, Reception, Portraits). You can add or rename folders later inside the gallery." },
      { q: "Folders / sub-galleries", a: "Each gallery can have multiple folders so clients can browse by moment or session. Open a gallery, use the folder tabs to switch, and add new folders as needed." },
      { q: "Templates", a: "Templates save you time by pre-loading a standard folder layout. Manage them from the 'Templates' button on your dashboard, then choose one when creating a new gallery." },
      { q: "Deleting a gallery or image", a: "Use the delete (bin) icon. You'll be asked to confirm. Deleting is permanent, so double-check before confirming — especially when deleting a whole gallery, which removes all its files." },
    ],
  },
  {
    id: "uploads", title: "Uploading photos & videos", icon: UploadCloud,
    items: [
      { q: "How many can I upload at once?", a: "As many as you like — including 1,000+ images in one go. StudioApp automatically uploads them in efficient batches in the background, so large drops complete reliably. A progress bar shows overall progress." },
      { q: "Thumbnails appear gradually — is that normal?", a: "Yes. After a big upload, StudioApp generates optimised thumbnails in the background. Images may show their previews filling in for a minute or two — nothing is missing, it's just finishing up." },
      { q: "Video support", a: "Upload your videos straight into a gallery folder. StudioApp automatically creates a web-optimised version so it plays smoothly for clients over the internet, on any device." },
      { q: "Best practice for very large sessions", a: "You can drop everything at once, but if you're on a slower connection it's fine to upload folder by folder. Keep the tab open until the progress bar completes." },
    ],
  },
  {
    id: "sharing", title: "Sharing galleries with clients", icon: Share2,
    items: [
      { q: "How do I share a gallery?", a: "Open the gallery, create a share link, then copy it or show the QR code. Send that link to your client — they open it in any browser, no account needed." },
      { q: "Branded share links", a: "Your share links are branded to your studio (e.g. yourdomain/s/your-studio/couple-name), so clients see your name, not a generic address." },
      { q: "Passwords & expiry", a: "When creating a share you can set a password and/or an expiry date. Great for keeping galleries private and time-limited. You control whether clients can download or delete." },
      { q: "Downloads & favourites", a: "Depending on the share settings, clients can download images and mark favourites. This lets them pick their best shots for albums or prints." },
    ],
  },
  {
    id: "slideshow", title: "Slideshows", icon: Play,
    items: [
      { q: "Slideshow mode", a: "Clients can view any gallery as a full-screen slideshow — a beautiful way to relive the day. You can also share a direct slideshow link." },
    ],
  },
  {
    id: "prints", title: "Print orders", icon: Printer,
    items: [
      { q: "Can clients order prints?", a: "Yes. If enabled on a share, clients can add images to a print cart and place an order directly from their gallery. You'll see the orders come through so you can fulfil them." },
    ],
  },
  {
    id: "email", title: "Client emails & announcements", icon: Mail,
    items: [
      { q: "Set up your sending email (SMTP)", a: "Go to Settings → Email and enter your email provider's details (server, port, from-address, password). Send a test to confirm it works. This lets StudioApp email your clients from your own address." },
      { q: "Notify a client their gallery is ready", a: "From a gallery you can send a 'gallery ready' email to the client's address, with the link included." },
      { q: "Broadcast to all your clients", a: "Use the Broadcast option on your dashboard to send one message to all clients who have an email on their gallery — perfect for seasonal offers or reminders." },
      { q: "Port 465 vs 587?", a: "Port 465 uses SSL, port 587 uses TLS. Use whichever your email provider recommends. If your provider uses 2-factor login, create an 'app password' and use that instead of your normal password." },
    ],
  },
  {
    id: "branding", title: "Your branding", icon: Palette,
    items: [
      { q: "Add your logo & colours", a: "Go to Branding to upload your studio logo and set your accent colour. Your galleries, share pages and emails then carry your brand throughout." },
      { q: "Business name & contact", a: "Set your studio name, tagline and contact email in Branding. These appear to clients on your galleries and share pages." },
    ],
  },
  {
    id: "billing", title: "Your plan & billing", icon: CreditCard,
    items: [
      { q: "How do plans work?", a: "Each plan includes a set number of galleries. When you reach your limit, upgrade from the Plan page to unlock more. Your current usage is shown on the dashboard meter." },
      { q: "Free trial", a: "New studios start on a free trial. Upgrade any time from the Plan page to keep everything running when the trial ends." },
      { q: "Upgrading", a: "Open Plan, choose the tier you want and complete secure checkout. Your new limits apply immediately after payment." },
    ],
  },
  {
    id: "faq", title: "Troubleshooting", icon: HelpCircle,
    items: [
      { q: "A client says their link doesn't work", a: "Check the share hasn't expired and, if it's password-protected, that they have the correct password. You can always create a fresh share link for them." },
      { q: "An upload didn't finish", a: "Large uploads run in batches; if a few fail (e.g. connection dropped) you'll be told how many. Just re-select the missing files and upload again — already-uploaded files won't be duplicated by name." },
      { q: "A video looks like it's still processing", a: "Give it a short while after upload — StudioApp is preparing the smooth web version. Refresh the gallery after a minute or two." },
      { q: "Still stuck?", a: "Reach out to StudioApp support and we'll help you get sorted." },
    ],
  },
];

export default function AdminHelp() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) navigate("/admin");
  }, [navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS
      .map((s) => ({ ...s, items: s.items.filter((it) => (it.q + " " + it.a).toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [query]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FDFCF8", color: "#1C1917" }} data-testid="admin-help-page">
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: "rgba(253,252,248,0.9)", backdropFilter: "blur(16px)", borderColor: "rgba(212,175,55,0.2)" }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Button data-testid="help-back-btn" variant="ghost" onClick={() => navigate("/admin/dashboard")} className="text-[#57534E] gap-2 text-xs tracking-wider rounded-sm">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Button>
          <div className="flex items-center gap-2 ml-auto text-sm" style={{ color: "#A8A29E", fontFamily: "Manrope, sans-serif" }}>
            <LifeBuoy className="w-4 h-4" style={{ color: "#D4AF37" }} /> StudioApp Help
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <p className="text-xs tracking-[0.3em] uppercase mb-3" style={{ color: "#D4AF37", fontFamily: "Manrope, sans-serif" }}>Help Centre</p>
          <h1 className="text-4xl sm:text-5xl font-medium mb-4" style={{ fontFamily: "Cormorant Garamond, serif" }}>How can we help?</h1>
          <p className="text-base mb-6" style={{ color: "#57534E", fontFamily: "Manrope, sans-serif" }}>
            Everything you need to run your galleries — uploading, sharing, prints, emails and more.
          </p>
          <div className="relative max-w-lg">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#A8A29E" }} />
            <Input
              data-testid="help-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help topics…"
              className="pl-9 border-[#E7E5E4] bg-white rounded-sm"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm" style={{ color: "#A8A29E", fontFamily: "Manrope, sans-serif" }} data-testid="help-no-results">
            No topics match “{query}”. Try a different word, or clear the search.
          </p>
        ) : (
          <div className="space-y-10">
            {filtered.map((s) => (
              <section key={s.id} data-testid={`help-section-${s.id}`}>
                <div className="flex items-center gap-2 mb-3">
                  <s.icon className="w-5 h-5" style={{ color: "#D4AF37" }} />
                  <h2 className="text-lg font-semibold" style={{ fontFamily: "Manrope, sans-serif" }}>{s.title}</h2>
                </div>
                <Accordion type="single" collapsible className="border rounded-lg overflow-hidden" style={{ borderColor: "#E7E5E4", backgroundColor: "#fff" }}>
                  {s.items.map((it, i) => (
                    <AccordionItem key={i} value={`${s.id}-${i}`} className="border-b last:border-b-0" style={{ borderColor: "#F0EEE9" }}>
                      <AccordionTrigger data-testid={`help-q-${s.id}-${i}`} className="px-4 text-left text-sm font-medium hover:no-underline" style={{ fontFamily: "Manrope, sans-serif" }}>
                        {it.q}
                      </AccordionTrigger>
                      <AccordionContent className="px-4 text-sm leading-relaxed" style={{ color: "#57534E", fontFamily: "Manrope, sans-serif" }}>
                        {it.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            ))}
          </div>
        )}

        <div className="mt-14 rounded-lg border p-6 text-center" style={{ borderColor: "rgba(212,175,55,0.3)", backgroundColor: "rgba(212,175,55,0.06)" }}>
          <p className="text-sm font-semibold mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>Still need a hand?</p>
          <p className="text-sm" style={{ color: "#57534E", fontFamily: "Manrope, sans-serif" }}>
            Contact StudioApp support and we'll get you sorted.
          </p>
        </div>
      </main>
    </div>
  );
}
