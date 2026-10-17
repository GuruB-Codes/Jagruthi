/* ===================================================
   JAGRUTHI PWA MANAGER
   Handles Service Worker Registration, Install Prompts,
   iOS Add-to-Home-Screen Guidance & App Shortcuts
   =================================================== */

(function () {
    'use strict';

    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then((registration) => {
                    console.log('[PWA] Service Worker registered with scope:', registration.scope);

                    // Check for service worker updates
                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (installingWorker) {
                            installingWorker.onstatechange = () => {
                                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('[PWA] New version available! Reloading...');
                                }
                            };
                        }
                    };
                })
                .catch((error) => {
                    console.warn('[PWA] Service Worker registration failed:', error);
                });
        });
    }

    // 2. Install Prompt Handling
    let deferredInstallPrompt = null;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent default mini-infobar on mobile Chrome
        e.preventDefault();
        deferredInstallPrompt = e;

        // If already in standalone mode or dismissed recently (last 24 hours), don't show custom banner
        const dismissedAt = localStorage.getItem('jagruthiPwaDismissed');
        if (isStandalone || (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 86400000)) {
            return;
        }

        const banner = document.getElementById('pwaInstallBanner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    });

    window.addEventListener('appinstalled', () => {
        console.log('[PWA] Jagruthi was installed successfully.');
        deferredInstallPrompt = null;
        const banner = document.getElementById('pwaInstallBanner');
        if (banner) banner.classList.add('hidden');
    });

    // 3. UI Button Bindings once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        const btnInstall = document.getElementById('btnPwaInstall');
        const btnDismiss = document.getElementById('btnPwaDismiss');
        const banner = document.getElementById('pwaInstallBanner');

        // Check if iOS device
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (btnInstall) {
            btnInstall.addEventListener('click', async () => {
                if (deferredInstallPrompt) {
                    deferredInstallPrompt.prompt();
                    const { outcome } = await deferredInstallPrompt.userChoice;
                    console.log('[PWA] User response to install prompt:', outcome);
                    deferredInstallPrompt = null;
                    if (banner) banner.classList.add('hidden');
                } else if (isIos && !isStandalone) {
                    // Show iOS install instructions
                    alert("To download Jagruthi on iPhone:\n\n1. Tap the Share button in Safari (box with arrow pointing up)\n2. Scroll down and tap 'Add to Home Screen'\n3. Tap 'Add' in the top right corner.");
                } else {
                    alert("To download: tap your browser menu (⋮ or Share) and select 'Install app' or 'Add to Home Screen'.");
                }
            });
        }

        if (btnDismiss) {
            btnDismiss.addEventListener('click', () => {
                if (banner) banner.classList.add('hidden');
                localStorage.setItem('jagruthiPwaDismissed', Date.now().toString());
            });
        }

        // Show iOS specific prompt if opened in mobile Safari browser not yet added to home
        if (isIos && !isStandalone) {
            const dismissedAt = localStorage.getItem('jagruthiPwaDismissed');
            if (!dismissedAt || Date.now() - parseInt(dismissedAt, 10) > 86400000) {
                if (banner) banner.classList.remove('hidden');
            }
        }

        // 4. Handle PWA App Shortcuts via URL Parameters
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');

        if (action) {
            setTimeout(() => {
                if (action === 'sos') {
                    const sosBtn = document.getElementById('mainCentralSosBtn');
                    if (sosBtn) sosBtn.click();
                } else if (action === 'evidence') {
                    const evdBtn = document.getElementById('btnGridEvidence');
                    if (evdBtn) evdBtn.click();
                } else if (action === 'journey') {
                    const journeyTab = document.getElementById('navTabJourney');
                    if (journeyTab) journeyTab.click();
                }
            }, 600);
        }
    });
})();
