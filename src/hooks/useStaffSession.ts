"use client";

import { useCallback, useEffect, useState } from "react";
import type { StaffMember } from "@/types/pos";

type StaffState = {
  loading: boolean;
  staff: StaffMember | null;
  error: string | null;
  userId: string | null;
};

export function useStaffSession() {
  const [state, setState] = useState<StaffState>({
    loading: true,
    staff: null,
    error: null,
    userId: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();

      if (!res.ok || !data.user) {
        setState({ loading: false, staff: null, error: null, userId: null });
        return;
      }

      const user = data.user;

      setState({
        loading: false,
        staff: {
          id: user.id, // we map app_users.id as staff.id conceptually for now
          restaurant_id: user.restaurant_id,
          user_id: user.id, // not an auth.user id anymore, but the app_user_id
          role: user.role,
          name: user.name,
        } as StaffMember,
        error: null,
        userId: user.id,
      });
    } catch (err: any) {
      setState({
        loading: false,
        staff: null,
        error: "Oturum kontrol edilirken hata oluştu",
        userId: null,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Supabase auth subscription is removed since we use custom cookies
  }, [refresh]);

  return { ...state, refresh };
}
