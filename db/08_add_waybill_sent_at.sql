-- Migration: Add waybill_sent_at to glowix_books.orders to prevent duplicate tracking notifications
ALTER TABLE glowix_books.orders 
ADD COLUMN IF NOT EXISTS waybill_sent_at TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS idx_orders_waybill_sent_at 
ON glowix_books.orders(user_id, waybill_sent_at) 
WHERE waybill_number IS NOT NULL;
