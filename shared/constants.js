/**
 * Jagruthi Shared Constants
 * Central definitions for roles, storage keys, statuses, and configurations.
 */

const JAGRUTHI_ROLES = Object.freeze({
    USER: 'user',
    EMERGENCY: 'emergency',
    POLICE: 'police',
    PATROL: 'patrol',
    ADMIN: 'admin'
});

const JAGRUTHI_STORAGE_KEYS = Object.freeze({
    IS_LOGGED_IN: 'isLoggedIn',
    USER_ROLE: 'userRole',
    USER_ID: 'userId',
    USER_NAME: 'userName',
    FULL_NAME: 'fullName',
    USER_PHONE: 'userPhone',
    USER_EMAIL: 'userEmail',
    USER_ADDRESS: 'userAddress',
    USER_MEDICAL: 'userMedical',
    POLICE_STATION: 'policeStation',
    OFFICER_ID: 'officerId',
    CONNECTED_WARD_NAME: 'connectedWardName',
    CONNECTED_WARD_PHONE: 'connectedWardPhone',
    SAFE_ROUTE_EMERGENCY: 'safeRouteEmergency',
    SAFE_ROUTE_LIVE_LOCATION: 'safeRouteLiveLocation',
    USER_EMERGENCY_CONTACTS: 'userEmergencyContacts',
    CAPTURED_EVIDENCE: 'jagruthiCapturedEvidence',
    PWA_DISMISSED: 'jagruthiPwaDismissed'
});

const JAGRUTHI_SOS_STATUS = Object.freeze({
    ACTIVE: 'active',
    RESOLVED: 'resolved'
});

const JAGRUTHI_DISPATCH_STATUS = Object.freeze({
    ASSIGNED: 'ASSIGNED',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    EN_ROUTE: 'EN_ROUTE',
    ARRIVED: 'ARRIVED',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED'
});

// Export to window for vanilla JS compatibility
if (typeof window !== 'undefined') {
    window.JAGRUTHI_ROLES = JAGRUTHI_ROLES;
    window.JAGRUTHI_STORAGE_KEYS = JAGRUTHI_STORAGE_KEYS;
    window.JAGRUTHI_SOS_STATUS = JAGRUTHI_SOS_STATUS;
    window.JAGRUTHI_DISPATCH_STATUS = JAGRUTHI_DISPATCH_STATUS;
}

