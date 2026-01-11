-- Migration: 020_super_admin_and_org_limits
-- Description: Add super_admin role support, organization status, and member limits

-- 1. Add status and member_limit to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS member_limit INTEGER DEFAULT 10;

-- 2. Update users role check (if we had any, but role is just a TEXT column)
-- We'll use 'super_admin' as a new possible value for the role column.

-- 3. Add a function to check member limit before insertion
CREATE OR REPLACE FUNCTION check_org_member_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    allowed_limit INTEGER;
BEGIN
    -- Get the current member count for the organization
    SELECT COUNT(*) INTO current_count FROM users WHERE organization_id = NEW.organization_id;
    
    -- Get the allowed limit for the organization
    SELECT member_limit INTO allowed_limit FROM organizations WHERE id = NEW.organization_id;
    
    -- If count exceeds or equals limit, raise exception
    IF current_count >= allowed_limit THEN
        RAISE EXCEPTION 'Organization has reached its member limit of %', allowed_limit;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce the limit
DROP TRIGGER IF EXISTS trg_check_org_member_limit ON users;
CREATE TRIGGER trg_check_org_member_limit
BEFORE INSERT ON users
FOR EACH ROW
WHEN (NEW.role != 'super_admin') -- Super admins don't count towards org limits
EXECUTE FUNCTION check_org_member_limit();
