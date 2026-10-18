-- ============================================================================
-- Mergen POS: Fiş Ayarları (receipt_settings) Tablosu
-- ============================================================================
-- Mergen POS özel oturum (app_users) mimarisi kullandığından, browser client'ı
-- anon rolüyle istek atmaktadır. Bu nedenle diğer tablolar gibi (restaurants,
-- orders, menu_items) RLS politikası public'e açık veya devre dışı bırakılır.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.receipt_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- RLS'i devre dışı bırak (custom auth ile %100 uyumlu)
ALTER TABLE public.receipt_settings DISABLE ROW LEVEL SECURITY;

-- Olası eski kısıtlayıcı politikaları temizle
DROP POLICY IF EXISTS receipt_settings_select_policy ON public.receipt_settings;
DROP POLICY IF EXISTS receipt_settings_insert_policy ON public.receipt_settings;
DROP POLICY IF EXISTS receipt_settings_update_policy ON public.receipt_settings;
DROP POLICY IF EXISTS receipt_settings_all ON public.receipt_settings;

-- RLS açık kalsa bile her iki rolden (anon ve authenticated) okuma/yazmaya izin veren garanti politika
CREATE POLICY receipt_settings_all ON public.receipt_settings
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
