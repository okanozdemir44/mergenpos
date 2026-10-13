"use client";

import React, { createContext, useContext, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRestaurantBranding } from "@/hooks/useRestaurantBranding";
import { DEFAULT_BRANDING, type RestaurantBranding } from "@/types/branding";

type BrandingContextType = {
  branding: RestaurantBranding;
  loading: boolean;
};

const BrandingContext = createContext<BrandingContextType>({
  branding: DEFAULT_BRANDING,
  loading: false,
});

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { branding, loading } = useRestaurantBranding();
  const isLoginPage = pathname?.startsWith("/login");

  // CSS Değişkenlerini ve Sayfa Başlığını dinamik olarak uygula
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    if (isLoginPage) {
      // Giriş sayfası herkes için tamamen nötr kalır
      root.style.removeProperty("--pos-teal");
      root.style.removeProperty("--pos-teal-2");
      root.style.removeProperty("--pos-teal-soft");
      root.style.removeProperty("--sidebar-brand");
      return;
    }

    // Restoran oturumu açıldığında tema renklerini uygula
    if (branding.primary_color) {
      root.style.setProperty("--pos-teal", branding.primary_color);
      root.style.setProperty("--pos-teal-2", branding.secondary_color || branding.primary_color);
      root.style.setProperty("--pos-teal-soft", `${branding.primary_color}22`);
      root.style.setProperty("--sidebar-brand", branding.primary_color);
    }

    // Sayfa başlığına restoran adını yansıt
    if (branding.display_name && branding.display_name !== "Mergen POS") {
      const currentTitle = document.title;
      if (currentTitle && !currentTitle.includes(branding.display_name)) {
        document.title = currentTitle.replace(/Mergen POS|Öküz Burger/g, branding.display_name);
      }
    }
  }, [branding, isLoginPage]);

  return (
    <BrandingContext.Provider value={{ branding, loading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  return context;
}
