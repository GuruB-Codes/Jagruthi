/**
 * Jagruthi Application Configuration
 */

const JagruthiConfig = Object.freeze({
    appName: 'Jagruthi',
    fullName: 'Jagruthi - Women Safety System',
    version: '3.2.0',
    defaultCenter: {
        lat: 13.0380,
        lng: 77.5120
    },
    emergencyHelplines: {
        police: '112',
        womenSafety: '1091',
        ambulance: '108',
        childHelpline: '1098'
    },
    evidenceBucket: 'jagruthi-evidence'
});

if (typeof window !== 'undefined') {
    window.JagruthiConfig = JagruthiConfig;
}

