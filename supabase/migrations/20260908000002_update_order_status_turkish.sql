-- Update order status values to Turkish for better UX
-- This migration adds new Turkish status values and migrates existing data

-- First, temporarily allow both old and new values
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
ADD CONSTRAINT orders_status_check
CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled', 
                  'hazirlaniyor', 'hazir', 'yolda', 'teslim_edildi', 'iptal'));

-- Migrate existing data
UPDATE public.orders
SET status = CASE
  WHEN status = 'pending' THEN 'hazirlaniyor'
  WHEN status = 'preparing' THEN 'hazirlaniyor'
  WHEN status = 'ready' THEN 'hazir'
  WHEN status = 'completed' THEN 'teslim_edildi'
  WHEN status = 'cancelled' THEN 'iptal'
  ELSE status
END;

-- Now remove old values and keep only Turkish ones
ALTER TABLE public.orders
DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders
ADD CONSTRAINT orders_status_check
CHECK (status IN ('hazirlaniyor', 'hazir', 'yolda', 'teslim_edildi', 'iptal'));

-- Update default value
ALTER TABLE public.orders
ALTER COLUMN status SET DEFAULT 'hazirlaniyor';
