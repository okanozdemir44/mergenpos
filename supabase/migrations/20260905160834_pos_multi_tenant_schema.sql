-- POS multi-tenant schema (Mergen Pos)
-- Courier bridge (packages.pos_order_id) is Phase 2 — not in this migration.

-- ---------------------------------------------------------------------------
-- Helper schema for SECURITY DEFINER RLS helpers (not exposed via Data API)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  subscription_status text NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'empty'
    CHECK (status IN ('empty', 'occupied', 'bill_requested')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (restaurant_id, name)
);

CREATE TABLE public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (restaurant_id, name)
);

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.menu_categories (id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  description text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.restaurant_tables (id) ON DELETE SET NULL,
  order_type text NOT NULL
    CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  total_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  customer_name text,
  customer_phone text,
  delivery_address text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT orders_dine_in_requires_table
    CHECK (order_type <> 'dine_in' OR table_id IS NOT NULL)
);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items (id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  note text,
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preparing', 'ready'))
);

CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN ('waiter', 'cashier', 'manager')),
  name text NOT NULL,
  UNIQUE (restaurant_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX restaurant_tables_restaurant_id_idx ON public.restaurant_tables (restaurant_id);
CREATE INDEX restaurant_tables_restaurant_id_status_idx ON public.restaurant_tables (restaurant_id, status);

CREATE INDEX menu_categories_restaurant_id_idx ON public.menu_categories (restaurant_id);
CREATE INDEX menu_categories_restaurant_id_sort_idx ON public.menu_categories (restaurant_id, sort_order);

CREATE INDEX menu_items_restaurant_id_idx ON public.menu_items (restaurant_id);
CREATE INDEX menu_items_category_id_idx ON public.menu_items (category_id);
CREATE INDEX menu_items_restaurant_id_sort_idx ON public.menu_items (restaurant_id, sort_order);

CREATE INDEX orders_restaurant_id_idx ON public.orders (restaurant_id);
CREATE INDEX orders_restaurant_id_status_idx ON public.orders (restaurant_id, status);
CREATE INDEX orders_table_id_idx ON public.orders (table_id);
CREATE INDEX orders_created_at_idx ON public.orders (created_at DESC);

CREATE INDEX order_items_restaurant_id_idx ON public.order_items (restaurant_id);
CREATE INDEX order_items_order_id_idx ON public.order_items (order_id);
CREATE INDEX order_items_menu_item_id_idx ON public.order_items (menu_item_id);
CREATE INDEX order_items_order_id_status_idx ON public.order_items (order_id, status);

CREATE INDEX staff_restaurant_id_idx ON public.staff (restaurant_id);
CREATE INDEX staff_user_id_idx ON public.staff (user_id);

-- Keep order_items.restaurant_id aligned with parent order
CREATE OR REPLACE FUNCTION private.set_order_item_restaurant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT o.restaurant_id INTO NEW.restaurant_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF NEW.restaurant_id IS NULL THEN
    RAISE EXCEPTION 'order_items.order_id % not found', NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER order_items_set_restaurant_id
  BEFORE INSERT OR UPDATE OF order_id
  ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION private.set_order_item_restaurant_id();

-- ---------------------------------------------------------------------------
-- RLS helper: restaurant ids for current auth user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.user_restaurant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.restaurant_id
  FROM public.staff s
  WHERE s.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION private.user_restaurant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_restaurant_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- restaurants
CREATE POLICY restaurants_select_own
  ON public.restaurants FOR SELECT TO authenticated
  USING (id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY restaurants_update_own
  ON public.restaurants FOR UPDATE TO authenticated
  USING (id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (id IN (SELECT private.user_restaurant_ids()));

-- restaurant_tables
CREATE POLICY restaurant_tables_select_own
  ON public.restaurant_tables FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY restaurant_tables_insert_own
  ON public.restaurant_tables FOR INSERT TO authenticated
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY restaurant_tables_update_own
  ON public.restaurant_tables FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY restaurant_tables_delete_own
  ON public.restaurant_tables FOR DELETE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

-- menu_categories
CREATE POLICY menu_categories_select_own
  ON public.menu_categories FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_categories_insert_own
  ON public.menu_categories FOR INSERT TO authenticated
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_categories_update_own
  ON public.menu_categories FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_categories_delete_own
  ON public.menu_categories FOR DELETE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

-- menu_items
CREATE POLICY menu_items_select_own
  ON public.menu_items FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_items_insert_own
  ON public.menu_items FOR INSERT TO authenticated
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_items_update_own
  ON public.menu_items FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY menu_items_delete_own
  ON public.menu_items FOR DELETE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

-- orders
CREATE POLICY orders_select_own
  ON public.orders FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY orders_insert_own
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY orders_update_own
  ON public.orders FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY orders_delete_own
  ON public.orders FOR DELETE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

-- order_items
CREATE POLICY order_items_select_own
  ON public.order_items FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY order_items_insert_own
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY order_items_update_own
  ON public.order_items FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY order_items_delete_own
  ON public.order_items FOR DELETE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

-- staff: users see colleagues in their restaurants only
CREATE POLICY staff_select_own_restaurant
  ON public.staff FOR SELECT TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY staff_insert_own_restaurant
  ON public.staff FOR INSERT TO authenticated
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY staff_update_own_restaurant
  ON public.staff FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()))
  WITH CHECK (restaurant_id IN (SELECT private.user_restaurant_ids()));

CREATE POLICY staff_delete_own_restaurant
  ON public.staff FOR DELETE TO authenticated
  USING (restaurant_id IN (SELECT private.user_restaurant_ids()));

-- ---------------------------------------------------------------------------
-- Seed: Öküz Burger (first tenant)
-- ---------------------------------------------------------------------------
INSERT INTO public.restaurants (name, slug, subscription_status)
VALUES ('Öküz Burger', 'okuz-burger', 'active');
