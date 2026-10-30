/**
 * Jagruthi LocationService
 * Browser Geolocation helpers & Supabase live telemetry streaming.
 */

const JagruthiLocationService = {
    getCurrentPosition(options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }) {
        return new Promise((resolve, reject) => {
            if (!('geolocation' in navigator)) {
                return reject(new Error("Geolocation is not supported by your browser."));
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    },

    watchPosition(onSuccess, onError, options = { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }) {
        if (!('geolocation' in navigator)) {
            if (onError) onError(new Error("Geolocation not supported."));
            return null;
        }
        return navigator.geolocation.watchPosition(onSuccess, onError, options);
    },

    clearWatch(watchId) {
        if (watchId !== null && 'geolocation' in navigator) {
            navigator.geolocation.clearWatch(watchId);
        }
    },

    async streamLocationToSupabase({ userId, alertId, latitude, longitude, speed = 0, heading = null, accuracy = 10, travelMode = 'Walking' }) {
        const client = window.supabaseClient;
        if (!client) return null;

        const payload = {
            user_id: userId,
            alert_id: alertId,
            latitude: typeof latitude === 'number' ? latitude : parseFloat(latitude),
            longitude: typeof longitude === 'number' ? longitude : parseFloat(longitude),
            speed: typeof speed === 'number' ? speed : parseFloat(speed) || 0,
            heading: heading !== null ? parseFloat(heading) : null,
            accuracy: accuracy ? parseFloat(accuracy) : 10,
            travel_mode: travelMode,
            created_at: new Date().toISOString()
        };

        try {
            const { data, error } = await client.from('live_locations').insert([payload]);
            if (error) console.warn("Notice streaming location:", error);
            return data;
        } catch (e) {
            console.warn("Exception streaming location:", e);
            return null;
        }
    }
};

if (typeof window !== 'undefined') {
    window.JagruthiLocationService = JagruthiLocationService;
}

