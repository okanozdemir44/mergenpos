-- Düz metin şifreler için app_users tablosuna password kolonu ekleme
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS password text;

-- password_hash zorunluluğunu kaldır (böylece doğrudan plain text password kullanılabilir)
ALTER TABLE public.app_users ALTER COLUMN password_hash DROP NOT NULL;

-- Admin kullanıcısının varsayılan şifresini düz metin olarak güncelle
UPDATE public.app_users
SET password = 'admin123'
WHERE username = 'admin' AND (password IS NULL OR password = '');
