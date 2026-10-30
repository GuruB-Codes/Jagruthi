/**
 * Jagruthi NotificationService
 * Audio chimes, Web Notifications, and UI toasts.
 */

const JagruthiNotificationService = {
    async requestPermission() {
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            return await Notification.requestPermission();
        }
        return Notification.permission || 'denied';
    },

    showNotification(title, options = {}) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                return new Notification(title, {
                    icon: options.icon || './assets/icons/icon-192.png',
                    badge: options.badge || './assets/icons/icon-192.png',
                    body: options.body || '',
                    ...options
                });
            } catch (e) {
                console.warn("Desktop notification notice:", e);
            }
        }
        return null;
    },

    playAudio(audioElementOrUrl) {
        try {
            if (typeof audioElementOrUrl === 'string') {
                const audio = new Audio(audioElementOrUrl);
                return audio.play();
            } else if (audioElementOrUrl && typeof audioElementOrUrl.play === 'function') {
                return audioElementOrUrl.play();
            }
        } catch (e) {
            console.warn("Audio play blocked by browser policy:", e);
        }
    }
};

if (typeof window !== 'undefined') {
    window.JagruthiNotificationService = JagruthiNotificationService;
}

