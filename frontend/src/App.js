import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminGalleryDetail from "@/pages/AdminGalleryDetail";
import AdminSettings from "@/pages/AdminSettings";
import SuperAdmin from "@/pages/SuperAdmin";
import AdminBranding from "@/pages/AdminBranding";
import AdminBilling from "@/pages/AdminBilling";
import Signup from "@/pages/Signup";
import AdminActivity from "@/pages/AdminActivity";
import ShareAccess from "@/pages/ShareAccess";
import ShareView from "@/pages/ShareView";
import SlideshowDirect from "@/pages/SlideshowDirect";
import PrintShop from "@/pages/PrintShop";

function App() {
  return (
    <div className="min-h-screen">
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/galleries" element={<AdminDashboard />} />
          <Route path="/admin/gallery/:id" element={<AdminGalleryDetail />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/branding" element={<AdminBranding />} />
          <Route path="/admin/billing" element={<AdminBilling />} />
          <Route path="/super" element={<SuperAdmin />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/admin/activity" element={<AdminActivity />} />
          <Route path="/s/:token" element={<ShareAccess />} />
          <Route path="/s/:token/view" element={<ShareView />} />
          <Route path="/s/:token/slideshow" element={<SlideshowDirect />} />
          <Route path="/s/:token/prints" element={<PrintShop />} />
          <Route path="/s/:tenant/:token" element={<ShareAccess />} />
          <Route path="/s/:tenant/:token/view" element={<ShareView />} />
          <Route path="/s/:tenant/:token/slideshow" element={<SlideshowDirect />} />
          <Route path="/s/:tenant/:token/prints" element={<PrintShop />} />
          <Route path="/" element={<AdminLogin />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" />
    </div>
  );
}

export default App;
