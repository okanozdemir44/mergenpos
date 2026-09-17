-- Custom Auth Schema
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'waiter', 'cashier', 'manager')),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Insert admin user (password: admin123)
-- Hash generated via bcrypt: $2b$10$vLlq5whusF045eXrN.cqNO6ZigWLzXi4qlfv/EHUGGdx6qroOG2dK
INSERT INTO public.app_users (restaurant_id, username, password_hash, role, name)
SELECT id, 'admin', '$2b$10$vLlq5whusF045eXrN.cqNO6ZigWLzXi4qlfv/EHUGGdx6qroOG2dK', 'admin', 'Sistem Yöneticisi'
FROM public.restaurants
WHERE slug = 'okuz-burger'
LIMIT 1;

-- Modify staff table to link to app_users instead of auth.users
ALTER TABLE public.staff DROP CONSTRAINT staff_user_id_fkey;
ALTER TABLE public.staff RENAME COLUMN user_id TO app_user_id;

-- Now we need to update RLS policies since auth.uid() is no longer valid.
-- For now, we will disable RLS or allow all since we will access via server-side service role.
ALTER TABLE public.restaurants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff DISABLE ROW LEVEL SECURITY;
