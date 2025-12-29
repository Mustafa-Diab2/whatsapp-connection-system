-- Add tags column to deals table
ALTER TABLE deals ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
