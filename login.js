document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       1. ELEMENT REFERENCES
       ========================================= */
    const roleSelectScreen = document.getElementById('roleSelectScreen');
    const userOnboardingScreen = document.getElementById('userOnboardingScreen');
    const parentOnboardingScreen = document.getElementById('parentOnboardingScreen');
    const authScreen = document.getElementById('authScreen');
    const btnBackToRoles = document.getElementById('btnBackToRoles');
    const btnBackFromOnboarding = document.getElementById('btnBackFromOnboarding');
    const btnBackFromParentOnboarding = document.getElementById('btnBackFromParentOnboarding');

    const authRoleAvatar = document.getElementById('authRoleAvatar');
    const heroAvatarIcon = document.getElementById('heroAvatarIcon');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const authBottomIllustration = document.getElementById('authBottomIllustration');
    const activeRoleChip = document.getElementById('activeRoleChip');
    const roleChipText = document.getElementById('roleChipText');

    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const tabIndicator = document.getElementById('tabIndicator');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const messageBox = document.getElementById('messageBox');
    const messageText = document.getElementById('messageText');

    // Validation & Meter elements
    const loginPhone = document.getElementById('loginPhone');
    const loginPhoneValid = document.getElementById('loginPhoneValid');
    const regEmail = document.getElementById('regEmail');
    const regEmailValid = document.getElementById('regEmailValid');
    const regPhone = document.getElementById('regPhone');
    const regPhoneValid = document.getElementById('regPhoneValid');
    const regPassword = document.getElementById('regPassword');
    const regConfirmPassword = document.getElementById('regConfirmPassword');
    const passMeterWrap = document.getElementById('passMeterWrap');
    const passMeterLabel = document.getElementById('passMeterLabel');
    const passMatchWrap = document.getElementById('passMatchWrap');
    const passMatchIcon = document.getElementById('passMatchIcon');
    const passMatchLabel = document.getElementById('passMatchLabel');

    const roleCards = document.querySelectorAll('.role-card');
    let selectedRole = 'user'; // Default role
    let currentAuthMode = 'login'; // 'login' or 'register'

    // Role Metadata for UI Presentation & Exact Bottom Illustrations (Matches User Mockup Spec)
    const roleMeta = {
        user: {
            themeClass: 'theme-women',
            name: 'Women',
            loginTitle: 'Women Login',
            loginSubtitle: 'Stay Safe, Stay Empowered',
            regTitle: 'Women Registration',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
            // 1. Women / Girl Portrait Line Sketch (Matches media_1793454812115_7b2a403b.png)
            illustrationSvg: `<svg viewBox="0 0 100 82" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M 28 50 C 27 30 36 12 50 12 C 64 12 73 30 72 50 C 71 60 74 68 76 76" />
                <path d="M 28 50 C 29 60 26 68 24 76" />
                <path d="M 50 20 C 45 24 40 30 39 44 C 38 54 42 63 43 72" />
                <path d="M 50 20 C 55 24 60 30 61 44 C 62 54 58 63 57 72" />
                <path d="M 40 37 C 40 46 45 53 50 53 C 55 53 60 46 60 37" />
                <path d="M 43.5 40.5 Q 46 39 48.5 40.5" stroke-width="1.8" />
                <path d="M 51.5 40.5 Q 54 39 56.5 40.5" stroke-width="1.8" />
                <path d="M 50 43.5 L 50 46 L 51 46" stroke-width="1.5" />
                <path d="M 47 49 Q 50 51.5 53 49" stroke-width="1.8" />
                <path d="M 47 53 L 47 60 C 41 63 32 67 21 74" />
                <path d="M 53 53 L 53 60 C 59 63 68 67 79 74" />
            </svg>`
        },
        emergency: {
            themeClass: 'theme-emergency',
            name: 'Parent / Emergency Contact',
            loginTitle: 'Parent / Emergency Login',
            loginSubtitle: 'Stay Connected, Stay Informed',
            regTitle: 'Parent Registration',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
            // 2. Child, Parent Silhouette & Heart (Matches media_1793454826650_c2ad0585.png)
            illustrationSvg: `<svg viewBox="0 0 100 82" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="34" cy="33" r="7.5" />
                <path d="M 26 68 C 26 49 42 49 42 68" />
                <circle cx="58" cy="22" r="10" />
                <path d="M 45 68 C 45 37 72 37 72 68" />
                <path d="M 71 50 C 68 44 61 44 61 51 C 61 58 66 63 71 68 C 76 63 81 58 81 51 C 81 44 74 44 71 50 Z" />
            </svg>`
        },
        police: {
            themeClass: 'theme-police',
            name: 'Police',
            loginTitle: 'Police Login',
            loginSubtitle: 'Respond Faster, Protect Better',
            regTitle: 'Police Registration',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 3v6c0 5.25-3.5 10-7 11-3.5-1-7-5.75-7-11V5l7-3z"></path><circle cx="12" cy="11" r="2.5"></circle></svg>`,
            // 3. Police Cruiser with T-Beacon & Star Emblem (Matches media_1793454838988_1200cb5c.png)
            illustrationSvg: `<svg viewBox="0 0 100 82" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="38" y1="27" x2="38" y2="33" />
                <line x1="32" y1="27" x2="44" y2="27" />
                <path d="M 15 55 L 18 55 C 17 50 17 48 20 48 L 31 48 C 33 44 36 37 40 33 L 62 33 C 66 38 69 44 72 48 L 82 48 C 85 48 85 51 85 55 L 88 55" />
                <line x1="35.5" y1="57" x2="60.5" y2="57" />
                <circle cx="28" cy="57" r="7.5" />
                <circle cx="28" cy="57" r="3.2" fill="currentColor" />
                <circle cx="68" cy="57" r="7.5" />
                <circle cx="68" cy="57" r="3.2" fill="currentColor" />
                <path d="M 40.5 36 L 47.5 36 L 47.5 45.5 L 34 45.5 Z" stroke-width="1.6" />
                <path d="M 50.5 36 L 59.5 36 L 68 45.5 L 50.5 45.5 Z" stroke-width="1.6" />
                <path d="M 46 48 L 47.3 50.8 L 50.4 51.1 L 48 53.2 L 48.7 56.2 L 46 54.6 L 43.3 56.2 L 44 53.2 L 41.6 51.1 L 44.7 50.8 Z" stroke-width="1.3" />
            </svg>`
        },
        admin: {
            themeClass: 'theme-admin',
            name: 'Admin',
            loginTitle: 'Admin Login',
            loginSubtitle: 'Manage, Monitor, Ensure Safety',
            regTitle: 'Admin Registration',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
            // 4. Desktop Monitor with 5 Bars & Ascending Trendline (Matches media_1793454812115_7b2a403b.png)
            illustrationSvg: `<svg viewBox="0 0 100 82" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="23" y="16" width="54" height="40" rx="3.5" />
                <path d="M 45 56 L 43 67 L 57 67 L 55 56" stroke-width="1.8" />
                <line x1="36" y1="67" x2="64" y2="67" stroke-width="2.4" />
                <circle cx="50" cy="53" r="0.9" fill="currentColor" />
                <rect x="28" y="38" width="4.5" height="12" rx="1" stroke-width="1.4" />
                <rect x="35.5" y="31" width="4.5" height="19" rx="1" stroke-width="1.4" />
                <rect x="43" y="24" width="4.5" height="26" rx="1" stroke-width="1.4" />
                <rect x="50.5" y="33" width="4.5" height="17" rx="1" stroke-width="1.4" />
                <rect x="58" y="22" width="4.5" height="28" rx="1" stroke-width="1.4" />
                <path d="M 28 41 L 37.5 33 L 45 25 L 52.5 35 L 60.5 21" stroke-width="2" />
                <circle cx="60.5" cy="21" r="1.8" fill="currentColor" />
            </svg>`
        },
        patrol: {
            themeClass: 'theme-patrol',
            name: 'Patrol',
            loginTitle: 'Patrol Login',
            loginSubtitle: 'On-Ground Assistance',
            regTitle: 'Patrol Registration',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="10" width="20" height="9" rx="2"></rect><path d="M5 10l2-5h10l2 5"></path><circle cx="7" cy="15" r="2"></circle><circle cx="17" cy="15" r="2"></circle><line x1="12" y1="2" x2="12" y2="5"></line></svg>`,
            // 5. Patrol Vehicle on Continuous Winding Road (Matches media_1793454812115_7b2a403b.png)
            illustrationSvg: `<svg viewBox="0 0 100 82" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="38" y1="27" x2="38" y2="33" />
                <line x1="32" y1="27" x2="44" y2="27" />
                <path d="M 15 55 L 18 55 C 17 50 17 48 20 48 L 31 48 C 33 44 36 37 40 33 L 62 33 C 66 38 69 44 72 48 L 82 48 C 85 48 85 51 85 55 L 88 55" />
                <line x1="35.5" y1="57" x2="60.5" y2="57" />
                <circle cx="28" cy="57" r="7.5" />
                <circle cx="28" cy="57" r="3.2" fill="currentColor" />
                <circle cx="68" cy="57" r="7.5" />
                <circle cx="68" cy="57" r="3.2" fill="currentColor" />
                <path d="M 40.5 36 L 47.5 36 L 47.5 45.5 L 34 45.5 Z" stroke-width="1.6" />
                <path d="M 50.5 36 L 59.5 36 L 68 45.5 L 50.5 45.5 Z" stroke-width="1.6" />
                <path d="M 46 48 L 47.3 50.8 L 50.4 51.1 L 48 53.2 L 48.7 56.2 L 46 54.6 L 43.3 56.2 L 44 53.2 L 41.6 51.1 L 44.7 50.8 Z" stroke-width="1.3" />
                <path d="M 4 64 L 68 64 C 82 64 91 60 96 48 C 99 40 100 32 101 24" />
                <path d="M 90 56 C 94 47 96 38 98 28" stroke-width="1.4" stroke-dasharray="3 3" opacity="0.6" />
            </svg>`
        }
    };

    // Role-specific field containers
    const roleFieldMap = {
        user: document.getElementById('fieldsUser'),
        emergency: document.getElementById('fieldsEmergency'),
        police: document.getElementById('fieldsPolice'),
        admin: document.getElementById('fieldsAdmin'),
        patrol: document.getElementById('fieldsPatrol')
    };

    // Dashboard redirect map
    const dashboardMap = {
        user: 'pages/user/index.html',
        emergency: 'pages/emergency/emergency.html',
        police: 'pages/police/police.html',
        patrol: 'pages/patrol/patrol.html',
        admin: 'pages/admin/admin.html'
    };

    /* =========================================
       2. ROLE SELECTION & NAVIGATION
       ========================================= */
    roleCards.forEach(card => {
        card.addEventListener('click', () => {
            const role = card.dataset.role;
            if (!role || !roleMeta[role]) return;

            selectedRole = role;

            // Highlight selected in list
            roleCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            // Configure Auth Screen for Selected Role
            applyRoleTheme(selectedRole);

            if (role === 'user') {
                // Show Onboarding Screen for User (Women) Role
                showOnboardingScreen();
            } else if (role === 'emergency') {
                // Show Onboarding Screen for Parent / Emergency Role
                showParentOnboardingScreen();
            } else {
                // Other roles go directly to Auth Screen
                switchTab('login');
                if (roleSelectScreen && authScreen) {
                    roleSelectScreen.classList.add('hidden');
                    if (userOnboardingScreen) userOnboardingScreen.classList.add('hidden');
                    if (parentOnboardingScreen) parentOnboardingScreen.classList.add('hidden');
                    authScreen.classList.remove('hidden', 'screen-slide-left');
                    authScreen.classList.add('screen-slide-right');
                }
            }
        });
    });

    // Initialize Default Role Theme immediately on DOM ready
    applyRoleTheme(selectedRole);

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    function showOnboardingScreen() {
        if (!userOnboardingScreen || !roleSelectScreen) return;
        roleSelectScreen.classList.add('hidden');
        if (parentOnboardingScreen) parentOnboardingScreen.classList.add('hidden');
        if (authScreen) authScreen.classList.add('hidden');
        userOnboardingScreen.classList.remove('hidden', 'screen-slide-left');
        userOnboardingScreen.classList.add('screen-slide-right');

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        window.setSlide(0);
        startAutoSlide();
    }

    function showParentOnboardingScreen() {
        if (!parentOnboardingScreen || !roleSelectScreen) return;
        roleSelectScreen.classList.add('hidden');
        if (userOnboardingScreen) userOnboardingScreen.classList.add('hidden');
        if (authScreen) authScreen.classList.add('hidden');
        parentOnboardingScreen.classList.remove('hidden', 'screen-slide-left');
        parentOnboardingScreen.classList.add('screen-slide-right');
    }

    // Back Button from User Onboarding Screen to Role Picker
    if (btnBackFromOnboarding) {
        btnBackFromOnboarding.addEventListener('click', () => {
            pauseTimer();
            if (userOnboardingScreen && roleSelectScreen) {
                userOnboardingScreen.classList.add('hidden');
                roleSelectScreen.classList.remove('hidden', 'screen-slide-right');
                roleSelectScreen.classList.add('screen-slide-left');
            }
        });
    }

    // Back Button from Parent Onboarding Screen to Role Picker
    if (btnBackFromParentOnboarding) {
        btnBackFromParentOnboarding.addEventListener('click', () => {
            if (parentOnboardingScreen && roleSelectScreen) {
                parentOnboardingScreen.classList.add('hidden');
                roleSelectScreen.classList.remove('hidden', 'screen-slide-right');
                roleSelectScreen.classList.add('screen-slide-left');
            }
        });
    }

    /* =========================================
       2.1 PARENT ONBOARDING ACTIONS
       ========================================= */
    window.onGetStarted = function() {
        if (window.showNotification) {
            window.showNotification("Parent Dashboard", "Opening login portal...");
        }
        setTimeout(() => {
            if (parentOnboardingScreen && authScreen) {
                parentOnboardingScreen.classList.add('hidden');
                authScreen.classList.remove('hidden', 'screen-slide-left');
                authScreen.classList.add('screen-slide-right');
                switchTab('login');
            }
        }, 250);
    };

    window.onSignIn = window.onGetStarted;

    window.onFeature = function(label) {
        console.log(`Action requested: ${label}`);
        if (window.showNotification) {
            window.showNotification(label, `Active safety feature: ${label}`);
        }
    };

    window.onParentGetStarted = window.onGetStarted;
    window.onParentFeature = window.onFeature;

    /* =========================================
       2.1 ONBOARDING CAROUSEL SLIDER & ACTIONS
       ========================================= */
    let currentSlide = 0;
    const totalSlides = 3;
    let autoSlideTimer = null;

    window.setSlide = function(index) {
        currentSlide = index;

        for (let i = 0; i < totalSlides; i++) {
            const slideEl = document.getElementById(`slide-${i}`);
            const dotEl = document.getElementById(`dot-${i}`);
            if (!slideEl || !dotEl) continue;

            if (i === index) {
                slideEl.classList.remove('hidden');
                setTimeout(() => {
                    slideEl.classList.remove('opacity-0');
                    slideEl.classList.add('opacity-100');
                }, 20);
                dotEl.className = "h-2 w-6 rounded-full bg-[#af1352] transition-all duration-300 focus:outline-none shadow-xs";
            } else {
                slideEl.classList.add('opacity-0');
                slideEl.classList.remove('opacity-100');
                slideEl.classList.add('hidden');
                dotEl.className = "h-2 w-2 rounded-full bg-[#f3a6c4] hover:bg-[#eb719f] transition-all duration-300 focus:outline-none";
            }
        }
    };

    function startAutoSlide() {
        if (autoSlideTimer) clearInterval(autoSlideTimer);
        autoSlideTimer = setInterval(() => {
            let next = (currentSlide + 1) % totalSlides;
            window.setSlide(next);
        }, 5500);
    }

    function pauseTimer() {
        if (autoSlideTimer) clearInterval(autoSlideTimer);
    }
    window.pauseTimer = pauseTimer;

    window.showNotification = function(title, message) {
        const toast = document.getElementById('toastNotice');
        if (!toast) return;
        const tTitle = document.getElementById('toastTitle');
        const tMsg = document.getElementById('toastMessage');
        if (tTitle) tTitle.innerText = title;
        if (tMsg) tMsg.innerText = message;

        toast.classList.remove('-translate-y-24', 'opacity-0', 'pointer-events-none');
        toast.classList.add('translate-y-0', 'opacity-100');

        setTimeout(() => {
            toast.classList.add('-translate-y-24', 'opacity-0', 'pointer-events-none');
            toast.classList.remove('translate-y-0', 'opacity-100');
        }, 2600);
    };

    window.handleGetStarted = function() {
        pauseTimer();
        window.showNotification("Welcome to Jagruthi", "Opening login portal...");
        setTimeout(() => {
            if (userOnboardingScreen && authScreen) {
                userOnboardingScreen.classList.add('hidden');
                authScreen.classList.remove('hidden', 'screen-slide-left');
                authScreen.classList.add('screen-slide-right');
                switchTab('login');
            }
        }, 250);
    };

    window.handleSignIn = window.handleGetStarted;

    function applyRoleTheme(role) {
        const meta = roleMeta[role];
        if (!meta || !authScreen) return;

        // Reset theme classes on auth screen
        authScreen.classList.remove('theme-women', 'theme-emergency', 'theme-police', 'theme-admin', 'theme-patrol');
        authScreen.classList.add(meta.themeClass);

        // Update Avatar Icon
        if (heroAvatarIcon) {
            heroAvatarIcon.innerHTML = meta.svg;
        }

        // Update Bottom Thematic Line-Art Illustration (Centered Below Form, Matches Mockup)
        if (authBottomIllustration && meta.illustrationSvg) {
            authBottomIllustration.innerHTML = meta.illustrationSvg;
        }

        // Update Top Active Role Chip
        if (roleChipText) {
            roleChipText.innerText = meta.name;
        }

        // Update Header Text based on current auth mode
        updateAuthHeader(currentAuthMode);

        // Toggle dynamic register fields
        Object.values(roleFieldMap).forEach(el => {
            if (el) el.classList.add('hidden');
        });
        if (roleFieldMap[role]) {
            roleFieldMap[role].classList.remove('hidden');
        }
    }

    function updateAuthHeader(mode) {
        const meta = roleMeta[selectedRole];
        if (!meta) return;

        if (mode === 'login') {
            if (authTitle) authTitle.innerText = meta.loginTitle;
            if (authSubtitle) authSubtitle.innerText = meta.loginSubtitle;
        } else {
            if (authTitle) authTitle.innerText = meta.regTitle;
            if (authSubtitle) authSubtitle.innerText = 'Create your account';
        }
    }

    // Back Button Handler: Return to Choose Your Role or Onboarding
    if (btnBackToRoles) {
        btnBackToRoles.addEventListener('click', () => {
            hideMessage();
            if (currentAuthMode === 'register') {
                // If on register, return to login first
                switchTab('login');
            } else {
                if (selectedRole === 'user' && userOnboardingScreen) {
                    // Return to User Onboarding Screen
                    authScreen.classList.add('hidden');
                    userOnboardingScreen.classList.remove('hidden', 'screen-slide-right');
                    userOnboardingScreen.classList.add('screen-slide-left');
                    startAutoSlide();
                } else if (selectedRole === 'emergency' && parentOnboardingScreen) {
                    // Return to Parent Onboarding Screen
                    authScreen.classList.add('hidden');
                    parentOnboardingScreen.classList.remove('hidden', 'screen-slide-right');
                    parentOnboardingScreen.classList.add('screen-slide-left');
                } else {
                    // Return to Role Selection Screen
                    if (authScreen && roleSelectScreen) {
                        authScreen.classList.add('hidden');
                        roleSelectScreen.classList.remove('hidden', 'screen-slide-right');
                        roleSelectScreen.classList.add('screen-slide-left');
                    }
                }
            }
        });
    }

    // Role Chip Click: Quick Return to Role Picker
    if (activeRoleChip) {
        activeRoleChip.addEventListener('click', () => {
            hideMessage();
            pauseTimer();
            if (authScreen && roleSelectScreen) {
                authScreen.classList.add('hidden');
                if (userOnboardingScreen) userOnboardingScreen.classList.add('hidden');
                if (parentOnboardingScreen) parentOnboardingScreen.classList.add('hidden');
                roleSelectScreen.classList.remove('hidden', 'screen-slide-right');
                roleSelectScreen.classList.add('screen-slide-left');
            }
        });
    }

    /* =========================================
       3. TAB SWITCHING (LOGIN / REGISTER)
       ========================================= */
    const linkToRegister = document.getElementById('linkToRegister');
    const linkToLogin = document.getElementById('linkToLogin');

    if (tabLogin) tabLogin.addEventListener('click', () => switchTab('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => switchTab('register'));

    if (linkToRegister) {
        linkToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('register');
        });
    }

    if (linkToLogin) {
        linkToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab('login');
        });
    }

    function switchTab(tab) {
        hideMessage();
        currentAuthMode = tab;

        if (tab === 'login') {
            if (tabLogin) tabLogin.classList.add('active');
            if (tabRegister) tabRegister.classList.remove('active');
            if (tabIndicator) tabIndicator.classList.remove('right');
            if (loginForm) {
                loginForm.classList.remove('hidden');
                loginForm.classList.remove('form-stagger');
                void loginForm.offsetWidth;
                loginForm.classList.add('form-stagger');
            }
            if (registerForm) registerForm.classList.add('hidden');
        } else {
            if (tabLogin) tabLogin.classList.remove('active');
            if (tabRegister) tabRegister.classList.add('active');
            if (tabIndicator) tabIndicator.classList.add('right');
            if (loginForm) loginForm.classList.add('hidden');
            if (registerForm) {
                registerForm.classList.remove('hidden');
                registerForm.classList.remove('form-stagger');
                void registerForm.offsetWidth;
                registerForm.classList.add('form-stagger');
            }
        }

        updateAuthHeader(tab);
    }

    /* =========================================
       4. PASSWORD TOGGLE
       ========================================= */
    setupPasswordToggle('toggleLoginPass', 'loginPassword');
    setupPasswordToggle('toggleRegPass', 'regPassword');

    function setupPasswordToggle(btnId, inputId) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (!btn || !input) return;

        btn.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = isPassword ? 'las la-eye-slash' : 'las la-eye';
            }
        });
    }

    /* =========================================
       5. MESSAGE DISPLAY
       ========================================= */
    function showMessage(text, type = 'error') {
        if (!messageBox || !messageText) return;
        messageBox.classList.remove('hidden', 'error', 'success');
        messageBox.classList.add(type);
        const icon = messageBox.querySelector('i');
        if (icon) {
            icon.className = type === 'error' ? 'las la-exclamation-circle' : 'las la-check-circle';
        }
        messageText.innerText = text;
        messageBox.style.animation = 'none';
        messageBox.offsetHeight; // force reflow
        messageBox.style.animation = '';
    }

    function hideMessage() {
        if (messageBox) messageBox.classList.add('hidden');
    }

    /* =========================================
       6. INTERACTIVE REAL-TIME VALIDATION & FEEDBACK
       ========================================= */
    // Real-time phone / email validation on Login Form
    if (loginPhone) {
        loginPhone.addEventListener('input', () => {
            const val = loginPhone.value.trim();
            const isValid = val.length >= 10 || (val.includes('@') && val.includes('.'));
            if (loginPhoneValid) {
                loginPhoneValid.classList.toggle('visible', isValid);
            }
        });
    }

    // Real-time email validation on Register Form
    if (regEmail) {
        regEmail.addEventListener('input', () => {
            const val = regEmail.value.trim();
            const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
            if (regEmailValid) {
                regEmailValid.classList.toggle('visible', isValid);
            }
        });
    }

    // Real-time phone validation on Register Form
    if (regPhone) {
        regPhone.addEventListener('input', () => {
            const val = regPhone.value.trim();
            const isValid = val.length >= 10;
            if (regPhoneValid) {
                regPhoneValid.classList.toggle('visible', isValid);
            }
        });
    }

    // Interactive Password Strength Meter on Register Form
    if (regPassword) {
        regPassword.addEventListener('input', () => {
            const val = regPassword.value;
            if (!val) {
                if (passMeterWrap) passMeterWrap.classList.add('hidden');
                checkPasswordMatch();
                return;
            }
            if (passMeterWrap) passMeterWrap.classList.remove('hidden');

            let strength = 'weak';
            let label = 'Weak password';

            const hasUpper = /[A-Z]/.test(val);
            const hasNum = /[0-9]/.test(val);
            const hasSpecial = /[^A-Za-z0-9]/.test(val);

            if (val.length >= 8 && ((hasUpper && hasNum) || (hasNum && hasSpecial) || (hasUpper && hasSpecial))) {
                strength = 'strong';
                label = 'Strong password';
            } else if (val.length >= 6 && (hasUpper || hasNum || hasSpecial)) {
                strength = 'fair';
                label = 'Fair password';
            }

            if (passMeterWrap) {
                passMeterWrap.className = `pass-meter-wrap pass-meter-${strength}`;
            }
            if (passMeterLabel) {
                passMeterLabel.innerText = label;
            }
            checkPasswordMatch();
        });
    }

    // Interactive Password Match Status
    if (regConfirmPassword) {
        regConfirmPassword.addEventListener('input', checkPasswordMatch);
    }

    function checkPasswordMatch() {
        const p1 = regPassword ? regPassword.value : '';
        const p2 = regConfirmPassword ? regConfirmPassword.value : '';
        if (!p2) {
            if (passMatchWrap) passMatchWrap.classList.add('hidden');
            return;
        }
        if (passMatchWrap) passMatchWrap.classList.remove('hidden');

        const matches = p1 === p2;
        if (passMatchWrap) {
            passMatchWrap.classList.toggle('matched', matches);
            passMatchWrap.classList.toggle('mismatched', !matches);
        }
        if (passMatchIcon) {
            passMatchIcon.className = matches ? 'las la-check-circle' : 'las la-times-circle';
        }
        if (passMatchLabel) {
            passMatchLabel.innerText = matches ? 'Passwords match' : 'Passwords do not match';
        }
    }

    // Universal Tactile Ripple Effect on Buttons & Cards
    document.querySelectorAll('.auth-action-btn, .role-card, .btn-back-nav, .active-role-chip').forEach(el => {
        el.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.classList.add('ripple-effect');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
            ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });

    /* =========================================
       7. REMEMBER ME PREFILL
       ========================================= */
    const rememberMe = document.getElementById('rememberMe');
    const savedPhone = localStorage.getItem('savedJagruthiPhone');
    if (savedPhone && loginPhone) {
        loginPhone.value = savedPhone;
        if (rememberMe) rememberMe.checked = true;
        if (loginPhoneValid) loginPhoneValid.classList.add('visible');
    }

    /* =========================================
       8. SUPABASE INTEGRATION
       ========================================= */
    const supabase = window.supabaseClient;

    /* =========================================
       8. LOGIN HANDLER
       ========================================= */
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideMessage();

            const phone = document.getElementById('loginPhone').value.trim();
            const password = document.getElementById('loginPassword').value;

            // Validation
            if (!phone) return showMessage('Please enter your email or phone number.');
            if (!password) return showMessage('Please enter your password.');
            if (!selectedRole) return showMessage('Please select a role.');

            // Remember Me
            if (rememberMe && rememberMe.checked) {
                localStorage.setItem('savedJagruthiPhone', phone);
            } else {
                localStorage.removeItem('savedJagruthiPhone');
            }

            // Loading state
            const btn = document.getElementById('loginBtn');
            if (btn) btn.classList.add('loading');

            try {
                if (!supabase) {
                    if (btn) btn.classList.remove('loading');
                    return showMessage('Database connection unavailable. Please check your network.');
                }

                // Supabase Query
                const { data: user, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('phone', phone)
                    .eq('role', selectedRole)
                    .single();

                if (error || !user) {
                    if (btn) btn.classList.remove('loading');
                    return showMessage(`No ${roleMeta[selectedRole]?.name || selectedRole} account found with this phone number. Please sign up.`);
                }

                if (user.password !== password) {
                    if (btn) btn.classList.remove('loading');
                    return showMessage('Incorrect password. Please try again.');
                }

                // Success — store session
                if (user.id) {
                    localStorage.setItem('userId', user.id);
                } else {
                    let existingUserId = localStorage.getItem('userId');
                    if (!existingUserId || existingUserId.length < 10) {
                        existingUserId = window.generateUUID ? window.generateUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random()*16|0 : (Math.random()*16|0)&0x3|0x8).toString(16));
                    }
                    localStorage.setItem('userId', existingUserId);
                }
                localStorage.setItem('userName', user.full_name);
                localStorage.setItem('fullName', user.full_name);
                localStorage.setItem('userPhone', user.phone);
                localStorage.setItem('userRole', user.role);
                localStorage.setItem('isLoggedIn', 'true');

                showMessage(`Welcome back, ${user.full_name}! Redirecting...`, 'success');

                setTimeout(() => {
                    window.location.href = dashboardMap[selectedRole] || 'index.html';
                }, 1000);

            } catch (err) {
                if (btn) btn.classList.remove('loading');
                console.error("Login Exception:", err);
                showMessage('Network error during login. Please try again.');
            }
        });
    }

    /* =========================================
       9. REGISTRATION HANDLER
       ========================================= */
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideMessage();

            const name = document.getElementById('regName').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;

            // Basic validations
            if (!name) return showMessage('Please enter your full name.');
            if (!phone) return showMessage('Please enter your phone number.');
            if (phone.length < 10) return showMessage('Phone number must be at least 10 digits.');
            if (!email) return showMessage('Please enter your email address.');
            if (!password) return showMessage('Please enter a password.');
            if (password.length < 6) return showMessage('Password must be at least 6 characters.');
            if (password !== confirmPassword) return showMessage('Passwords do not match.');

            // Role-specific validation
            if (selectedRole === 'police') {
                const station = document.getElementById('regPoliceStation')?.value.trim();
                const officerId = document.getElementById('regOfficerId')?.value.trim();
                if (!station) return showMessage('Please enter your police station name.');
                if (!officerId) return showMessage('Please enter your officer ID.');
            }

            if (selectedRole === 'admin') {
                const adminId = document.getElementById('regAdminId')?.value.trim();
                const secCode = document.getElementById('regSecurityCode')?.value.trim();
                if (!adminId) return showMessage('Please enter your Admin ID.');
                if (!secCode) return showMessage('Please enter the security code.');
            }

            if (selectedRole === 'patrol') {
                const station = document.getElementById('regPatrolStation')?.value.trim() || document.getElementById('regPoliceStation')?.value.trim();
                const officerId = document.getElementById('regPatrolOfficerId')?.value.trim() || document.getElementById('regOfficerId')?.value.trim();
                if (!station) return showMessage('Please enter your police unit or station name.');
                if (!officerId) return showMessage('Please enter your patrol officer ID.');
            }

            // Loading state
            const btn = document.getElementById('registerBtn');
            if (btn) btn.classList.add('loading');

            try {
                if (!supabase) {
                    if (btn) btn.classList.remove('loading');
                    return showMessage('Supabase client not initialized. Please check your configuration.');
                }

                // Check for duplicate in Supabase
                const { data: existingList, error: checkError } = await supabase
                    .from('users')
                    .select('phone')
                    .eq('phone', phone)
                    .eq('role', selectedRole);

                if (checkError) {
                    console.error("Supabase Check Error:", checkError);
                }

                if (existingList && existingList.length > 0) {
                    if (btn) btn.classList.remove('loading');
                    return showMessage('An account with this phone number already exists for this role.');
                }

                // Build user object
                const newUser = {
                    full_name: name,
                    phone: phone,
                    email: email,
                    password: password,
                    role: selectedRole
                };

                // Add role-specific data
                if (selectedRole === 'user') {
                    newUser.emergency_contact = document.getElementById('regEmergencyContact')?.value.trim() || '';
                    newUser.address = document.getElementById('regAddress')?.value.trim() || '';
                } else if (selectedRole === 'emergency') {
                    newUser.relationship = document.getElementById('regRelationship')?.value.trim() || '';
                } else if (selectedRole === 'police') {
                    newUser.police_station = document.getElementById('regPoliceStation')?.value.trim() || '';
                    newUser.officer_id = document.getElementById('regOfficerId')?.value.trim() || '';
                } else if (selectedRole === 'admin') {
                    newUser.admin_id = document.getElementById('regAdminId')?.value.trim() || '';
                } else if (selectedRole === 'patrol') {
                    newUser.police_station = document.getElementById('regPatrolStation')?.value.trim() || document.getElementById('regPoliceStation')?.value.trim() || '';
                    newUser.officer_id = document.getElementById('regPatrolOfficerId')?.value.trim() || document.getElementById('regOfficerId')?.value.trim() || '';
                }

                // Insert into Supabase
                const { error: insertError } = await supabase
                    .from('users')
                    .insert([newUser]);

                if (insertError) {
                    console.error("Supabase Insert Error:", insertError);
                    if (btn) btn.classList.remove('loading');
                    return showMessage(`Database error: ${insertError.message}`);
                }

                if (btn) btn.classList.remove('loading');
                showMessage('Account created successfully! Please login.', 'success');

                // Switch to login tab after short delay
                setTimeout(() => {
                    switchTab('login');
                    const phoneInput = document.getElementById('loginPhone');
                    if (phoneInput) phoneInput.value = phone;
                }, 1200);

            } catch (err) {
                if (btn) btn.classList.remove('loading');
                console.error("Registration Exception:", err);
                showMessage('Network error or configuration issue during registration.');
            }
        });
    }

    /* =========================================
       10. AUTO CHECK SESSION
       ========================================= */
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const storedRole = localStorage.getItem('userRole');
    if (isLoggedIn === 'true' && storedRole && dashboardMap[storedRole]) {
        // Already logged in — redirect
        window.location.href = dashboardMap[storedRole];
    }

});
