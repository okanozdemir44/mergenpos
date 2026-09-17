-- Fast-Food (Hızlı Satış) Dönüşümü:
-- 1. Dine-in için table_id zorunluluğunu kaldır (table_id nullable yap veya kısıtlamayı kaldır)
-- 2. orders tablosuna günlük fiş/sıra numarası (order_number) ekle
-- 3. Otomatik günlük sıra numarası atayan trigger ve fonksiyon

-- 1. table_id check kısıtlamasını kaldır
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_dine_in_requires_table;

-- table_id sütununu açıkça NULL olabilir yap
ALTER TABLE public.orders
  ALTER COLUMN table_id DROP NOT NULL;

-- 2. Günlük sıra / fiş numarası sütunu ekle
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number integer;

-- Hızlı sorgulama için index
CREATE INDEX IF NOT EXISTS orders_restaurant_order_number_idx
  ON public.orders (restaurant_id, created_at, order_number);

-- 3. Otomatik günlük sıra no atayan fonksiyon ve trigger
CREATE OR REPLACE FUNCTION private.assign_daily_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_start timestamptz := date_trunc('day', timezone('utc', now()));
  next_num integer;
BEGIN
  IF NEW.order_number IS NULL THEN
    SELECT COALESCE(MAX(order_number), 0) + 1 INTO next_num
    FROM public.orders
    WHERE restaurant_id = NEW.restaurant_id
      AND created_at >= today_start;
    NEW.order_number := COALESCE(next_num, 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_assign_order_number ON public.orders;
CREATE TRIGGER trg_orders_assign_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_daily_order_number();

-- 4. Mevcut siparişlere geçmiş sıra no ataması (varsa boş olanlar için)
UPDATE public.orders
SET order_number = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY restaurant_id, date_trunc('day', created_at) ORDER BY created_at) as rn
  FROM public.orders
  WHERE order_number IS NULL
) sub
WHERE public.orders.id = sub.id;
