-- Add auto assign columns to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS auto_assign_enabled BOOLEAN DEFAULT false;

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS last_assigned_index INTEGER DEFAULT -1;
