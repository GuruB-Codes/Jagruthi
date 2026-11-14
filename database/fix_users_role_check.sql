-- ==============================================================================
-- JAGRUTHI: FIX FOR "users_role_check" CONSTRAINT
-- ==============================================================================
-- If you encounter: "new row for relation 'users' violates check constraint 'users_role_check'"
-- Run this SQL in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Drop existing role check constraint
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Re-create constraint including all roles ('user', 'emergency', 'police', 'admin', 'patrol')
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('user', 'emergency', 'police', 'admin', 'patrol'));

-- 3. Confirm constraint is active
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'users_role_check';

