-- Billing, delivery queue fields, stock tracking

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS courier_status text
    CHECK (
      courier_status IS NULL
      OR courier_status IN ('queued', 'dispatched', 'delivered')
    );

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'adet',
  quantity numeric(14, 3) NOT NULL DEFAULT 0,
  critical_threshold numeric(14, 3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (restaurant_id, name)
);

CREATE TABLE public.menu_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items (id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES public.stock_items (id) ON DELETE CASCADE,
  amount_used numeric(14, 3) NOT NULL CHECK (amount_used > 0),
  UNIQUE (menu_item_id, stock_item_id)
);

CREATE INDEX stock_items_restaurant_id_idx ON public.stock_items (restaurant_id);
CREATE INDEX menu_item_ingredients_restaurant_id_idx ON public.menu_item_ingredients (restaurant_id);
CREATE INDEX menu_item_ingredients_menu_item_id_idx ON public.menu_item_ingredients (menu_item_id);
CREATE INDEX orders_restaurant_id_type_status_idx ON public.orders (restaurant_id, order_type, status);
CREATE INDEX orders_courier_status_idx ON public.orders (restaurant_id, courier_status);

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_items_select_own
  ON public.stock_items FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY stock_items_insert_own
  ON public.stock_items FOR INSERT TO authenticated
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY stock_items_update_own
  ON public.stock_items FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY stock_items_delete_own
  ON public.stock_items FOR DELETE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_item_ingredients_select_own
  ON public.menu_item_ingredients FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_item_ingredients_insert_own
  ON public.menu_item_ingredients FOR INSERT TO authenticated
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_item_ingredients_update_own
  ON public.menu_item_ingredients FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_item_ingredients_delete_own
  ON public.menu_item_ingredients FOR DELETE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

-- Deduct stock when an order is completed (atomic, DB-side)
CREATE OR REPLACE FUNCTION private.deduct_stock_on_order_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.stock_items si
    SET quantity = si.quantity - d.used
    FROM (
      SELECT
        mii.stock_item_id,
        SUM(mii.amount_used * oi.quantity) AS used
      FROM public.order_items oi
      JOIN public.menu_item_ingredients mii
        ON mii.menu_item_id = oi.menu_item_id
       AND mii.restaurant_id = oi.restaurant_id
      WHERE oi.order_id = NEW.id
      GROUP BY mii.stock_item_id
    ) d
    WHERE si.id = d.stock_item_id
      AND si.restaurant_id = NEW.restaurant_id;
  END IF;

  -- Delivery ready → courier queue (Phase-2 bridge hook inside POS)
  IF NEW.order_type = 'delivery'
     AND NEW.status = 'ready'
     AND (OLD.status IS DISTINCT FROM 'ready')
     AND NEW.courier_status IS NULL THEN
    NEW.courier_status := 'queued';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_deduct_stock_on_completed ON public.orders;
CREATE TRIGGER orders_deduct_stock_on_completed
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.deduct_stock_on_order_completed();

-- Realtime for counter boards
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;
