"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
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
    const supabase = createBrowserClient();
    setState((s) => ({ ...s, loading: true, error: null }));

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      setState({ loading: false, staff: null, error: sessionError.message, userId: null });
      return;
    }

    if (!session?.user) {
      setState({ loading: false, staff: null, error: null, userId: null });
      return;
    }

    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id, restaurant_id, user_id, role, name")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (staffError) {
      setState({
        loading: false,
        staff: null,
        error: staffError.message,
        userId: session.user.id,
      });
      return;
    }

    if (!staff) {
      setState({
        loading: false,
        staff: null,
        error: "Bu hesap için personel kaydı yok. Yönetici staff satırı eklemeli.",
        userId: session.user.id,
      });
      return;
    }

    setState({
      loading: false,
      staff: staff as StaffMember,
      error: null,
      userId: session.user.id,
    });
  }, []);

  useEffect(() => {
    void refresh();

    const supabase = createBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  return { ...state, refresh };
}
