/**
 * Jagruthi AuthService
 * Handles login, registration, and user session against Supabase.
 */

const JagruthiAuthService = {
    async login({ phone, password, role }) {
        const client = window.supabaseClient;
        if (!client) throw new Error("Supabase client not initialized.");

        let query = client.from('users').select('*').eq('phone', phone);
        if (role === 'patrol') {
            query = query.in('role', ['patrol', 'police']);
        } else {
            query = query.eq('role', role);
        }

        const { data: users, error } = await query;
        const user = users && users.length > 0 ? users[0] : null;

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
        let checkQuery = client.from('users').select('phone').eq('phone', userPayload.phone);
        if (userPayload.role === 'patrol') {
            checkQuery = checkQuery.in('role', ['patrol', 'police']);
        } else {
            checkQuery = checkQuery.eq('role', userPayload.role);
        }
        const { data: existing } = await checkQuery;

        if (existing && existing.length > 0) {
            throw new Error("An account with this phone number already exists for this role.");
        }

        let insertPayload = { ...userPayload };
        let { data, error } = await client
            .from('users')
            .insert([insertPayload]);

        // Auto-fallback: If database constraint "users_role_check" rejects 'patrol', store as 'police'
        if (error && error.message && error.message.includes('users_role_check') && userPayload.role === 'patrol') {
            console.warn("[Auth] 'patrol' role rejected by database constraint, falling back to role 'police'");
            insertPayload.role = 'police';
            const retry = await client.from('users').insert([insertPayload]);
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;
        return data;
    }
};

if (typeof window !== 'undefined') {
    window.JagruthiAuthService = JagruthiAuthService;
}

