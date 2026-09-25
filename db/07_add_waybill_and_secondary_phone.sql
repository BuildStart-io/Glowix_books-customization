-- Migration: Add waybill tracking number and secondary phone (No-2) to orders
-- Schema: Glowix_books

ALTER TABLE Glowix_books.orders
ADD COLUMN IF NOT EXISTS secondary_phone text DEFAULT NULL;

ALTER TABLE Glowix_books.orders
ADD COLUMN IF NOT EXISTS waybill_number text DEFAULT NULL;

ALTER TABLE Glowix_books.orders
ADD COLUMN IF NOT EXISTS waybill_updated_at timestamp with time zone DEFAULT NULL;

-- Indexes for fast lookup by waybill number and secondary phone
CREATE INDEX IF NOT EXISTS idx_orders_waybill_number ON Glowix_books.orders (user_id, waybill_number) WHERE waybill_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_secondary_phone ON Glowix_books.orders (user_id, secondary_phone) WHERE secondary_phone IS NOT NULL;
