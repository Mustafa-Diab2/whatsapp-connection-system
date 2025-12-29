-- Add customer_type and tags management columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'not_set';
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
