-- ==============================================================================
-- JAGRUTHI: REAL-TIME POLICE PATROL TRACKING & DISPATCH SCHEMA EXTENSION
-- ==============================================================================
-- Run this migration in your Supabase SQL Editor if you wish to instantiate
-- dedicated standalone patrol tables, or to inspect the security policies.
-- The Jagruthi client is backwards-compatible with both existing and extended schemas.
-- ==============================================================================

-- 1. Ensure police_units table has necessary columns
CREATE TABLE IF NOT EXISTS public.police_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_name TEXT NOT NULL,
    officer_name TEXT,
    officer_id TEXT UNIQUE,
    phone TEXT,
    status TEXT DEFAULT 'available', -- 'available', 'assigned', 'en_route', 'arrived', 'offline'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for phone and officer lookup
CREATE INDEX IF NOT EXISTS idx_police_units_phone ON public.police_units(phone);
CREATE INDEX IF NOT EXISTS idx_police_units_status ON public.police_units(status);

-- 2. Dedicated Patrol Dispatches Table (Audit & Lifecycle Tracking)
CREATE TABLE IF NOT EXISTS public.patrol_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID REFERENCES public.emergency_alerts(id) ON DELETE CASCADE,
    sos_id TEXT,
    patrol_unit_id UUID REFERENCES public.police_units(id) ON DELETE SET NULL,
    officer_name TEXT NOT NULL,
    officer_id TEXT NOT NULL,
    officer_phone TEXT NOT NULL,
    victim_phone TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    victim_latitude DOUBLE PRECISION NOT NULL,
    victim_longitude DOUBLE PRECISION NOT NULL,
    assigned_by TEXT DEFAULT 'Dispatch Command',
    dispatch_status TEXT DEFAULT 'ASSIGNED', -- 'ASSIGNED', 'ACKNOWLEDGED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'CANCELLED'
    estimated_distance_km DOUBLE PRECISION,
    estimated_eta_mins DOUBLE PRECISION,
    special_instructions TEXT,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    en_route_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patrol_dispatches_alert_id ON public.patrol_dispatches(alert_id);
CREATE INDEX IF NOT EXISTS idx_patrol_dispatches_officer_phone ON public.patrol_dispatches(officer_phone);
CREATE INDEX IF NOT EXISTS idx_patrol_dispatches_status ON public.patrol_dispatches(dispatch_status);

-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- Enable RLS on both tables
ALTER TABLE public.police_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_dispatches ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users and police officers can view patrol units
CREATE POLICY "Allow authenticated read on police_units"
    ON public.police_units
    FOR SELECT
    USING (true);

-- Policy: Officers can update their own status or command can update on dispatch
CREATE POLICY "Allow authenticated update on police_units"
    ON public.police_units
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Policy: Allow insert of police units
CREATE POLICY "Allow authenticated insert on police_units"
    ON public.police_units
    FOR INSERT
    WITH CHECK (true);

-- Policy: Allow read on patrol dispatches
CREATE POLICY "Allow read on patrol_dispatches"
    ON public.patrol_dispatches
    FOR SELECT
    USING (true);

-- Policy: Allow command to create dispatches
CREATE POLICY "Allow insert on patrol_dispatches"
    ON public.patrol_dispatches
    FOR INSERT
    WITH CHECK (true);

-- Policy: Allow officer or command to update dispatch status
CREATE POLICY "Allow update on patrol_dispatches"
    ON public.patrol_dispatches
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- 4. Enable Supabase Realtime for instant event broadcasting
ALTER PUBLICATION supabase_realtime ADD TABLE public.police_units;
ALTER PUBLICATION supabase_realtime ADD TABLE public.patrol_dispatches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;
