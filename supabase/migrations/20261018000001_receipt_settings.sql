-- ============================================================================
-- Mergen POS: Fiş Ayarları (receipt_settings) Tablosu ve RLS Politikaları
-- ============================================================================
-- NOT: Bu migration dosyası kullanıcı talimatı gereği otomatik ÇALIŞTIRILMAMIŞTIR.
-- Supabase Dashboard -> SQL Editor alanında tek seferde çalıştırılabilir.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.receipt_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.receipt_settings ENABLE ROW LEVEL SECURITY;

-- RLS Politikaları: Okuma (SELECT), Ekleme (INSERT) ve Güncelleme (UPDATE) yetkisi (Silme yok)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'user_restaurant_ids'
  ) THEN
    DROP POLICY IF EXISTS receipt_settings_select_policy ON public.receipt_settings;
    CREATE POLICY receipt_settings_select_policy ON public.receipt_settings
      FOR SELECT
      TO authenticated
      USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

    DROP POLICY IF EXISTS receipt_settings_insert_policy ON public.receipt_settings;
    CREATE POLICY receipt_settings_insert_policy ON public.receipt_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

    DROP POLICY IF EXISTS receipt_settings_update_policy ON public.receipt_settings;
    CREATE POLICY receipt_settings_update_policy ON public.receipt_settings
      FOR UPDATE
      TO authenticated
      USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
      WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));
  ELSE
    DROP POLICY IF EXISTS receipt_settings_select_policy ON public.receipt_settings;
    CREATE POLICY receipt_settings_select_policy ON public.receipt_settings
      FOR SELECT
      TO authenticated
      USING (true);

    DROP POLICY IF EXISTS receipt_settings_insert_policy ON public.receipt_settings;
    CREATE POLICY receipt_settings_insert_policy ON public.receipt_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (true);

    DROP POLICY IF EXISTS receipt_settings_update_policy ON public.receipt_settings;
    CREATE POLICY receipt_settings_update_policy ON public.receipt_settings
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
