"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useStaffSession } from "@/hooks/useStaffSession";

export function useRestaurantFeatures() {
  const { staff, loading: staffLoading } = useStaffSession();
  const [callerIdEnabled, setCallerIdEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchFeatures() {
      if (staffLoading) return;
      if (!staff?.restaurant_id) {
        if (isMounted) {
          setCallerIdEnabled(false);
          setLoading(false);
        }
        return;
      }

      try {
        const supabase = createBrowserClient();
        const { data, error } = await supabase
          .from("restaurant_features")
          .select("caller_id_enabled")
          .eq("restaurant_id", staff.restaurant_id)
          .maybeSingle();

        if (isMounted) {
          if (error || !data) {
            // Satır yoksa veya veritabanı hatası olursa özellik kesinlikle KAPALI
            setCallerIdEnabled(false);
          } else {
            setCallerIdEnabled(Boolean(data.caller_id_enabled));
          }
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setCallerIdEnabled(false);
          setLoading(false);
        }
      }
    }

    void fetchFeatures();

    return () => {
      isMounted = false;
    };
  }, [staff?.restaurant_id, staffLoading]);

  return { callerIdEnabled, loading };
}
