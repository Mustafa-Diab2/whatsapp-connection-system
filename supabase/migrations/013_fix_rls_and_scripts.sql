-- Migration 009: Fix RLS and Schema consistency
-- 1. Disable RLS for tables that were enabled but missing policies
ALTER TABLE IF EXISTS deals DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS documents DISABLE ROW LEVEL SECURITY;

-- 2. Create the execute_sql function if it doesn't exist
-- This is used for automated schema updates from the API
CREATE OR REPLACE FUNCTION public.execute_sql(sql_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the creator
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;

-- 3. Ensure deals table has necessary columns (double check)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='tags') THEN
    ALTER TABLE deals ADD COLUMN tags TEXT[] DEFAULT '{}';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='expected_close_date') THEN
    ALTER TABLE deals ADD COLUMN expected_close_date DATE;
  END IF;
END $$;
