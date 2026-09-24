// Connect Supabase Client
// Replace these with your actual Supabase Project URL and Anon Public Key
const supabaseUrl = "https://aibfppmwpdrttfezhdkj.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpYmZwcG13cGRydHRmZXpoZGtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4OTkzNjcsImV4cCI6MjA5MTQ3NTM2N30.qjeIw-rzvTjeo28o38WmuaPjMWHgsLG8RLZEwvr7gJU";

// Initialize the Supabase client
// This assumes the Supabase script is loaded via CDN before this script
let supabaseInstance = null;

try {
    if (typeof supabase !== 'undefined') {
        supabaseInstance = supabase.createClient(supabaseUrl, supabaseKey);
    } else if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey);
    } else {
        console.error("Supabase CDN not loaded correctly. Please check your internet connection or script tag.");
    }
} catch (err) {
    console.error("Error initializing Supabase client:", err);
}

// Make it globally available on the window object
window.supabaseClient = supabaseInstance;

// Universal UUID Generator Helper
function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
window.generateUUID = generateUUID;

// Global Jagruthi SOS & Evidence Service Helper
window.jagruthiSosService = {
    /**
     * Creates a row in sos_events
     */
    async createSosEvent({ userId, latitude, longitude }) {
        const client = window.supabaseClient;
        const sosId = generateUUID();
        const validUserId = userId || generateUUID();
        const now = new Date().toISOString();
        
        const eventPayload = {
            id: sosId,
            user_id: validUserId,
            status: 'ACTIVE',
            latitude: typeof latitude === 'number' ? latitude : parseFloat(latitude) || 0.0,
            longitude: typeof longitude === 'number' ? longitude : parseFloat(longitude) || 0.0,
            started_at: now,
            created_at: now
        };

        if (!client) {
            console.warn("Supabase client not available. Created local SOS event:", eventPayload);
            return { data: eventPayload, error: null };
        }

        try {
            const { data, error } = await client
                .from('sos_events')
                .insert([eventPayload])
                .select()
                .single();

            if (error) {
                console.error("Error creating sos_events record in Supabase:", error);
                // Return payload with generated id so local flow continues seamlessly
                return { data: eventPayload, error };
            }
            return { data: data || eventPayload, error: null };
        } catch (err) {
            console.error("Exception in createSosEvent:", err);
            return { data: eventPayload, error: err };
        }
    },

    /**
     * Resolves an SOS event by setting status to RESOLVED and ended_at
     */
    async resolveSosEvent(sosId) {
        const client = window.supabaseClient;
        if (!client || !sosId) return;

        const now = new Date().toISOString();
        try {
            const { error } = await client
                .from('sos_events')
                .update({ status: 'RESOLVED', ended_at: now })
                .eq('id', sosId);

            if (error) {
                console.error("Error resolving sos_events in Supabase:", error);
            }
        } catch (err) {
            console.error("Exception in resolveSosEvent:", err);
        }
    },

    /**
     * Inserts or updates an evidence record in sos_evidence
     */
    async createSosEvidenceRecord({ id, sosId, userId, evidenceType, storagePath, fileName, capturedAt, status }) {
        const client = window.supabaseClient;
        const evidenceId = id || generateUUID();
        const now = new Date().toISOString();

        const evidencePayload = {
            id: evidenceId,
            sos_id: sosId,
            user_id: userId,
            evidence_type: evidenceType, // 'video' | 'audio'
            storage_path: storagePath,
            file_name: fileName,
            captured_at: capturedAt || now,
            uploaded_at: status === 'UPLOADED' ? now : null,
            status: status || 'RECORDING', // 'RECORDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED'
            created_at: now
        };

        if (!client) {
            return { data: evidencePayload, error: null };
        }

        try {
            const { data, error } = await client
                .from('sos_evidence')
                .insert([evidencePayload])
                .select()
                .single();

            if (error) {
                console.error(`Error inserting sos_evidence (${evidenceType}):`, error);
                return { data: evidencePayload, error };
            }
            return { data: data || evidencePayload, error: null };
        } catch (err) {
            console.error("Exception in createSosEvidenceRecord:", err);
            return { data: evidencePayload, error: err };
        }
    },

    /**
     * Updates an existing evidence record status
     */
    async updateEvidenceStatus(evidenceId, status, uploadedAt = null) {
        const client = window.supabaseClient;
        if (!client || !evidenceId) return;

        const updateData = { status };
        if (uploadedAt) updateData.uploaded_at = uploadedAt;
        else if (status === 'UPLOADED') updateData.uploaded_at = new Date().toISOString();

        try {
            await client.from('sos_evidence').update(updateData).eq('id', evidenceId);
        } catch (err) {
            console.error("Exception updating sos_evidence status:", err);
        }
    },

    /**
     * Fetches all evidence associated with an SOS ID
     */
    async fetchSosEvidence(sosId) {
        const client = window.supabaseClient;
        if (!client || !sosId) return [];

        try {
            const { data, error } = await client
                .from('sos_evidence')
                .select('*')
                .eq('sos_id', sosId);

            if (error) {
                console.error("Error fetching sos_evidence:", error);
                return [];
            }
            return data || [];
        } catch (err) {
            console.error("Exception in fetchSosEvidence:", err);
            return [];
        }
    },

    /**
     * Creates a signed URL for private storage bucket 'jagruthi-evidence'
     */
    async getSignedEvidenceUrl(storagePath, expiresIn = 3600) {
        const client = window.supabaseClient;
        if (!client || !storagePath) return null;

        try {
            const { data, error } = await client.storage
                .from('jagruthi-evidence')
                .createSignedUrl(storagePath, expiresIn);

            if (error) {
                console.error("Error creating signed URL for:", storagePath, error);
                return null;
            }
            return data?.signedUrl || null;
        } catch (err) {
            console.error("Exception in getSignedEvidenceUrl:", err);
            return null;
        }
    }
};

