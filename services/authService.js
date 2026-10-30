/**
 * Jagruthi AuthService
 * Handles login, registration, and user session against Supabase.
 */

const JagruthiAuthService = {
    async login({ phone, password, role }) {
        const client = window.supabaseClient;
        if (!client) throw new Error("Supabase client not initialized.");

        const { data: user, error } = await client
            .from('users')
            .select('*')
            .eq('phone', phone)
            .eq('role', role)
            .single();

        if (error || !user) {
            throw new Error(`No ${role} account found with this phone number.`);
        }

        if (user.password !== password) {
            throw new Error("Incorrect password. Please try again.");
        }

        return user;
    },

    async register(userPayload) {
        const client = window.supabaseClient;
        if (!client) throw new Error("Supabase client not initialized.");

        // Check for duplicate
        const { data: existing } = await client
            .from('users')
            .select('phone')
            .eq('phone', userPayload.phone)
            .eq('role', userPayload.role);

        if (existing && existing.length > 0) {
            throw new Error("An account with this phone number already exists for this role.");
        }

        const { data, error } = await client
            .from('users')
            .insert([userPayload]);

        if (error) throw error;
        return data;
    }
};

if (typeof window !== 'undefined') {
    window.JagruthiAuthService = JagruthiAuthService;
}

