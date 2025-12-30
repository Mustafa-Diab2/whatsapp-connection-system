-- Fix invalid phone numbers in customers and contacts tables
-- This migration cleans up phone numbers that contain WhatsApp internal IDs (LIDs)

-- Step 1: Update Egyptian phones that have LID patterns with embedded 201xxxxxxxxx
UPDATE customers 
SET phone = SUBSTRING(phone FROM '201[0-9]{9}')
WHERE 
    LENGTH(phone) > 14 
    AND phone ~ '201[0-9]{9}'
    AND organization_id IS NOT NULL;

UPDATE contacts 
SET phone = SUBSTRING(phone FROM '201[0-9]{9}')
WHERE 
    LENGTH(phone) > 14 
    AND phone ~ '201[0-9]{9}'
    AND organization_id IS NOT NULL;

-- Step 2: Update Saudi phones that have LID patterns with embedded 966xxxxxxxxx
UPDATE customers 
SET phone = SUBSTRING(phone FROM '966[5][0-9]{8}')
WHERE 
    LENGTH(phone) > 14 
    AND phone ~ '966[5][0-9]{8}'
    AND organization_id IS NOT NULL;

UPDATE contacts 
SET phone = SUBSTRING(phone FROM '966[5][0-9]{8}')
WHERE 
    LENGTH(phone) > 14 
    AND phone ~ '966[5][0-9]{8}'
    AND organization_id IS NOT NULL;

-- Step 3: Flag or mark remaining invalid phones (too long and no valid pattern found)
-- We'll add a note so users can manually fix these
UPDATE customers
SET notes = COALESCE(notes, '') || ' [AUTO] رقم غير صالح يحتاج مراجعة: ' || phone
WHERE 
    LENGTH(phone) > 15 
    AND phone !~ '^\d{10,13}$'
    AND notes NOT LIKE '%رقم غير صالح%';

-- Step 4: Normalize Egyptian local format (01xxxxxxxxx -> 201xxxxxxxxx)
UPDATE customers 
SET phone = '20' || SUBSTRING(phone FROM 2)
WHERE 
    phone ~ '^01[0-9]{9}$'
    AND LENGTH(phone) = 11;

UPDATE contacts 
SET phone = '20' || SUBSTRING(phone FROM 2)
WHERE 
    phone ~ '^01[0-9]{9}$'
    AND LENGTH(phone) = 11;

-- Step 5: Create index on phone for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

-- Step 6: Add a function to normalize phone numbers for future use
CREATE OR REPLACE FUNCTION normalize_phone(phone_input TEXT)
RETURNS TEXT AS $$
DECLARE
    clean_phone TEXT;
BEGIN
    -- Remove all non-digits
    clean_phone := regexp_replace(phone_input, '[^0-9]', '', 'g');
    
    -- Egyptian normalization
    IF clean_phone ~ '^01[0-9]{9}$' THEN
        clean_phone := '20' || substring(clean_phone from 2);
    ELSIF clean_phone ~ '^1[0-9]{9}$' THEN
        clean_phone := '20' || clean_phone;
    END IF;
    
    -- Saudi normalization
    IF clean_phone ~ '^05[0-9]{8}$' THEN
        clean_phone := '966' || substring(clean_phone from 2);
    ELSIF clean_phone ~ '^5[0-9]{8}$' THEN
        clean_phone := '966' || clean_phone;
    END IF;
    
    RETURN clean_phone;
END;
$$ LANGUAGE plpgsql;

-- Log results
DO $$
DECLARE
    customers_fixed INT;
    contacts_fixed INT;
BEGIN
    SELECT COUNT(*) INTO customers_fixed FROM customers WHERE LENGTH(phone) BETWEEN 10 AND 13;
    SELECT COUNT(*) INTO contacts_fixed FROM contacts WHERE LENGTH(phone) BETWEEN 10 AND 13;
    
    RAISE NOTICE 'Phone normalization complete. Valid customers: %, Valid contacts: %', customers_fixed, contacts_fixed;
END $$;
