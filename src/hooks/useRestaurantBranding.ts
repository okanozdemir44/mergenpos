"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";
import {
  DEFAULT_BRANDING,
  OKUZ_BURGER_BRANDING,
  IKRAM_DONER_BRANDING,
  type RestaurantBranding,
} from "@/types/branding";

export function useRestaurantBranding() {
  const { staff, loading: staffLoading } = useStaffSession();
  const [branding, setBranding] = useState<RestaurantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadBranding() {
      if (staffLoading) return;

      if (!staff?.restaurant_id) {
        if (isMounted) {
          setBranding(DEFAULT_BRANDING);
          setLoading(false);
        }
        return;
      }

      // Varsayılan / Fallback marka tespiti
      let fallbackBranding = DEFAULT_BRANDING;
      if (staff.restaurant_id === "8c3d0702-06fd-43f1-809a-062153bf7486") {
        fallbackBranding = OKUZ_BURGER_BRANDING;
      } else if (
        staff.restaurant_id === "1162c5da-b712-404b-85af-c47642ad2f55" ||
        staff.name?.toLowerCase().includes("ikram")
      ) {
        fallbackBranding = IKRAM_DONER_BRANDING;
      }

      try {
        const supabase = createBrowserClient();
        const { data, error } = await supabase
          .from("restaurant_branding")
          .select("*")
          .eq("restaurant_id", staff.restaurant_id)
          .maybeSingle();

        if (isMounted) {
          if (error || !data) {
            // Tablo henüz SQL ile oluşturulmadıysa veya satır yoksa akıllı fallback kullan
            setBranding(fallbackBranding);
          } else {
            setBranding({
              restaurant_id: data.restaurant_id,
              display_name: data.display_name || fallbackBranding.display_name,
              logo_url: data.logo_url || fallbackBranding.logo_url,
              primary_color: data.primary_color || fallbackBranding.primary_color,
              secondary_color: data.secondary_color || fallbackBranding.secondary_color,
              receipt_header: data.receipt_header || fallbackBranding.receipt_header,
              receipt_footer: data.receipt_footer || fallbackBranding.receipt_footer,
            });
          }
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setBranding(fallbackBranding);
          setLoading(false);
        }
      }
    }

    void loadBranding();

    return () => {
      isMounted = false;
    };
  }, [staff?.restaurant_id, staff?.name, staffLoading]);

  return { branding, loading };
}
