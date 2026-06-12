import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard, Auth } from "@/layouts";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import SecurityHandler from "@/components/SecurityHandler";
import LandingPage from "@/pages/LandingPage";
import { initGlobalSecurity } from "@/utils/globalSecurity";
import { initNuclearSecurity } from "@/utils/nuclearSecurity";

function App() {
  // Initialize nuclear security on app load
  React.useEffect(() => {
    const cleanup = initNuclearSecurity();
    return cleanup;
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) return;

    const originalContent =
      viewportMeta.getAttribute("content") ||
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";

    const applyViewportScale = () => {
      const isMobile = window.innerWidth <= 768;
      const content = isMobile
        ? "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        : originalContent;

      if (viewportMeta.getAttribute("content") !== content) {
        viewportMeta.setAttribute("content", content);
      }
    };

    applyViewportScale();
    window.addEventListener("resize", applyViewportScale);

    return () => {
      window.removeEventListener("resize", applyViewportScale);
      viewportMeta.setAttribute("content", originalContent);
    };
  }, []);

  return (
    <AuthProvider>
      <SecurityHandler />
      <Routes>
        <Route path="/dashboard/*" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/auth/*" element={<Auth />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
