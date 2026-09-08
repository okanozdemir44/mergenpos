-- Seed salon tables for Öküz Burger + enable Realtime

INSERT INTO public.restaurant_tables (restaurant_id, name, status)
SELECT r.id, v.name, v.status
FROM public.restaurants r
CROSS JOIN (
  VALUES
    ('Masa 1', 'empty'),
    ('Masa 2', 'empty'),
    ('Masa 3', 'occupied'),
    ('Masa 4', 'empty'),
    ('Masa 5', 'bill_requested'),
    ('Masa 6', 'empty'),
    ('Masa 7', 'occupied'),
    ('Masa 8', 'empty'),
    ('Masa 9', 'empty'),
    ('Masa 10', 'empty'),
    ('Masa 11', 'empty'),
    ('Masa 12', 'empty')
) AS v(name, status)
WHERE r.slug = 'okuz-burger'
ON CONFLICT (restaurant_id, name) DO NOTHING;

-- Realtime: salon grid listens to restaurant_tables changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'restaurant_tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
  END IF;
END $$;
