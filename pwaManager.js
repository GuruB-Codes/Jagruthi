/* ===================================================
   JAGRUTHI PWA MANAGER
   Handles Service Worker Registration, Install Prompts,
   iOS Add-to-Home-Screen Guidance & App Shortcuts
   =================================================== */

(function () {
    'use strict';

    // 1. Dynamic Path Resolution for Service Worker
    const isSubDir = window.location.pathname.includes('/pages/');
    const rootPrefix = isSubDir ? '../../' : './';
    const swPath = rootPrefix + 'sw.js';

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register(swPath, { scope: rootPrefix })
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

    // 2. Standalone Mode Detection
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true ||
                         document.referrer.includes('android-app://');

    let deferredInstallPrompt = null;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // Listen for beforeinstallprompt event (Android / Chromium)
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent default mini-infobar on mobile Chrome
        e.preventDefault();
        deferredInstallPrompt = e;
        console.log('[PWA] beforeinstallprompt event captured');

        if (isStandalone) return;

        // If not dismissed recently (last 24 hours), show custom banner
        const dismissedAt = localStorage.getItem('jagruthiPwaDismissed');
        if (!dismissedAt || (Date.now() - parseInt(dismissedAt, 10) > 86400000)) {
            const banners = document.querySelectorAll('.pwa-install-banner, #pwaInstallBanner');
            banners.forEach(b => b.classList.remove('hidden'));
        }

        // Show header or inline download buttons
        const installBtns = document.querySelectorAll('.btn-pwa-install-trigger, .btn-pwa-header-download');
        installBtns.forEach(btn => btn.classList.remove('hidden'));
    });

    // App successfully installed
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] Jagruthi was installed successfully.');
        deferredInstallPrompt = null;
        document.querySelectorAll('.pwa-install-banner, #pwaInstallBanner').forEach(b => b.classList.add('hidden'));
        document.querySelectorAll('.btn-pwa-install-trigger, .btn-pwa-header-download').forEach(b => b.classList.add('hidden'));
        if (window.showNotification) {
            window.showNotification('App Installed', 'Jagruthi is now installed on your home screen!');
        }
    });

    // 3. Trigger Install or Guidance
    async function triggerPwaInstall() {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            console.log('[PWA] User response to install prompt:', outcome);
            deferredInstallPrompt = null;
            document.querySelectorAll('.pwa-install-banner, #pwaInstallBanner').forEach(b => b.classList.add('hidden'));
        } else if (isIos && !isStandalone) {
            showPwaGuidanceModal('ios');
        } else {
            showPwaGuidanceModal('generic');
        }
    }
    window.triggerPwaInstall = triggerPwaInstall;

    // 4. Modal Guidance Generator (for iOS Safari or non-auto-prompting browsers)
    function showPwaGuidanceModal(platform) {
        let modalOverlay = document.getElementById('pwaGuidanceOverlay');
        if (!modalOverlay) {
            modalOverlay = document.createElement('div');
            modalOverlay.id = 'pwaGuidanceOverlay';
            modalOverlay.className = 'pwa-guidance-overlay';

            const iconSrc = rootPrefix + 'assets/icons/icon-192.png';

            modalOverlay.innerHTML = `
                <div class="pwa-guidance-sheet" id="pwaGuidanceSheet">
                    <div class="pwa-sheet-handle"></div>
                    <div class="pwa-sheet-header">
                        <img src="${iconSrc}" alt="Jagruthi" class="pwa-sheet-icon">
                        <div class="pwa-sheet-header-text">
                            <h3 class="pwa-sheet-title">Download Jagruthi App</h3>
                            <p class="pwa-sheet-sub">Install on your phone for quick SOS, offline safety & instant response</p>
                        </div>
                        <button type="button" class="pwa-sheet-close" id="btnClosePwaGuidance" aria-label="Close">&times;</button>
                    </div>
                    <div class="pwa-steps-list" id="pwaModalStepsContent">
                        <!-- Dynamic steps content -->
                    </div>
                    <div class="pwa-sheet-footer">
                        <button type="button" class="btn-pwa-got-it" id="btnPwaGotIt">Got It</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalOverlay);

            // Bind close handlers
            const closeBtn = modalOverlay.querySelector('#btnClosePwaGuidance');
            const gotItBtn = modalOverlay.querySelector('#btnPwaGotIt');
            if (closeBtn) closeBtn.addEventListener('click', () => modalOverlay.classList.remove('active'));
            if (gotItBtn) gotItBtn.addEventListener('click', () => modalOverlay.classList.remove('active'));
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) modalOverlay.classList.remove('active');
            });
        }

        const stepsContent = modalOverlay.querySelector('#pwaModalStepsContent');
        if (stepsContent) {
            if (platform === 'ios') {
                stepsContent.innerHTML = `
                    <div class="pwa-step-item">
                        <div class="pwa-step-num">1</div>
                        <div class="pwa-step-desc">
                            <span>Tap the <strong>Share</strong> button at the bottom of Safari:</span>
                            <div class="pwa-step-badge">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                                    <polyline points="16 6 12 2 8 6"></polyline>
                                    <line x1="12" y1="2" x2="12" y2="15"></line>
                                </svg>
                                <span>Share icon</span>
                            </div>
                        </div>
                    </div>
                    <div class="pwa-step-item">
                        <div class="pwa-step-num">2</div>
                        <div class="pwa-step-desc">
                            <span>Scroll down and select <strong>Add to Home Screen</strong>:</span>
                            <div class="pwa-step-badge">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="12" y1="8" x2="12" y2="16"></line>
                                    <line x1="8" y1="12" x2="16" y2="12"></line>
                                </svg>
                                <span>Add to Home Screen</span>
                            </div>
                        </div>
                    </div>
                    <div class="pwa-step-item">
                        <div class="pwa-step-num">3</div>
                        <div class="pwa-step-desc">
                            <span>Tap <strong>Add</strong> in the top-right corner. Jagruthi will be installed on your home screen!</span>
                        </div>
                    </div>
                `;
            } else {
                stepsContent.innerHTML = `
                    <div class="pwa-step-item">
                        <div class="pwa-step-num">1</div>
                        <div class="pwa-step-desc">
                            <span>Tap your browser menu (<strong>⋮</strong> three dots in top-right or bottom-right):</span>
                        </div>
                    </div>
                    <div class="pwa-step-item">
                        <div class="pwa-step-num">2</div>
                        <div class="pwa-step-desc">
                            <span>Select <strong>Install app</strong> or <strong>Add to Home screen</strong>:</span>
                            <div class="pwa-step-badge">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                                <span>Install / Add</span>
                            </div>
                        </div>
                    </div>
                    <div class="pwa-step-item">
                        <div class="pwa-step-num">3</div>
                        <div class="pwa-step-desc">
                            <span>Confirm installation. Jagruthi will open as a full standalone native app!</span>
                        </div>
                    </div>
                `;
            }
        }

        modalOverlay.classList.add('active');
    }

    // 5. DOM Initialization & Button Listeners
    document.addEventListener('DOMContentLoaded', () => {
        if (isStandalone) {
            // Already installed and open as PWA
            document.querySelectorAll('.pwa-install-banner, #pwaInstallBanner').forEach(b => b.classList.add('hidden'));
            document.querySelectorAll('.btn-pwa-install-trigger, .btn-pwa-header-download').forEach(b => b.classList.add('hidden'));
            return;
        }

        // Bind all install trigger buttons
        const installBtns = document.querySelectorAll('.btn-pwa-install, #btnPwaInstall, .btn-pwa-install-trigger, .btn-pwa-header-download, [data-action="pwa-install"]');
        installBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                triggerPwaInstall();
            });
        });

        // Dismiss Banner
        const dismissBtns = document.querySelectorAll('.btn-pwa-dismiss, #btnPwaDismiss');
        dismissBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pwa-install-banner, #pwaInstallBanner').forEach(b => b.classList.add('hidden'));
                localStorage.setItem('jagruthiPwaDismissed', Date.now().toString());
            });
        });

        // If on iOS and not standalone, show banner on first visit
        if (isIos && !isStandalone) {
            const dismissedAt = localStorage.getItem('jagruthiPwaDismissed');
            if (!dismissedAt || (Date.now() - parseInt(dismissedAt, 10) > 86400000)) {
                const banners = document.querySelectorAll('.pwa-install-banner, #pwaInstallBanner');
                banners.forEach(b => b.classList.remove('hidden'));
            }
        }

        // 6. Handle PWA App Shortcuts via URL Parameters
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
