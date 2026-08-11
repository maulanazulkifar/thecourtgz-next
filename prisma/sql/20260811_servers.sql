-- Multi-server support for Black Lotus Court
-- Jalankan manual di PostgreSQL/Supabase (bukan prisma migrate).
-- Data existing → diikat ke "Cerita Roleplayku".

BEGIN;

CREATE TABLE IF NOT EXISTS servers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO servers (name, slug, is_active, created_at, updated_at)
VALUES
  ('Satu Mimpi Roleplay', 'satu-mimpi-roleplay', TRUE, NOW(), NOW()),
  ('Cerita Roleplayku', 'cerita-roleplayku', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS server_id BIGINT;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS server_id BIGINT;

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS server_id BIGINT;

-- Backfill ke Cerita Roleplayku
UPDATE categories
SET server_id = (SELECT id FROM servers WHERE slug = 'cerita-roleplayku' LIMIT 1)
WHERE server_id IS NULL;

UPDATE items
SET server_id = (SELECT id FROM servers WHERE slug = 'cerita-roleplayku' LIMIT 1)
WHERE server_id IS NULL;

UPDATE stock_movements
SET server_id = (SELECT id FROM servers WHERE slug = 'cerita-roleplayku' LIMIT 1)
WHERE server_id IS NULL;

ALTER TABLE categories
  ALTER COLUMN server_id SET NOT NULL;

ALTER TABLE items
  ALTER COLUMN server_id SET NOT NULL;

ALTER TABLE stock_movements
  ALTER COLUMN server_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_server_id_fkey'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_server_id_fkey
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_server_id_fkey'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT items_server_id_fkey
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_server_id_fkey'
  ) THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT stock_movements_server_id_fkey
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS categories_server_id_idx ON categories (server_id);
CREATE INDEX IF NOT EXISTS items_server_id_idx ON items (server_id);
CREATE INDEX IF NOT EXISTS stock_movements_server_id_idx ON stock_movements (server_id);
CREATE INDEX IF NOT EXISTS stock_movements_server_id_movement_date_idx
  ON stock_movements (server_id, movement_date);

-- SKU unik per server (bukan global)
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_sku_key;
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_server_id_sku_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_server_id_sku_key'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT items_server_id_sku_key UNIQUE (server_id, sku);
  END IF;
END $$;

COMMIT;
