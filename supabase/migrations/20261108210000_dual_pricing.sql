-- ============================================================================
-- Çift Fiyatlandırma (Dual-Pricing) Mimarisi: Tezgah ve Paket Siparişleri
-- ============================================================================

-- 1. menu_items tablosuna price_delivery kolonu ekle
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS price_delivery numeric(12, 2);

-- 2. Mevcut price kolonunu price_store olarak da sunmak için price_store kolonu ekle
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS price_store numeric(12, 2);

-- Mevcut satırlarda price_store null ise price ile doldur
UPDATE public.menu_items
SET price_store = price
WHERE price_store IS NULL;

-- Mevcut satırlarda price_delivery null ise varsayılan olarak price_store (veya price) ile doldur
UPDATE public.menu_items
SET price_delivery = COALESCE(price_store, price)
WHERE price_delivery IS NULL;

-- 3. price ile price_store senkronizasyon trigger'ı
CREATE OR REPLACE FUNCTION public.sync_menu_item_prices()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.price_store IS NOT NULL AND (OLD.price_store IS NULL OR NEW.price_store <> OLD.price_store) THEN
    NEW.price := NEW.price_store;
  ELSIF NEW.price IS NOT NULL THEN
    NEW.price_store := NEW.price;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_menu_item_prices ON public.menu_items;
CREATE TRIGGER trg_sync_menu_item_prices
  BEFORE INSERT OR UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_menu_item_prices();

-- 4. order_items tablosunda unit_price kolonunun varlığını ve kısıtını teyit et
-- Not: unit_price kolonu sipariş anındaki statik birim fiyatı (tezgah veya paket)
-- snapshot olarak saklar ve geçmiş siparişler products/menu tablosundan bağımsız kalır.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN unit_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.menu_items.price_delivery IS 'Paket servis tek ortak satış fiyatı (çift fiyatlandırma)';
COMMENT ON COLUMN public.menu_items.price_store IS 'Tezgah satış fiyatı (price kolonu ile senkron)';
COMMENT ON COLUMN public.order_items.unit_price IS 'Sipariş tamamlandığında aktif olan statik birim fiyat';

