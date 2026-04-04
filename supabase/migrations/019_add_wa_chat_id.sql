-- Migration: Add wa_chat_id column to customers table
-- This column stores the proper WhatsApp chat ID (e.g., "201234567890@c.us")
-- which is required for reliable campaign message sending

-- Add wa_chat_id column to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS wa_chat_id TEXT;

-- Add index for faster lookups by wa_chat_id
CREATE INDEX IF NOT EXISTS idx_customers_wa_chat_id 
ON customers(wa_chat_id) 
WHERE wa_chat_id IS NOT NULL;

-- Add index for organization + wa_chat_id lookups
CREATE INDEX IF NOT EXISTS idx_customers_org_wa_chat_id 
ON customers(organization_id, wa_chat_id) 
WHERE wa_chat_id IS NOT NULL;

-- Add wa_chat_id to contacts table as well (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS wa_chat_id TEXT;
        
        -- Create index for contacts
        CREATE INDEX IF NOT EXISTS idx_contacts_wa_chat_id 
        ON contacts(wa_chat_id) 
        WHERE wa_chat_id IS NOT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_contacts_org_wa_chat_id 
        ON contacts(organization_id, wa_chat_id) 
        WHERE wa_chat_id IS NOT NULL;
    END IF;
END $$;

-- Add comment explaining the column
COMMENT ON COLUMN customers.wa_chat_id IS 'WhatsApp Chat ID in format "phone@c.us" or "phone@g.us". Used for reliable message sending.';

-- Create a function to validate wa_chat_id format
CREATE OR REPLACE FUNCTION validate_wa_chat_id(chat_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF chat_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Must end with @c.us or @g.us
    RETURN chat_id ~ '^[0-9]+@(c\.us|g\.us)$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add check constraint for wa_chat_id format
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'chk_valid_wa_chat_id' AND table_name = 'customers'
    ) THEN
        ALTER TABLE customers 
        ADD CONSTRAINT chk_valid_wa_chat_id 
        CHECK (validate_wa_chat_id(wa_chat_id));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Print success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 012_add_wa_chat_id completed successfully!';
    RAISE NOTICE 'wa_chat_id column added to customers table.';
    RAISE NOTICE 'Run syncAllChatsToDatabase() after WhatsApp connection to populate this field.';
END $$;
