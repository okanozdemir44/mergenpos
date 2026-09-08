-- Sample menu for Öküz Burger (idempotent by name)

WITH rest AS (
  SELECT id FROM public.restaurants WHERE slug = 'okuz-burger'
),
ins_cats AS (
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order)
  SELECT r.id, v.name, v.sort_order
  FROM rest r
  CROSS JOIN (
    VALUES
      ('Burgerler', 1),
      ('Yan Ürünler', 2),
      ('İçecekler', 3)
  ) AS v(name, sort_order)
  ON CONFLICT (restaurant_id, name) DO UPDATE
    SET sort_order = EXCLUDED.sort_order
  RETURNING id, name, restaurant_id
)
INSERT INTO public.menu_items (
  restaurant_id, category_id, name, price, description, is_available, sort_order
)
SELECT
  c.restaurant_id,
  c.id,
  i.name,
  i.price,
  i.description,
  true,
  i.sort_order
FROM ins_cats c
JOIN (
  VALUES
    ('Burgerler', 'Klasik Burger', 220::numeric, 'Dana köfte, cheddar, turşu', 1),
    ('Burgerler', 'Öküz Burger', 280::numeric, 'Çift köfte, bacon, sos', 2),
    ('Burgerler', 'Tavuk Burger', 200::numeric, 'Çıtır tavuk, ranch', 3),
    ('Yan Ürünler', 'Patates', 90::numeric, 'Ev yapımı dilim', 1),
    ('Yan Ürünler', 'Soğan Halkası', 100::numeric, '6 adet', 2),
    ('İçecekler', 'Kola', 60::numeric, '33 cl', 1),
    ('İçecekler', 'Ayran', 45::numeric, '300 ml', 2),
    ('İçecekler', 'Su', 20::numeric, '0.5 L', 3)
) AS i(category_name, name, price, description, sort_order)
  ON i.category_name = c.name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.menu_items mi
  WHERE mi.restaurant_id = c.restaurant_id
    AND mi.category_id = c.id
    AND mi.name = i.name
);
