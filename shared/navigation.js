/**
 * Jagruthi Shared Navigation
 * Centralized routing and navigation resolution across roles.
 */

const JagruthiNavigation = {
    dashboardMap: {
        user: 'pages/user/index.html',
        emergency: 'pages/emergency/emergency.html',
        police: 'pages/police/police.html',
        patrol: 'pages/patrol/patrol.html',
        admin: 'pages/admin/admin.html'
    },

    getDashboardUrl(role, relativeDepth = 0) {
        const prefix = relativeDepth > 0 ? '../'.repeat(relativeDepth) : '';
        const target = this.dashboardMap[role] || 'login.html';
        return prefix + target;
    },

    navigateToRole(role, searchParams = '') {
        const url = (this.dashboardMap[role] || 'login.html') + (searchParams ? searchParams : '');
        window.location.href = url;
    },

    redirectToLogin(relativeDepth = 0) {
        const prefix = relativeDepth > 0 ? '../'.repeat(relativeDepth) : '';
        window.location.href = prefix + 'login.html';
    }
};

if (typeof window !== 'undefined') {
    window.JagruthiNavigation = JagruthiNavigation;
}

