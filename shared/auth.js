/**
 * Jagruthi Shared Authentication
 * Centralized session verification, role guarding, and logout handling.
 */

const JagruthiAuth = {
    getSession() {
        return {
            isLoggedIn: localStorage.getItem('isLoggedIn') === 'true',
            role: localStorage.getItem('userRole') || null,
            userId: localStorage.getItem('userId') || null,
            userName: localStorage.getItem('userName') || localStorage.getItem('fullName') || 'User',
            phone: localStorage.getItem('userPhone') || null
        };
    },

    requireRole(expectedRole, redirectTarget = '../../login.html') {
        const session = this.getSession();
        if (!session.isLoggedIn || session.role !== expectedRole) {
            window.location.href = redirectTarget;
            return false;
        }
        return true;
    },

    logout(redirectTarget = '../../login.html') {
        localStorage.clear();
        window.location.href = redirectTarget;
    }
};

if (typeof window !== 'undefined') {
    window.JagruthiAuth = JagruthiAuth;
}

