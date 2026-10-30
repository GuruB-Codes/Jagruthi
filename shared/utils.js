/**
 * Jagruthi Shared Utilities
 * Universal calculation, formatting, and string helpers.
 */

const JagruthiUtils = {
    /**
     * Universal UUID Generator
     */
    generateUUID() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            try { return crypto.randomUUID(); } catch (e) {}
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Great-circle distance between two GPS coordinates (Haversine formula in km)
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return parseFloat((R * c).toFixed(2));
    },

    /**
     * Normalize and sanitize phone number for tel: links
     */
    sanitizePhone(phone) {
        if (!phone) return '';
        return String(phone).replace(/[^\d+]/g, '');
    },

    /**
     * Human-friendly time ago string
     */
    formatTimeAgo(isoString) {
        if (!isoString) return '--';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '--';
        const diffMs = Date.now() - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return `${Math.floor(diffHr / 24)}d ago`;
    }
};

if (typeof window !== 'undefined') {
    window.JagruthiUtils = JagruthiUtils;
}

