-- Migration: 019_add_user_permissions
-- Description: Add allowed_pages column to users table for granular access control

ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_pages TEXT[] DEFAULT NULL;

-- Comment: If allowed_pages is NULL, it means the user has access to all pages (default for admins)
-- or we can default it to an empty array and explicitly add pages.
-- For backward compatibility, NULL = default behavior.
