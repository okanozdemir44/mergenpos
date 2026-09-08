-- Remove bill_requested status from restaurant_tables
-- Update existing rows to occupied if they were bill_requested
UPDATE public.restaurant_tables
SET status = 'occupied'
WHERE status = 'bill_requested';

-- Drop the old constraint
ALTER TABLE public.restaurant_tables
DROP CONSTRAINT IF EXISTS restaurant_tables_status_check;

-- Add new constraint without bill_requested
ALTER TABLE public.restaurant_tables
ADD CONSTRAINT restaurant_tables_status_check
CHECK (status IN ('empty', 'occupied'));
