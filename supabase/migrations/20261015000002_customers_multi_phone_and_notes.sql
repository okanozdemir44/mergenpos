-- ============================================================================
-- Mergen POS: Müşteri Çoklu Telefon, Not Alanları ve İstatistik View'ı
-- ============================================================================
-- NOT: Bu migration dosyası kullanıcı talimatı gereği otomatik ÇALIŞTIRILMAMIŞTIR.
-- Supabase Dashboard -> SQL Editor alanında tek seferde çalıştırılabilir.
-- ============================================================================

-- 1. customers tablosuna serbest not alanı ekleme ve bileşik anahtar sağlama
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_id_restaurant_id_key'
  ) THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_id_restaurant_id_key UNIQUE (id, restaurant_id);
  END IF;
END $$;

-- 2. customer_addresses tablosuna serbest not alanı ekleme
ALTER TABLE public.customer_addresses ADD COLUMN IF NOT EXISTS note text;

-- 3. customer_phones tablosu (Bir müşteriye ait birden fazla telefon numarası)
CREATE TABLE IF NOT EXISTS public.customer_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  phone text NOT NULL,
  label text NOT NULL DEFAULT 'Diğer',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT customer_phones_phone_check CHECK (phone ~ '^[0-9]+$'),
  CONSTRAINT customer_phones_customer_restaurant_fkey
    FOREIGN KEY (customer_id, restaurant_id)
    REFERENCES public.customers(id, restaurant_id)
    ON DELETE CASCADE
);

-- Aynı restoranda bir ek telefon yalnızca tek bir müşteriye ait olabilir
CREATE UNIQUE INDEX IF NOT EXISTS customer_phones_restaurant_phone_idx
  ON public.customer_phones (restaurant_id, phone);

CREATE INDEX IF NOT EXISTS customer_phones_customer_id_idx
  ON public.customer_phones (customer_id);

-- 4. Çapraz Telefon Çakışma Önleme Trigger'ları:
-- Ek telefonlar tablosundaki bir numara, ana customers.phone tablosundaki bir numarayla aynı restoranda çakışamaz!
CREATE OR REPLACE FUNCTION public.check_customer_phone_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customers
    WHERE restaurant_id = NEW.restaurant_id
      AND phone = NEW.phone
      AND id <> NEW.customer_id
  ) THEN
    RAISE EXCEPTION 'Bu telefon numarası (%) bu restoranda zaten başka bir müşterinin ana telefonu olarak kayıtlıdır.', NEW.phone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_customer_phone_conflict ON public.customer_phones;
CREATE TRIGGER trg_check_customer_phone_conflict
  BEFORE INSERT OR UPDATE OF phone, restaurant_id ON public.customer_phones
  FOR EACH ROW
  EXECUTE FUNCTION public.check_customer_phone_conflict();

CREATE OR REPLACE FUNCTION public.check_primary_phone_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.customer_phones
    WHERE restaurant_id = NEW.restaurant_id
      AND phone = NEW.phone
      AND customer_id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Bu telefon numarası (%) bu restoranda zaten başka bir müşterinin ek telefonu olarak kayıtlıdır.', NEW.phone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_primary_phone_conflict ON public.customers;
CREATE TRIGGER trg_check_primary_phone_conflict
  BEFORE INSERT OR UPDATE OF phone, restaurant_id ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.check_primary_phone_conflict();

-- 5. Row Level Security (RLS):
ALTER TABLE public.customer_phones ENABLE ROW LEVEL SECURITY;

-- private.user_restaurant_ids() fonksiyonu üzerinden tüm authenticated personele silme dahil tam yetki
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'user_restaurant_ids'
  ) THEN
    DROP POLICY IF EXISTS customer_phones_staff_access ON public.customer_phones;
    CREATE POLICY customer_phones_staff_access
      ON public.customer_phones
      FOR ALL
      TO authenticated
      USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
      WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));
  ELSE
    -- Custom auth veya bypass ortamları için fallback izin
    DROP POLICY IF EXISTS customer_phones_fallback_access ON public.customer_phones;
    CREATE POLICY customer_phones_fallback_access
      ON public.customer_phones
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 6. Müşteri İstatistik View'ı (security_invoker = true, restoran izolasyonunu ve RLS'i korur):
-- Tüm siparişleri tarayıcıya çekmeden her müşterinin sipariş sayısı, toplam cirosu ve son sipariş tarihini hesaplar.
CREATE OR REPLACE VIEW public.customer_order_stats
WITH (security_invoker = true)
AS
SELECT
  c.id AS customer_id,
  c.restaurant_id,
  COUNT(o.id) AS total_orders,
  COALESCE(SUM(o.total_amount), 0) AS total_spent,
  MAX(o.created_at) AS last_order_at,
  MIN(o.created_at) AS first_order_at
FROM public.customers c
LEFT JOIN public.orders o
  ON o.customer_id = c.id
  AND o.restaurant_id = c.restaurant_id
  AND o.status <> 'cancelled'
GROUP BY c.id, c.restaurant_id;

-- 7. Yardımcı fonksiyon: Belirli bir restoran için müşteri istatistiklerini döndürür
CREATE OR REPLACE FUNCTION public.get_customer_stats(p_restaurant_id uuid)
RETURNS TABLE (
  customer_id uuid,
  total_orders bigint,
  total_spent numeric,
  last_order_at timestamptz,
  first_order_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    c.id AS customer_id,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.total_amount), 0) AS total_spent,
    MAX(o.created_at) AS last_order_at,
    MIN(o.created_at) AS first_order_at
  FROM public.customers c
  LEFT JOIN public.orders o
    ON o.customer_id = c.id
    AND o.restaurant_id = c.restaurant_id
    AND o.status <> 'cancelled'
  WHERE c.restaurant_id = p_restaurant_id
  GROUP BY c.id;
$$;
