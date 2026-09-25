-- ============================================================================
-- 04_add_stock_quantity.sql — Add stock_quantity column to products
-- Run on existing databases to enable stock tracking without re-running 01_schema.sql.
-- ============================================================================

ALTER TABLE Glowix_books.products 
ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT NULL;

COMMENT ON COLUMN Glowix_books.products.stock_quantity IS 'Available stock quantity. NULL means unlimited/untracked.';
