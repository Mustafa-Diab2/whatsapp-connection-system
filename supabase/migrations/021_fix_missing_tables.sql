-- Migration: 021_fix_missing_tables
-- Description: Add missing purchase_order_items table and missing columns

-- 1. Create purchase_order_items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_cost DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add missing columns to vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS address TEXT; -- already in 013 but double checking

-- 3. Add missing columns to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 4. Enable RLS
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- 5. Add triggers for updated_at
DROP TRIGGER IF EXISTS update_vendors_modtime ON vendors;
CREATE TRIGGER update_vendors_modtime BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_purchase_orders_modtime ON purchase_orders;
CREATE TRIGGER update_purchase_orders_modtime BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
