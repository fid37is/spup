-- ============================================================
-- 016_drop_selling_item.sql
-- Reversed course from 015: no separate item-description field.
-- The post's own body is the description — one less field to
-- fill in, and no duplicate content to keep in sync.
-- ============================================================

ALTER TABLE posts DROP COLUMN IF EXISTS selling_item;
