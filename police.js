/* ==========================================================================
   Jagruthi Police Dashboard — Live Supabase Command Center Controller
   100% Real Backend Data Integration: emergency_alerts, users, live_locations,
   sos_events, sos_evidence, and Supabase Storage bucket 'jagruthi-evidence'.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;

    /* ==========================================================================
       1. AUTHENTICATION & ROLE-BASED ACCESS CONTROL
       ========================================================================== */
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');

    // Strict role check: unauthorized users redirect to login
    if (isLoggedIn !== 'true' || userRole !== 'police') {
        window.location.href = 'login.html';
        return;
    }

    // Populate Officer Identity from authenticated session
    const storedOfficerName = localStorage.getItem('fullName') || localStorage.getItem('userName') || 'Police Officer';
    const storedStation = localStorage.getItem('policeStation') || 'Command Center';

    const topOfficerName = document.getElementById('topOfficerName');
    const topOfficerStation = document.getElementById('topOfficerStation');
    const dropdownOfficerName = document.getElementById('dropdownOfficerName');
    const dropdownStationName = document.getElementById('dropdownStationName');
    const polStationName = document.getElementById('polStationName');
    const polProfileName = document.getElementById('polProfileName');

    if (topOfficerName) topOfficerName.innerText = storedOfficerName;
    if (topOfficerStation) topOfficerStation.innerText = storedStation;
    if (dropdownOfficerName) dropdownOfficerName.innerText = storedOfficerName;
    if (dropdownStationName) dropdownStationName.innerText = `${storedStation} Command Station`;
    if (polStationName) polStationName.innerText = storedStation;
    if (polProfileName) polProfileName.innerText = storedOfficerName;

    /* ==========================================================================
       2. TOPBAR DROPDOWNS & NAVIGATION
       ========================================================================== */
    const officerProfileMenu = document.getElementById('officerProfileMenu');
    const profileDropdownMenu = document.getElementById('profileDropdownMenu');
    const notifBellBtn = document.getElementById('notifBellBtn');
    const notifDropdown = document.getElementById('notifDropdown');

    if (officerProfileMenu && profileDropdownMenu) {
        officerProfileMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdownMenu.classList.toggle('show');
            if (notifDropdown) notifDropdown.classList.remove('show');
        });
    }

    let currentAlertFilter = 'all';

    if (notifBellBtn && notifDropdown) {
        notifBellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notifDropdown.classList.toggle('show');
            if (profileDropdownMenu) profileDropdownMenu.classList.remove('show');
        });

        notifDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    const notifCloseBtn = document.getElementById('notifCloseBtn');
    if (notifCloseBtn && notifDropdown) {
        notifCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notifDropdown.classList.remove('show');
        });
    }

    const notifFilterBtns = document.querySelectorAll('.notif-filter-btn');
    notifFilterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            notifFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentAlertFilter = btn.dataset.filter || 'all';
            if (realAlertsList) {
                renderAlertsList(realAlertsList);
            }
        });
    });

    const viewAllAlertsLink = document.getElementById('viewAllAlertsLink');
    if (viewAllAlertsLink) {
        viewAllAlertsLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (notifDropdown) notifDropdown.classList.remove('show');
            const target = document.querySelector('.bottom-dashboard-grid') || document.querySelector('.alert-details-card');
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Map Fullscreen Toggle
    const mapFullscreenBtn = document.getElementById('mapFullscreenBtn');
    const policeMapPanel = document.getElementById('policeMapPanel');
    if (mapFullscreenBtn && policeMapPanel) {
        mapFullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            policeMapPanel.classList.toggle('fullscreen-map');
            const icon = mapFullscreenBtn.querySelector('i');
            if (policeMapPanel.classList.contains('fullscreen-map')) {
                if (icon) icon.className = 'las la-compress';
                mapFullscreenBtn.title = 'Exit Fullscreen Map';
            } else {
                if (icon) icon.className = 'las la-expand';
                mapFullscreenBtn.title = 'Toggle Fullscreen Map';
            }
            if (policeMap) setTimeout(() => policeMap.invalidateSize(), 200);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && policeMapPanel && policeMapPanel.classList.contains('fullscreen-map')) {
            policeMapPanel.classList.remove('fullscreen-map');
            const icon = mapFullscreenBtn?.querySelector('i');
            if (icon) icon.className = 'las la-expand';
            if (policeMap) setTimeout(() => policeMap.invalidateSize(), 200);
        }
    });

    window.addEventListener('resize', () => {
        if (policeMap) policeMap.invalidateSize();
    });

    document.addEventListener('click', () => {
        if (profileDropdownMenu) profileDropdownMenu.classList.remove('show');
        if (notifDropdown) notifDropdown.classList.remove('show');
    });

    const btnLogoutSession = document.getElementById('btnLogoutSession');
    if (btnLogoutSession) {
        btnLogoutSession.addEventListener('click', () => {
            if (confirm("End officer session and log out?")) {
                localStorage.clear();
                window.location.href = 'login.html';
            }
        });
    }

    // Mobile sidebar toggle
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const policeSidebar = document.getElementById('policeSidebar');
    if (sidebarToggleBtn && policeSidebar) {
        sidebarToggleBtn.addEventListener('click', () => {
            policeSidebar.classList.toggle('mobile-open');
        });
    }

    // Sidebar navigation smooth scroll / focus
    const sidebarNavLinks = document.querySelectorAll('#sidebarNav .nav-link');
    sidebarNavLinks.forEach(link => {
        link.addEventListener('click', () => {
            sidebarNavLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const navTarget = link.dataset.nav;
            if (navTarget === 'map') {
                const mapCard = document.querySelector('.map-panel-card');
                if (mapCard) mapCard.scrollIntoView({ behavior: 'smooth' });
                if (policeMap) setTimeout(() => policeMap.invalidateSize(), 200);
            } else if (navTarget === 'patrols') {
                const patrolSec = document.getElementById('patrolManagementSection');
                if (patrolSec) patrolSec.scrollIntoView({ behavior: 'smooth' });
                fetchRealPatrolUnits();
            } else if (navTarget === 'alerts') {
                if (notifDropdown) {
                    notifDropdown.classList.add('show');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else if (navTarget === 'cases') {
                const detailsCard = document.querySelector('.alert-details-card');
                if (detailsCard) detailsCard.scrollIntoView({ behavior: 'smooth' });
            } else if (navTarget === 'dashboard') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }

            if (policeSidebar) policeSidebar.classList.remove('mobile-open');
        });
    });

    /* ==========================================================================
       3. STATE MANAGEMENT & CACHES
       ========================================================================== */
    let realAlertsList = [];
    let selectedAlertId = null;
    let usersCache = new Map(); // phone -> { full_name, role, ... }
    let addressCache = new Map(); // "lat,lng" -> human address
    let officerLocation = null;
    let policeMap = null;
    let isMapInit = false;

    // Layer groups for Leaflet
    const layerSosGroup = L.layerGroup();
    const layerUsersGroup = L.layerGroup();
    const layerDeviationGroup = L.layerGroup();
    const layerPoliceGroup = L.layerGroup();
    const layerPatrolGroup = L.layerGroup();
    const layerRouteGroup = L.layerGroup();
    const layerSafeZonesGroup = L.layerGroup();
    let policeNavRoute = null;
    let realPatrolUnits = [];
    let selectedPatrolUnit = null;

    // Known alert IDs to prevent duplicate sound strobe alerts
    const processedAlertIds = new Set();

    /* ==========================================================================
       4. HELPER UTILITIES: Geocoding, Time & Distance
       ========================================================================== */
    async function reverseGeocode(lat, lng) {
        if (!lat || !lng) return "Location coordinates unavailable";
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (addressCache.has(key)) return addressCache.get(key);

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
                headers: { 'Accept-Language': 'en' }
            });
            const data = await res.json();
            const addr = data.display_name || `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
            addressCache.set(key, addr);
            return addr;
        } catch (e) {
            return `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
        }
    }

    function parseUtcDate(input) {
        if (!input) return new Date();
        if (input instanceof Date) return input;
        let str = String(input).trim();
        if (!str) return new Date();
        const hasTimezone = /Z$/i.test(str) || /[+-]\d{2}(:?\d{2})?$/.test(str);
        if (!hasTimezone) str = str.replace(' ', 'T') + 'Z';
        const d = new Date(str);
        return isNaN(d.getTime()) ? new Date(input) : d;
    }

    function formatRelativeTime(dateString) {
        if (!dateString) return "—";
        const date = parseUtcDate(dateString);
        const now = new Date();
        const diffSec = Math.floor((now - date) / 1000);

        if (diffSec < 45) return "Just now";
        if (diffSec < 90) return "1 min ago";
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
        if (diffSec < 7200) return "1 hour ago";
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
        if (diffSec < 172800) return "Yesterday";
        return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    }

    function calculateDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return (R * c).toFixed(1);
    }

    /* ==========================================================================
       5. LEAFLET MAP INITIALIZATION
       ========================================================================== */
    function initPoliceDashboardMap() {
        if (isMapInit) return;
        const mapContainer = document.getElementById('policeMap');
        if (!mapContainer) return;
        isMapInit = true;

        // Default view: Center on Karnataka Region (13.149, 77.534 where real active alerts exist)
        policeMap = L.map('policeMap', {
            center: [13.1493, 77.5340],
            zoom: 13,
            zoomControl: false
        });

        // Google Maps Base Tile Layers (No API Key Required via Google Tile Servers)
        const baseLayers = {
            'google-streets': L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps'
            }),
            'google-hybrid': L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps Satellite & Hybrid'
            }),
            'google-terrain': L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps Terrain'
            }),
            'osm': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd',
                attribution: '&copy; OpenStreetMap contributors, &copy; CARTO'
            })
        };

        // Add Google Streets as Default Layer
        let currentBaseLayer = baseLayers['google-streets'];
        currentBaseLayer.addTo(policeMap);

        // Map View Type Switcher Dropdown (Google Streets, Satellite, Terrain, OSM)
        const mapViewDropdownBtn = document.getElementById('mapViewDropdownBtn');
        const mapTypeDropdownMenu = document.getElementById('mapTypeDropdownMenu');
        const currentMapTypeName = document.getElementById('currentMapTypeName');

        if (mapViewDropdownBtn && mapTypeDropdownMenu) {
            mapViewDropdownBtn.onclick = (e) => {
                e.stopPropagation();
                mapTypeDropdownMenu.classList.toggle('show');
            };

            document.addEventListener('click', () => {
                mapTypeDropdownMenu.classList.remove('show');
            });

            document.querySelectorAll('.map-type-opt').forEach(opt => {
                opt.onclick = (e) => {
                    e.stopPropagation();
                    const typeKey = opt.dataset.mapType;
                    if (baseLayers[typeKey]) {
                        policeMap.removeLayer(currentBaseLayer);
                        currentBaseLayer = baseLayers[typeKey];
                        currentBaseLayer.addTo(policeMap);

                        document.querySelectorAll('.map-type-opt').forEach(o => o.classList.remove('active'));
                        opt.classList.add('active');

                        const labelNames = {
                            'google-streets': 'Google Streets',
                            'google-hybrid': 'Google Satellite',
                            'google-terrain': 'Google Terrain',
                            'osm': 'Carto / OSM'
                        };
                        if (currentMapTypeName) currentMapTypeName.innerText = labelNames[typeKey] || 'Google Maps';
                    }
                    mapTypeDropdownMenu.classList.remove('show');
                };
            });
        }

        // Add layer groups
        layerSosGroup.addTo(policeMap);
        layerUsersGroup.addTo(policeMap);
        layerDeviationGroup.addTo(policeMap);
        layerPoliceGroup.addTo(policeMap);
        layerPatrolGroup.addTo(policeMap);
        layerRouteGroup.addTo(policeMap);
        layerSafeZonesGroup.addTo(policeMap);

        // Zoom Controls
        const mapZoomInBtn = document.getElementById('mapZoomInBtn');
        const mapZoomOutBtn = document.getElementById('mapZoomOutBtn');
        const mapLocateBtn = document.getElementById('mapLocateBtn');

        if (mapZoomInBtn) mapZoomInBtn.onclick = () => policeMap.zoomIn();
        if (mapZoomOutBtn) mapZoomOutBtn.onclick = () => policeMap.zoomOut();
        if (mapLocateBtn) mapLocateBtn.onclick = () => focusActiveAlertOnMap();

        // Legend Checkbox Toggles
        bindLayerToggle('layerLiveUsers', layerUsersGroup);
        bindLayerToggle('layerSosAlerts', layerSosGroup);
        bindLayerToggle('layerRouteDeviation', layerDeviationGroup);
        bindLayerToggle('layerSafeZones', layerSafeZonesGroup);
        bindLayerToggle('layerPoliceStations', layerPoliceGroup);
        bindLayerToggle('layerPatrolUnits', layerPatrolGroup);

        // Police stations layer initialization (Administrator is command center, not a patrol unit)
    }

    function bindLayerToggle(checkboxId, layerGroup) {
        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) return;
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!policeMap.hasLayer(layerGroup)) policeMap.addLayer(layerGroup);
            } else {
                if (policeMap.hasLayer(layerGroup)) policeMap.removeLayer(layerGroup);
            }
        });
    }

    setTimeout(initPoliceDashboardMap, 300);

    /* ==========================================================================
       6. REAL DATABASE QUERIES & SYNCHRONIZATION
       ========================================================================== */

    // Load registered users map for phone number to name resolution
    async function loadUsersCache() {
        if (!supabase) return;
        try {
            const { data: users, error } = await supabase
                .from('users')
                .select('id, full_name, phone, role, police_station, officer_id');

            if (!error && users) {
                users.forEach(u => {
                    if (u.phone) usersCache.set(u.phone, u);
                });
            }
        } catch (e) {
            console.warn("Could not cache users:", e);
        }
    }

    // SECTION A: Statistics Cards Queries
    async function fetchRealPoliceStats() {
        if (!supabase) return;

        try {
            // 1. Active Alerts & Severity breakdown
            const { data: activeAlerts, count: activeCount, error: activeErr } = await supabase
                .from('emergency_alerts')
                .select('alert_type', { count: 'exact' })
                .eq('status', 'active');

            const dashActiveCount = document.getElementById('dashActiveCount');
            const statSosSub = document.getElementById('statSosSub');
            const polIncBadge = document.getElementById('polIncBadge');
            const topNotifBadge = document.getElementById('topNotifBadge');
            const notifUnreadPill = document.getElementById('notifUnreadPill');

            if (!activeErr && activeAlerts) {
                const totalActive = activeCount ?? activeAlerts.length;
                if (dashActiveCount) dashActiveCount.innerText = totalActive;
                if (polIncBadge) polIncBadge.innerText = totalActive;
                if (topNotifBadge) topNotifBadge.innerText = totalActive;
                if (notifUnreadPill) notifUnreadPill.innerText = `${totalActive} Active`;

                let critical = 0;
                let moderate = 0;
                activeAlerts.forEach(a => {
                    const t = (a.alert_type || '').toLowerCase();
                    if (t.includes('sos') || t.includes('panic') || t.includes('auto-sos')) {
                        critical++;
                    } else {
                        moderate++;
                    }
                });

                if (statSosSub) {
                    statSosSub.innerText = totalActive > 0 
                        ? `${critical} Critical · ${moderate} Moderate`
                        : "0 Critical · 0 Moderate";
                }
            } else if (dashActiveCount) {
                dashActiveCount.innerText = "0";
            }

            // 2. Women Currently Active / Under Monitoring (distinct users with active alert or live locations)
            const { data: activeAlertPhones } = await supabase
                .from('emergency_alerts')
                .select('user_phone')
                .eq('status', 'active');

            const activePhonesSet = new Set((activeAlertPhones || []).map(a => a.user_phone).filter(Boolean));

            // Also check recent live location updates
            const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: recentLocations } = await supabase
                .from('live_locations')
                .select('user_phone')
                .gte('created_at', recentCutoff);

            (recentLocations || []).forEach(l => {
                if (l.user_phone) activePhonesSet.add(l.user_phone);
            });

            const dashWomenActive = document.getElementById('dashWomenActive');
            const dashWomenActiveSub = document.getElementById('dashWomenActiveSub');
            if (dashWomenActive) {
                dashWomenActive.innerText = activePhonesSet.size;
            }
            if (dashWomenActiveSub) {
                dashWomenActiveSub.innerText = activePhonesSet.size > 0 
                    ? "Under active monitoring" 
                    : "No active journeys";
            }

            // 3. Alerts Resolved Today (local day boundary)
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const todayIso = startOfToday.toISOString();

            const { count: resolvedTodayCount } = await supabase
                .from('emergency_alerts')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'resolved')
                .gte('created_at', todayIso);

            const { count: totalResolvedCount } = await supabase
                .from('emergency_alerts')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'resolved');

            const dashClosedCount = document.getElementById('dashClosedCount');
            const dashClosedSub = document.getElementById('dashClosedSub');
            if (dashClosedCount) {
                dashClosedCount.innerText = resolvedTodayCount ?? 0;
            }
            if (dashClosedSub) {
                dashClosedSub.innerText = (resolvedTodayCount ?? 0) > 0 
                    ? `+${resolvedTodayCount} closed today`
                    : `${totalResolvedCount ?? 0} total cases resolved`;
            }

            // 4. Registered Users (role = 'user')
            const { count: regUsersCount } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'user');

            // Users registered this week
            const startOfWeek = new Date();
            startOfWeek.setDate(startOfWeek.getDate() - 7);
            const { count: usersThisWeek } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'user')
                .gte('created_at', startOfWeek.toISOString());

            const dashRegisteredUsers = document.getElementById('dashRegisteredUsers');
            const dashRegisteredUsersSub = document.getElementById('dashRegisteredUsersSub');
            if (dashRegisteredUsers) {
                dashRegisteredUsers.innerText = regUsersCount !== null ? regUsersCount.toLocaleString() : "—";
            }
            if (dashRegisteredUsersSub) {
                dashRegisteredUsersSub.innerText = (usersThisWeek ?? 0) > 0 
                    ? `+${usersThisWeek} this week`
                    : "Registered citizens";
            }

            // 5. IoT Devices Online: No devices table in Supabase
            const dashIotDevices = document.getElementById('dashIotDevices');
            const dashIotDevicesSub = document.getElementById('dashIotDevicesSub');
            if (dashIotDevices) dashIotDevices.innerText = "—";
            if (dashIotDevicesSub) dashIotDevicesSub.innerText = "Hardware telemetry unlinked";

        } catch (e) {
            console.error("Error fetching police statistics:", e);
        }
    }

    // SECTION B: Fetch Real Emergency Alerts from Database
    async function fetchRealEmergencyAlerts() {
        if (!supabase) return;
        const alertsContainer = document.getElementById('recentAlertsList');
        const notifDropdownList = document.getElementById('notifDropdownList');

        try {
            const { data: alerts, error } = await supabase
                .from('emergency_alerts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(25);

            if (error) {
                if (alertsContainer) {
                    alertsContainer.innerHTML = `
                        <div class="empty-state-card">
                            <i class="las la-exclamation-triangle" style="color:#EF4444;"></i>
                            <p>Error connecting to alerts database</p>
                            <small>${error.message}</small>
                        </div>
                    `;
                }
                return;
            }

            if (!alerts || alerts.length === 0) {
                if (alertsContainer) {
                    alertsContainer.innerHTML = `
                        <div class="empty-state-card">
                            <i class="las la-shield-alt"></i>
                            <p>No emergency alerts on record</p>
                            <small>All registered safety perimeters normal</small>
                        </div>
                    `;
                }
                if (notifDropdownList) {
                    notifDropdownList.innerHTML = `
                        <div class="empty-state-card" style="padding:20px 10px;">
                            <p>No unread alerts</p>
                        </div>
                    `;
                }
                clearActiveAlertDetails();
                return;
            }

            realAlertsList = alerts;

            // Render Alert Cards
            renderAlertsList(alerts);

            // Populate Notification Popover with Active Alerts
            if (notifDropdownList) {
                const activeOnes = alerts.filter(a => a.status === 'active');
                if (activeOnes.length > 0) {
                    notifDropdownList.innerHTML = activeOnes.map(a => {
                        const userName = usersCache.get(a.user_phone)?.full_name || a.user_phone;
                        return `
                            <div class="notif-item" onclick="selectAlertById('${a.id}');">
                                <div class="notif-item-icon"><i class="las la-bell"></i></div>
                                <div>
                                    <strong>${a.alert_type || 'SOS Alert'}</strong>
                                    <p style="margin:2px 0 0; color:#64748B;">${userName}: ${a.message || 'Distress signal'}</p>
                                    <small style="color:#F41464; font-weight:600;">${formatRelativeTime(a.created_at)} • Active</small>
                                </div>
                            </div>
                        `;
                    }).join('');
                } else {
                    notifDropdownList.innerHTML = `
                        <div class="empty-state-card" style="padding:20px 10px;">
                            <p>No active emergencies</p>
                        </div>
                    `;
                }
            }

            // Automatically select first ACTIVE alert if available
            const activeAlerts = alerts.filter(a => a.status === 'active');
            if (activeAlerts.length > 0) {
                // If no active alert is selected or selected alert is resolved, select first ACTIVE alert
                if (!selectedAlertId || !activeAlerts.some(a => a.id === selectedAlertId)) {
                    selectAlertById(activeAlerts[0].id);
                }
            } else {
                // No active emergencies exist!
                selectedAlertId = null;
                clearActiveAlertDetails();
            }

            // Plot real alert locations on map
            updateMapWithRealRecords(alerts);

        } catch (e) {
            console.error("Exception loading emergency alerts:", e);
        }
    }

    // Render alert cards in Recent Alerts panel (inside Bell dropdown)
    async function renderAlertsList(alerts) {
        const alertsContainer = document.getElementById('recentAlertsList');
        if (!alertsContainer) return;

        let filtered = alerts;
        if (currentAlertFilter === 'active') {
            filtered = alerts.filter(a => a.status === 'active');
        } else if (currentAlertFilter === 'resolved') {
            filtered = alerts.filter(a => a.status === 'resolved');
        }

        if (!filtered || filtered.length === 0) {
            alertsContainer.innerHTML = `
                <div class="empty-state-card" style="padding: 32px 14px; text-align: center;">
                    <i class="las la-shield-alt" style="font-size: 2.2rem; color: #10B981; margin-bottom: 8px; display: block;"></i>
                    <p style="font-weight: 600; color: #1E293B; margin: 0 0 4px;">No ${currentAlertFilter === 'all' ? '' : currentAlertFilter} alerts found</p>
                    <small style="color: #64748B;">All safety perimeters normal</small>
                </div>
            `;
            return;
        }

        // Geocode top alerts in background
        alertsContainer.innerHTML = filtered.map((alert, index) => {
            const isSelected = (alert.id === selectedAlertId);
            const userObj = usersCache.get(alert.user_phone);
            const userName = userObj ? userObj.full_name : alert.user_phone;

            // Map severity pill and icon
            let severityClass = 'pill-moderate';
            let severityLabel = 'Moderate';
            let iconClass = 'badge-warning-excl';
            let iconInner = '!';

            if (alert.status === 'resolved') {
                severityClass = 'pill-resolved';
                severityLabel = 'Resolved';
                iconClass = 'badge-safe-check';
                iconInner = '<i class="las la-check"></i>';
            } else {
                const t = (alert.alert_type || '').toLowerCase();
                if (t.includes('sos') || t.includes('panic') || t.includes('auto-sos')) {
                    severityClass = 'pill-critical';
                    severityLabel = 'Critical';
                    iconClass = 'badge-sos';
                    iconInner = 'SOS';
                }
            }

            // Quick location text
            let locText = `Lat: ${alert.latitude?.toFixed(4)}, Lng: ${alert.longitude?.toFixed(4)}`;
            if (addressCache.has(`${alert.latitude?.toFixed(4)},${alert.longitude?.toFixed(4)}`)) {
                locText = addressCache.get(`${alert.latitude?.toFixed(4)},${alert.longitude?.toFixed(4)}`);
            }

            return `
                <div class="recent-alert-item ${alert.status === 'resolved' ? 'alert-resolved' : (severityLabel === 'Critical' ? 'alert-critical' : 'alert-moderate')} ${isSelected ? 'selected' : ''}" 
                     id="alertItem-${alert.id}" 
                     data-alert-id="${alert.id}">
                    <div class="alert-type-badge-icon ${iconClass}">${iconInner}</div>
                    <div class="alert-item-body">
                        <strong class="alert-item-title">${alert.alert_type || 'Emergency SOS'}</strong>
                        <span class="alert-item-loc" id="alertLocText-${alert.id}">${locText}</span>
                    </div>
                    <div class="alert-item-meta">
                        <span class="alert-item-time">${formatRelativeTime(alert.created_at)}</span>
                        <span class="severity-pill ${severityClass}">${severityLabel}</span>
                    </div>
                    <i class="las la-angle-right alert-item-chevron"></i>
                </div>
            `;
        }).join('');

        // Attach click handlers
        filtered.forEach(alert => {
            const el = document.getElementById(`alertItem-${alert.id}`);
            if (el) {
                el.addEventListener('click', () => {
                    selectAlertById(alert.id);
                    if (notifDropdown) notifDropdown.classList.remove('show');
                });
            }

            // Async reverse-geocode human readable address
            if (alert.latitude && alert.longitude) {
                reverseGeocode(alert.latitude, alert.longitude).then(addr => {
                    const locEl = document.getElementById(`alertLocText-${alert.id}`);
                    if (locEl && addr) locEl.innerText = addr;
                });
            }
        });
    }

    // SECTION C: Map Updates with Real Database Coordinates & Dynamic Movement Tracking
    const activeCitizenMarkers = new Map();
    let hasInitialFittedBounds = false;

    function isPatrolLocation(phone, travelMode) {
        if (!phone) return false;
        const tm = (travelMode || '').toUpperCase();
        if (tm.includes('MANUAL') || tm.includes('PATROL')) return true;
        if (realPatrolUnits && realPatrolUnits.some(u => u.phone === phone)) return true;
        return false;
    }

    window.updateCitizenLivePosition = function(phone, lat, lng, travelMode = 'Normal', alertStatus = 'normal') {
        if (!policeMap || isNaN(lat) || isNaN(lng)) return;

        // Strictly verify: Patrol units must NEVER be plotted as citizens
        if (isPatrolLocation(phone, travelMode)) {
            if (activeCitizenMarkers.has(phone)) {
                layerUsersGroup.removeLayer(activeCitizenMarkers.get(phone));
                activeCitizenMarkers.delete(phone);
            }
            const pUnit = realPatrolUnits.find(u => u.phone === phone);
            if (pUnit) {
                pUnit.latitude = parseFloat(lat);
                pUnit.longitude = parseFloat(lng);
                updatePatrolMapMarkers();
            }
            return;
        }

        // Strictly verify: Citizens must ONLY be plotted on the police dashboard if they have an ACTIVE emergency alert
        const hasActiveAlert = realAlertsList && realAlertsList.some(a => a.user_phone === phone && a.status === 'active');
        if (!hasActiveAlert) {
            if (activeCitizenMarkers.has(phone)) {
                layerUsersGroup.removeLayer(activeCitizenMarkers.get(phone));
                activeCitizenMarkers.delete(phone);
            }
            return;
        }

        const coords = [parseFloat(lat), parseFloat(lng)];
        const userObj = usersCache.get(phone);
        const name = userObj ? userObj.full_name : phone;

        const isDeviated = (alertStatus === 'deviated');
        const pulseClass = isDeviated ? 'pulse-radar-wave-purple' : '';
        const dotBg = isDeviated ? '#7426B8' : '#1E60FF';
        const innerIcon = isDeviated ? '<i class="las la-route"></i>' : '<i class="las la-user"></i>';

        const userHtml = `
            <div style="position:relative; display:flex; align-items:center; justify-content:center;">
                <div class="pulse-radar-wave ${pulseClass}"></div>
                <div style="width:18px; height:18px; border-radius:50%; background:${dotBg}; border:3px solid #FFFFFF; box-shadow:0 0 10px rgba(30,96,255,0.8); z-index:2; display:flex; align-items:center; justify-content:center; color:white; font-size:10px;">
                    ${innerIcon}
                </div>
            </div>
        `;
        const userIcon = L.divIcon({ html: userHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });

        if (activeCitizenMarkers.has(phone)) {
            const marker = activeCitizenMarkers.get(phone);
            // Smoothly glide marker to new coordinates!
            marker.setLatLng(coords);
            marker.setIcon(userIcon);
            marker.setPopupContent(`<b>Citizen Position</b><br>${name}<br>Mode: ${travelMode || 'Normal'}<br>Status: ${alertStatus.toUpperCase()}`);
        } else {
            const marker = L.marker(coords, { icon: userIcon });
            marker.bindPopup(`<b>Citizen Position</b><br>${name}<br>Mode: ${travelMode || 'Normal'}<br>Status: ${alertStatus.toUpperCase()}`);
            layerUsersGroup.addLayer(marker);
            activeCitizenMarkers.set(phone, marker);
        }

        // If this user matches the active emergency alert, update the active alert telemetry in details panel
        const currentAlert = realAlertsList.find(a => a.id === selectedAlertId);
        if (currentAlert && currentAlert.user_phone === phone) {
            const infoLat = document.getElementById('infoLat');
            const infoLng = document.getElementById('infoLng');
            if (infoLat) infoLat.innerText = parseFloat(lat).toFixed(6);
            if (infoLng) infoLng.innerText = parseFloat(lng).toFixed(6);
            reverseGeocode(parseFloat(lat), parseFloat(lng)).then(addr => {
                const infoAddress = document.getElementById('infoAddress');
                if (infoAddress) infoAddress.innerText = addr;
            });
        }
    };

    async function updateMapWithRealRecords(alerts) {
        if (!policeMap) return;

        layerSosGroup.clearLayers();
        layerDeviationGroup.clearLayers();

        const mapStatusText = document.getElementById('mapStatusText');
        const mapBounds = [];

        // 1. Fetch Latest Telemetry from live_locations table first
        const latestUserLoc = new Map();
        try {
            const { data: locations } = await supabase
                .from('live_locations')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(40);

            if (locations && locations.length > 0) {
                locations.forEach(l => {
                    if (l.user_phone && !latestUserLoc.has(l.user_phone)) {
                        latestUserLoc.set(l.user_phone, l);
                    }
                });
            }
        } catch (e) {
            console.warn("Could not query live_locations for map:", e);
        }

        // Track users with an active SOS alert on the map
        const usersWithSos = new Set();

        // 2. Plot SOS Alert Markers (aligned with user's actual road location)
        const activeAlerts = alerts.filter(a => a.status === 'active' && a.latitude && a.longitude);
        activeAlerts.forEach(alert => {
            let lat = parseFloat(alert.latitude);
            let lng = parseFloat(alert.longitude);

            // If citizen has live telemetry in live_locations, use the live location coordinates
            if (alert.user_phone && latestUserLoc.has(alert.user_phone)) {
                const live = latestUserLoc.get(alert.user_phone);
                if (live.latitude && live.longitude && !isNaN(live.latitude) && !isNaN(live.longitude)) {
                    lat = parseFloat(live.latitude);
                    lng = parseFloat(live.longitude);
                }
            }

            if (alert.user_phone) usersWithSos.add(alert.user_phone);

            const coords = [lat, lng];
            mapBounds.push(coords);

            const userObj = usersCache.get(alert.user_phone);
            const userName = userObj ? userObj.full_name : alert.user_phone;

            const sosMarkerHtml = `
                <div style="position:relative; display:flex; align-items:center; justify-content:center;">
                    <div class="pulse-radar-wave pulse-radar-wave-red"></div>
                    <div style="width:24px; height:24px; border-radius:50%; background:#F41464; border:3px solid #FFFFFF; box-shadow:0 0 12px rgba(244,20,100,0.9); z-index:2; display:flex; align-items:center; justify-content:center;">
                        <i class="las la-exclamation" style="color:white; font-size:13px; font-weight:900;"></i>
                    </div>
                </div>
            `;
            const sosIcon = L.divIcon({
                html: sosMarkerHtml,
                className: '',
                iconSize: [44, 44],
                iconAnchor: [22, 22]
            });
            const marker = L.marker(coords, { icon: sosIcon });
            marker.bindPopup(`
                <b>🚨 ${alert.alert_type || 'SOS Alert'}</b><br>
                User: ${userName} (${alert.user_phone})<br>
                Status: ACTIVE<br>
                Time: ${parseUtcDate(alert.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
            `);
            marker.on('click', () => selectAlertById(alert.id));
            layerSosGroup.addLayer(marker);
        });

        // Clean up citizen markers for citizens whose alerts are now resolved
        activeCitizenMarkers.forEach((marker, phone) => {
            if (!activeAlerts.some(a => a.user_phone === phone)) {
                layerUsersGroup.removeLayer(marker);
                activeCitizenMarkers.delete(phone);
            }
        });

        // If there are no active alerts, clear all distress layers completely
        if (activeAlerts.length === 0) {
            layerSosGroup.clearLayers();
            layerDeviationGroup.clearLayers();
            layerRouteGroup.clearLayers();
            layerUsersGroup.clearLayers();
            activeCitizenMarkers.clear();
            if (mapStatusText) mapStatusText.innerText = "All incidents resolved - Command standby";
            return;
        }

        // 3. Smoothly Plot/Move Citizens from live_locations (strictly for active emergencies and excluding patrols)
        latestUserLoc.forEach((loc, phone) => {
            if (loc.latitude && loc.longitude) {
                // If location belongs to a registered patrol unit or manual patrol coordinate, patrol marker renders it!
                if (isPatrolLocation(phone, loc.travel_mode)) {
                    if (activeCitizenMarkers.has(phone)) {
                        layerUsersGroup.removeLayer(activeCitizenMarkers.get(phone));
                        activeCitizenMarkers.delete(phone);
                    }
                    return;
                }

                // If citizen does NOT have an active alert, do not plot on police dashboard
                if (!activeAlerts.some(a => a.user_phone === phone)) {
                    if (activeCitizenMarkers.has(phone)) {
                        layerUsersGroup.removeLayer(activeCitizenMarkers.get(phone));
                        activeCitizenMarkers.delete(phone);
                    }
                    return;
                }

                // If user already has an active SOS pin on the map, remove duplicate citizen dot
                if (usersWithSos.has(phone)) {
                    if (activeCitizenMarkers.has(phone)) {
                        layerUsersGroup.removeLayer(activeCitizenMarkers.get(phone));
                        activeCitizenMarkers.delete(phone);
                    }
                    return;
                }

                const coords = [parseFloat(loc.latitude), parseFloat(loc.longitude)];
                mapBounds.push(coords);

                // Dynamically update or add citizen position without clearing other markers
                updateCitizenLivePosition(
                    phone,
                    parseFloat(loc.latitude),
                    parseFloat(loc.longitude),
                    loc.travel_mode || 'Normal',
                    loc.alert_status || 'normal'
                );
            }
        });

        // Adjust Map Bounds only on initial load so map view does not jerk while user walks
        if (mapBounds.length > 0) {
            if (mapStatusText) mapStatusText.innerText = `${mapBounds.length} GPS Coordinates Active`;
            if (!hasInitialFittedBounds && policeMap) {
                hasInitialFittedBounds = true;
                policeMap.fitBounds(mapBounds, { padding: [50, 50], maxZoom: 15 });
            }
        } else {
            if (mapStatusText) mapStatusText.innerText = "No active GPS coordinates";
        }
    }

    // SECTION D & E: Alert Selection & Evidence Stream Loading
    window.selectAlertById = async function(alertId) {
        selectedAlertId = alertId;

        // Update selected class in DOM
        document.querySelectorAll('.recent-alert-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.alertId === alertId);
        });

        const alert = realAlertsList.find(a => a.id === alertId);
        if (!alert) return;

        // Populate Active Alert Details Panel
        populateActiveAlertDetails(alert);

        // Load real evidence from sos_evidence and Supabase Storage
        await loadRealEvidenceForAlert(alert);

        // Calculate nearest patrol recommendations for this alert
        if (alert.latitude && alert.longitude && realPatrolUnits.length > 0) {
            await calculateNearestPatrolRecommendations(alert);
        }

        // Focus map on citizen's live coordinates
        let focusLat = parseFloat(alert.latitude);
        let focusLng = parseFloat(alert.longitude);
        try {
            const { data: latestLoc } = await supabase
                .from('live_locations')
                .select('latitude, longitude')
                .eq('user_phone', alert.user_phone)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestLoc && latestLoc.latitude && latestLoc.longitude) {
                focusLat = parseFloat(latestLoc.latitude);
                focusLng = parseFloat(latestLoc.longitude);
            }
        } catch (e) {}

        if (policeMap && focusLat && focusLng) {
            policeMap.setView([focusLat, focusLng], 15, { animate: true });
        }
    };

    function populateActiveAlertDetails(alert) {
        const userObj = usersCache.get(alert.user_phone);
        const userName = userObj ? userObj.full_name : alert.user_phone;

        const alertDetailCaseId = document.getElementById('alertDetailCaseId');
        const alertDetailTime = document.getElementById('alertDetailTime');
        const alertDetailSeverity = document.getElementById('alertDetailSeverity');
        const alertDetailMiniBadge = document.getElementById('alertDetailMiniBadge');

        const infoName = document.getElementById('infoName');
        const infoPhone = document.getElementById('infoPhone');
        const infoAddress = document.getElementById('infoAddress');
        const infoRoute = document.getElementById('infoRoute');
        const polAlertType = document.getElementById('polAlertType');
        const infoBattery = document.getElementById('infoBattery');
        const infoRouteStatus = document.getElementById('infoRouteStatus');

        // Header info
        const caseNumber = alert.id ? alert.id.substring(0, 8).toUpperCase() : 'CASE';
        if (alertDetailCaseId) alertDetailCaseId.innerText = `Alert #${caseNumber}`;
        if (alertDetailTime) alertDetailTime.innerText = formatRelativeTime(alert.created_at);

        // Severity
        let isCritical = false;
        if (alert.status === 'resolved') {
            if (alertDetailSeverity) {
                alertDetailSeverity.className = 'severity-pill pill-resolved';
                alertDetailSeverity.innerText = 'Resolved';
            }
            if (alertDetailMiniBadge) {
                alertDetailMiniBadge.style.background = '#0ABF78';
                alertDetailMiniBadge.innerText = 'SAFE';
            }
        } else {
            const t = (alert.alert_type || '').toLowerCase();
            isCritical = t.includes('sos') || t.includes('panic') || t.includes('auto-sos');
            if (alertDetailSeverity) {
                alertDetailSeverity.className = isCritical ? 'severity-pill pill-critical' : 'severity-pill pill-moderate';
                alertDetailSeverity.innerText = isCritical ? 'Critical' : 'Moderate';
            }
            if (alertDetailMiniBadge) {
                alertDetailMiniBadge.style.background = isCritical ? '#F41464' : '#FF9F1C';
                alertDetailMiniBadge.innerText = 'SOS';
            }
        }

        // Table fields
        if (infoName) infoName.innerText = userName || 'Citizen';
        if (infoPhone) infoPhone.innerText = alert.user_phone || 'Not available';

        // Coordinates & Location
        if (infoAddress) {
            infoAddress.innerText = `Fetching address...`;
            reverseGeocode(alert.latitude, alert.longitude).then(addr => {
                if (infoAddress) infoAddress.innerText = addr;
                const detAddressText = document.getElementById('detAddressText');
                if (detAddressText) detAddressText.innerText = addr;
            });
        }

        const detCoordsText = document.getElementById('detCoordsText');
        if (detCoordsText) {
            detCoordsText.innerText = alert.latitude && alert.longitude 
                ? `${alert.latitude.toFixed(5)}° N, ${alert.longitude.toFixed(5)}° E`
                : "Coordinates not available";
        }

        // Travel Mode & Route from message or live_locations
        let travelMode = "Not recorded";
        if (alert.message && alert.message.includes('[MODE:')) {
            const match = alert.message.match(/\[MODE:(.*?)\]/);
            if (match && match[1]) travelMode = match[1];
        }
        if (infoRoute) infoRoute.innerText = `Mode: ${travelMode}`;

        // Trigger Type
        if (polAlertType) polAlertType.innerText = alert.alert_type || 'Emergency Alert';

        // Battery
        if (infoBattery) {
            infoBattery.innerHTML = `Not recorded in event payload`;
        }

        // Status
        if (infoRouteStatus) {
            if (alert.status === 'resolved') {
                infoRouteStatus.innerText = 'Case Closed (Resolved)';
                infoRouteStatus.className = 'field-value text-success fw-bold';
            } else {
                const escalation = alert.police_escalation || 'In Progress';
                infoRouteStatus.innerText = escalation === 'ACTIVE' ? 'Response Unit Dispatched' : 'Active (Response Pending)';
                infoRouteStatus.className = 'field-value text-danger fw-bold';
            }
        }

        // Assigned Patrol Unit
        const infoAssignedPatrol = document.getElementById('infoAssignedPatrol');
        if (infoAssignedPatrol) {
            if (alert.message && alert.message.includes('[ASSIGNED:')) {
                const match = alert.message.match(/\[ASSIGNED:\s*(.*?)\s*\|/);
                const unitName = match ? match[1] : 'Patrol Unit';
                const escalation = alert.police_escalation || 'ACTIVE';
                infoAssignedPatrol.innerHTML = `<span class="badge-assigned">${unitName} · ${escalation}</span>`;
            } else {
                infoAssignedPatrol.innerText = "Unassigned";
            }
        }

        // Vehicle & Driver Details (if present in alert message)
        const driverCard = document.getElementById('driverDetailsCard');
        const driverDetailsText = document.getElementById('driverDetailsText');
        if (alert.message && alert.message.includes('Vehicle:') && alert.message.includes('Driver:')) {
            const vIndex = alert.message.indexOf('Vehicle:');
            const cleanInfo = alert.message.substring(vIndex).replace(/\[MODE:.*?\]/, '').trim();
            if (driverCard) driverCard.style.display = 'block';
            if (driverDetailsText) driverDetailsText.innerText = cleanInfo;
        } else {
            if (driverCard) driverCard.style.display = 'none';
        }

        // Action Log Tab Timeline
        const timelineContainer = document.getElementById('actionLogTimeline');
        if (timelineContainer) {
            const createdTime = parseUtcDate(alert.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            timelineContainer.innerHTML = `
                <div class="log-entry">
                    <span class="log-time">${createdTime}</span>
                    <span>Emergency alert received: <b>${alert.alert_type}</b></span>
                </div>
                <div class="log-entry">
                    <span class="log-time">+0 min</span>
                    <span>Citizen Phone: ${alert.user_phone} · Location fixed</span>
                </div>
                <div class="log-entry">
                    <span class="log-time">+1 min</span>
                    <span>Police Escalation Status: <b>${alert.police_escalation || 'PENDING'}</b></span>
                </div>
                ${alert.status === 'resolved' ? `
                    <div class="log-entry">
                        <span class="log-time">RESOLVED</span>
                        <span style="color:#0ABF78;"><b>Case Marked Resolved:</b> ${alert.message.includes('[RESOLVED]') ? alert.message : 'Action confirmed by officer.'}</span>
                    </div>
                ` : ''}
            `;
        }
    }

    function clearActiveAlertDetails() {
        const alertDetailCaseId = document.getElementById('alertDetailCaseId');
        if (alertDetailCaseId) alertDetailCaseId.innerText = "No Active Incident";
        const alertDetailTime = document.getElementById('alertDetailTime');
        if (alertDetailTime) alertDetailTime.innerText = "All perimeters clear";
        const infoName = document.getElementById('infoName');
        if (infoName) infoName.innerText = "—";
        const infoPhone = document.getElementById('infoPhone');
        if (infoPhone) infoPhone.innerText = "—";
        const infoAddress = document.getElementById('infoAddress');
        if (infoAddress) infoAddress.innerText = "No active emergency location";
        const infoRouteStatus = document.getElementById('infoRouteStatus');
        if (infoRouteStatus) infoRouteStatus.innerText = "Standby • Normal";
        const infoSpeed = document.getElementById('infoSpeed');
        if (infoSpeed) infoSpeed.innerText = "0 km/h";
        const infoBearing = document.getElementById('infoBearing');
        if (infoBearing) infoBearing.innerText = "N/A";
        const driverDetailsText = document.getElementById('driverDetailsText');
        if (driverDetailsText) driverDetailsText.innerText = "No active journey";

        // Reset evidence previews
        const realEvdVideo = document.getElementById('realEvdVideo');
        if (realEvdVideo) { realEvdVideo.pause(); realEvdVideo.src = ''; realEvdVideo.style.display = 'none'; }
        const videoEmptyPlaceholder = document.getElementById('videoEmptyPlaceholder');
        if (videoEmptyPlaceholder) videoEmptyPlaceholder.style.display = 'flex';
        const capturedImagesGrid = document.getElementById('capturedImagesGrid');
        if (capturedImagesGrid) capturedImagesGrid.innerHTML = '';
        const realEvdAudio = document.getElementById('realEvdAudio');
        if (realEvdAudio) { realEvdAudio.pause(); realEvdAudio.src = ''; }
        const audioPlayerRow = document.getElementById('audioPlayerRow');
        if (audioPlayerRow) audioPlayerRow.style.display = 'none';
        const audioEmptyPlaceholder = document.getElementById('audioEmptyPlaceholder');
        if (audioEmptyPlaceholder) audioEmptyPlaceholder.style.display = 'flex';

        // Unselect alert list items
        document.querySelectorAll('.recent-alert-item').forEach(el => el.classList.remove('selected'));

        // Reset Nearby Resources / Patrol recommendations to default fleet list
        renderPatrolUnitsList(realPatrolUnits);
    }

    function focusActiveAlertOnMap() {
        const alert = realAlertsList.find(a => a.id === selectedAlertId);
        if (alert && alert.latitude && alert.longitude && policeMap) {
            policeMap.setView([parseFloat(alert.latitude), parseFloat(alert.longitude)], 16, { animate: true });
        }
    }

    // SECTION D: Real Evidence Stream from Supabase Storage 'jagruthi-evidence'
    async function loadRealEvidenceForAlert(alert) {
        if (!supabase) return;

        // Elements
        const realEvdVideo = document.getElementById('realEvdVideo');
        const videoEmptyPlaceholder = document.getElementById('videoEmptyPlaceholder');
        const videoEmptyTitle = document.getElementById('videoEmptyTitle');
        const streamLivePill = document.getElementById('streamLivePill');
        const streamPillText = document.getElementById('streamPillText');
        const streamTimerOverlay = document.getElementById('streamTimerOverlay');
        const videoThumbSidebar = document.getElementById('videoThumbSidebar');
        const capturedImagesGrid = document.getElementById('capturedImagesGrid');
        const realEvdAudio = document.getElementById('realEvdAudio');
        const audioPlayerRow = document.getElementById('audioPlayerRow');
        const audioWaveformGraphic = document.getElementById('audioWaveformGraphic');
        const audioEmptyPlaceholder = document.getElementById('audioEmptyPlaceholder');
        const evidenceSummaryList = document.getElementById('evidenceSummaryList');

        // Reset elements
        if (realEvdVideo) {
            realEvdVideo.pause();
            realEvdVideo.src = '';
            realEvdVideo.style.display = 'none';
        }
        if (realEvdAudio) {
            realEvdAudio.pause();
            realEvdAudio.src = '';
        }
        if (audioPlayerRow) audioPlayerRow.style.display = 'none';
        if (audioWaveformGraphic) audioWaveformGraphic.style.display = 'none';

        // Extract sos_id
        let targetSosId = alert.sos_id || null;
        if (!targetSosId && alert.message && alert.message.includes('[SOS:')) {
            const m = alert.message.match(/\[SOS:(.*?)\]/);
            if (m && m[1]) targetSosId = m[1];
        }

        if (!targetSosId) {
            if (videoEmptyPlaceholder) {
                videoEmptyPlaceholder.style.display = 'flex';
                if (videoEmptyTitle) videoEmptyTitle.innerText = "No evidence session attached to this alert";
            }
            if (audioEmptyPlaceholder) audioEmptyPlaceholder.style.display = 'flex';
            if (capturedImagesGrid) {
                capturedImagesGrid.innerHTML = `
                    <div class="empty-state-card" style="grid-column: span 2;">
                        <i class="las la-images"></i>
                        <p>No snapshots captured for this alert</p>
                    </div>
                `;
            }
            if (evidenceSummaryList) {
                evidenceSummaryList.innerHTML = `<div class="empty-state-card"><p>No evidence records attached</p></div>`;
            }
            return;
        }

        try {
            // Query sos_evidence table for records linked to this sos_id
            const { data: evidenceRecords, error } = await supabase
                .from('sos_evidence')
                .select('*')
                .eq('sos_id', targetSosId);

            if (error || !evidenceRecords || evidenceRecords.length === 0) {
                if (videoEmptyPlaceholder) {
                    videoEmptyPlaceholder.style.display = 'flex';
                    if (videoEmptyTitle) videoEmptyTitle.innerText = "No evidence recordings found in vault";
                }
                if (audioEmptyPlaceholder) audioEmptyPlaceholder.style.display = 'flex';
                if (evidenceSummaryList) {
                    evidenceSummaryList.innerHTML = `<div class="empty-state-card"><p>Zero evidence files uploaded</p></div>`;
                }
                return;
            }

            // Evidence summary tab
            if (evidenceSummaryList) {
                evidenceSummaryList.innerHTML = evidenceRecords.map(r => `
                    <div class="evd-row">
                        <span><b>${r.evidence_type.toUpperCase()}:</b> ${r.file_name}</span>
                        <strong style="color:${r.status === 'UPLOADED' ? '#0ABF78' : '#FF9F1C'};">${r.status}</strong>
                    </div>
                `).join('');
            }

            // 1. VIDEO EVIDENCE
            const videoRecord = evidenceRecords.find(e => e.evidence_type === 'video' && e.status === 'UPLOADED');
            if (videoRecord && videoRecord.storage_path) {
                // Generate secure signed URL from Supabase Storage
                const { data: signedData, error: signErr } = await supabase.storage
                    .from('jagruthi-evidence')
                    .createSignedUrl(videoRecord.storage_path, 3600);

                if (signedData && signedData.signedUrl && !signErr) {
                    if (videoEmptyPlaceholder) videoEmptyPlaceholder.style.display = 'none';
                    if (realEvdVideo) {
                        realEvdVideo.onerror = () => {
                            realEvdVideo.style.display = 'none';
                            if (videoEmptyPlaceholder) {
                                videoEmptyPlaceholder.style.display = 'flex';
                                if (videoEmptyTitle) videoEmptyTitle.innerText = "Video file not found in storage bucket (404)";
                            }
                        };
                        realEvdVideo.src = signedData.signedUrl;
                        realEvdVideo.style.display = 'block';
                    }
                    if (streamLivePill) {
                        streamLivePill.style.display = 'flex';
                        if (streamPillText) streamPillText.innerText = "RECORDED VAULT";
                    }
                    if (streamTimerOverlay) {
                        streamTimerOverlay.style.display = 'block';
                        streamTimerOverlay.innerText = parseUtcDate(videoRecord.captured_at).toLocaleTimeString();
                    }

                    // Populate thumbnails
                    if (videoThumbSidebar) {
                        videoThumbSidebar.innerHTML = `
                            <div class="thumb-card active">
                                <video src="${signedData.signedUrl}" style="width:100%; height:100%; object-fit:cover;"></video>
                                <span class="thumb-pill-live">VIDEO</span>
                            </div>
                        `;
                    }
                } else {
                    if (videoEmptyPlaceholder) {
                        videoEmptyPlaceholder.style.display = 'flex';
                        if (videoEmptyTitle) videoEmptyTitle.innerText = signErr?.message || "Storage file inaccessible";
                    }
                }
            } else {
                if (videoEmptyPlaceholder) {
                    videoEmptyPlaceholder.style.display = 'flex';
                    const isUploading = evidenceRecords.some(e => e.evidence_type === 'video' && e.status === 'UPLOADING');
                    if (videoEmptyTitle) videoEmptyTitle.innerText = isUploading ? "Video recording is uploading..." : "No video file attached";
                }
            }

            // 2. AUDIO EVIDENCE
            const audioRecord = evidenceRecords.find(e => e.evidence_type === 'audio' && e.status === 'UPLOADED');
            if (audioRecord && audioRecord.storage_path) {
                const { data: signedAudio, error: signAudioErr } = await supabase.storage
                    .from('jagruthi-evidence')
                    .createSignedUrl(audioRecord.storage_path, 3600);

                if (signedAudio && signedAudio.signedUrl && !signAudioErr) {
                    if (audioEmptyPlaceholder) audioEmptyPlaceholder.style.display = 'none';
                    if (audioWaveformGraphic) audioWaveformGraphic.style.display = 'flex';
                    if (audioPlayerRow) audioPlayerRow.style.display = 'flex';
                    if (realEvdAudio) {
                        realEvdAudio.onerror = () => {
                            if (audioPlayerRow) audioPlayerRow.style.display = 'none';
                            if (audioWaveformGraphic) audioWaveformGraphic.style.display = 'none';
                            if (audioEmptyPlaceholder) audioEmptyPlaceholder.style.display = 'flex';
                        };
                        realEvdAudio.src = signedAudio.signedUrl;
                        realEvdAudio.style.display = 'block';
                    }
                } else {
                    if (audioEmptyPlaceholder) audioEmptyPlaceholder.style.display = 'flex';
                }
            } else {
                if (audioEmptyPlaceholder) audioEmptyPlaceholder.style.display = 'flex';
            }

        } catch (e) {
            console.error("Exception loading evidence files:", e);
        }
    }

    // SECTION F: Nearby Resources (Police stations from users table)
    async function loadNearbyPoliceStations() {
        const container = document.getElementById('listResPolice');
        if (!container || !supabase) return;

        try {
            const { data: officers, error } = await supabase
                .from('users')
                .select('id, full_name, phone, police_station, officer_id')
                .eq('role', 'police');

            if (error || !officers || officers.length === 0) {
                container.innerHTML = `
                    <div class="empty-state-card">
                        <i class="las la-shield-alt"></i>
                        <p>No police officers registered in database</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = officers.map((officer, index) => {
                const stationName = officer.police_station ? `${officer.police_station} Station` : `${officer.full_name}'s Unit`;
                return `
                    <div class="resource-row-item">
                        <div class="resource-icon-circle"><i class="las la-shield-alt"></i></div>
                        <div class="resource-meta">
                            <strong class="res-name">${stationName}</strong>
                            <span class="res-dist">Officer: ${officer.full_name} (${officer.phone})</span>
                        </div>
                        <button class="btn-res-navigate" onclick="focusActiveAlertOnMap();">
                            <i class="las la-location-arrow"></i> Dispatch
                        </button>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.warn("Could not load police stations:", e);
        }
    }

    /* ==========================================================================
       6B. REAL-TIME POLICE PATROL TRACKING & PATROL FLEET MANAGEMENT
       ========================================================================== */

    // In-memory state for patrol fleet
    let fleetSearchQuery = '';
    let fleetStatusFilter = 'all';
    let fleetSourceFilter = 'all';
    let tempPickerMarker = null;
    let pickingPatrolUnit = null;
    let miniPickerMap = null;
    let miniPickerMarker = null;
    let deletingPatrolUnitId = null;

    /**
     * Parses stored police_units record fields into structured patrol attributes.
     * Supports formats: "PATROL-001 [KA-04-G-1234] [MODE:MANUAL]", "P 108 (Cheetah-04)", "P 102"
     */
    function parsePatrolUnitData(unit) {
        let cleanPatrolId = unit.officer_id || `P-${(unit.id || '').substring(0, 5)}`;
        let vehicleReg = '';
        let locationMode = 'gps'; // 'gps' | 'manual'
        let unitCallsign = 'Patrol Unit';

        const rawId = unit.officer_id || '';

        // Check explicit mode tag: [MODE:MANUAL] or [MODE:GPS]
        const modeMatch = rawId.match(/\[MODE:(MANUAL|GPS)\]/i);
        if (modeMatch) {
            locationMode = modeMatch[1].toLowerCase();
        }

        // Check vehicle registration: [KA-04-G-1234]
        const vehMatch = rawId.match(/\[([^\]]+)\]/);
        if (vehMatch && !vehMatch[1].startsWith('MODE:')) {
            vehicleReg = vehMatch[1].trim();
        } else {
            // Check parentheses fallback: (Cheetah-04)
            const parenMatch = rawId.match(/\(([^)]+)\)/);
            if (parenMatch) vehicleReg = parenMatch[1].trim();
        }

        // Clean Patrol ID (remove tags)
        cleanPatrolId = rawId
            .replace(/\[MODE:[^\]]+\]/gi, '')
            .replace(/\[[^\]]+\]/g, '')
            .replace(/\([^)]+\)/g, '')
            .trim();
        if (!cleanPatrolId) cleanPatrolId = unit.officer_id || 'PATROL';

        // Officer name & Unit Callsign
        let officerName = unit.officer_name || 'Police Officer';
        const unitNameMatch = officerName.match(/\(([^)]+)\)/);
        if (unitNameMatch) {
            unitCallsign = unitNameMatch[1].trim();
            officerName = officerName.replace(/\([^)]+\)/g, '').trim();
        } else if (vehicleReg) {
            unitCallsign = vehicleReg;
        }

        return {
            cleanPatrolId,
            unitCallsign,
            officerName,
            vehicleReg,
            locationMode
        };
    }

    /**
     * Queries Supabase for registered police_units and matching live_locations telemetry.
     * Evaluates location mode, coordinate freshness, and updates UI metrics and markers.
     */
    async function fetchRealPatrolUnits() {
        if (!supabase) return;

        try {
            // 1. Query police_units table
            let { data: units, error } = await supabase
                .from('police_units')
                .select('*')
                .order('created_at', { ascending: false });

            if (error || !units) {
                console.error("Error fetching police_units:", error);
                return;
            }

            // Exclude administrator Vineet from field patrol registry
            units = units.filter(u => {
                const name = (u.officer_name || '').toLowerCase();
                const id = (u.officer_id || '').toLowerCase();
                const phone = u.phone || '';
                return !name.includes('vineet') && !id.includes('vineet') && phone !== '9876543222';
            });

            // 2. Query latest live_locations for patrol officers
            const phones = units.map(u => u.phone).filter(Boolean);
            const locsByPhone = new Map();

            if (phones.length > 0) {
                const { data: locs } = await supabase
                    .from('live_locations')
                    .select('*')
                    .in('user_phone', phones)
                    .order('created_at', { ascending: false });

                (locs || []).forEach(l => {
                    if (!locsByPhone.has(l.user_phone)) {
                        locsByPhone.set(l.user_phone, []);
                    }
                    locsByPhone.get(l.user_phone).push(l);
                });
            }

            // 3. Merge telemetry according to configured location mode & evaluate freshness
            realPatrolUnits = units.map(u => {
                const parsed = parsePatrolUnitData(u);
                const unitLocs = locsByPhone.get(u.phone) || [];

                let targetLoc = null;
                let effectiveSource = parsed.locationMode === 'manual' ? 'Manual' : 'GPS';

                if (parsed.locationMode === 'manual') {
                    // Manual mode: prioritize latest manual coordinates
                    targetLoc = unitLocs.find(l => (l.travel_mode || '').toUpperCase().includes('MANUAL'));
                    if (!targetLoc && unitLocs.length > 0) {
                        targetLoc = unitLocs[0];
                    }
                    effectiveSource = 'Manual';
                } else {
                    // GPS mode: prioritize latest GPS telemetry
                    targetLoc = unitLocs.find(l => !(l.travel_mode || '').toUpperCase().includes('MANUAL'));
                    if (!targetLoc && unitLocs.length > 0) {
                        targetLoc = unitLocs[0];
                    }
                    effectiveSource = (targetLoc?.travel_mode || '').toUpperCase().includes('MANUAL') ? 'Manual' : 'GPS';
                }

                const hasCoords = targetLoc && targetLoc.latitude != null && targetLoc.longitude != null;
                const lat = hasCoords ? parseFloat(targetLoc.latitude) : null;
                const lng = hasCoords ? parseFloat(targetLoc.longitude) : null;
                const locTime = targetLoc?.created_at ? parseUtcDate(targetLoc.created_at) : null;

                // Freshness Policy:
                // Manual: fresh if < 60 minutes. Stale if >= 60 minutes.
                // GPS: fresh if < 10 minutes. Stale if >= 10 minutes.
                let freshness = 'missing';
                let isStale = false;
                let freshnessLabel = 'Missing Location';

                if (hasCoords && locTime) {
                    const ageMs = Date.now() - locTime.getTime();
                    const ageMins = Math.round(ageMs / 60000);
                    if (effectiveSource === 'Manual') {
                        if (ageMs < 60 * 60 * 1000) {
                            freshness = 'current';
                            freshnessLabel = `Current (${ageMins}m ago)`;
                        } else {
                            freshness = 'stale';
                            isStale = true;
                            freshnessLabel = `Stale (> 60m)`;
                        }
                    } else {
                        // GPS
                        if (ageMs < 10 * 60 * 1000) {
                            freshness = 'current';
                            freshnessLabel = `Live GPS (${ageMins}m ago)`;
                        } else {
                            freshness = 'stale';
                            isStale = true;
                            freshnessLabel = `Stale GPS (${formatRelativeTime(locTime)})`;
                        }
                    }
                }

                return {
                    ...u,
                    ...parsed,
                    latitude: lat,
                    longitude: lng,
                    locationSource: effectiveSource,
                    lastLocationTime: locTime,
                    freshness,
                    isStale,
                    freshnessLabel,
                    travelMode: targetLoc?.travel_mode || 'Patrol Unit',
                    calculatedDistance: null,
                    calculatedEta: null
                };
            });

            // 4. Update Summary Metrics
            updateFleetSummaryMetrics();

            // 5. Render Patrol Management Table
            renderFleetTable();

            // 6. If active emergency alert is selected, calculate nearest unit ranking
            const currentAlert = realAlertsList.find(a => a.id === selectedAlertId);
            if (currentAlert && currentAlert.latitude && currentAlert.longitude) {
                await calculateNearestPatrolRecommendations(currentAlert);
            } else {
                renderPatrolUnitsList(realPatrolUnits);
            }

            // 7. Clean up any citizen layer markers that belong to patrol units
            realPatrolUnits.forEach(u => {
                if (u.phone && activeCitizenMarkers.has(u.phone)) {
                    layerUsersGroup.removeLayer(activeCitizenMarkers.get(u.phone));
                    activeCitizenMarkers.delete(u.phone);
                }
            });

            // 8. Update Leaflet Map Markers
            updatePatrolMapMarkers();

        } catch (e) {
            console.error("Exception fetching real patrol units:", e);
        }
    }

    /**
     * Updates the 4 Fleet Metrics and Sidebar Badge
     */
    function updateFleetSummaryMetrics() {
        const total = realPatrolUnits.length;
        const available = realPatrolUnits.filter(u => u.status === 'available').length;
        const assigned = realPatrolUnits.filter(u => u.status === 'assigned').length;
        const staleOrMissing = realPatrolUnits.filter(u => u.isStale || u.freshness === 'missing').length;

        const statTotal = document.getElementById('statTotalPatrols');
        const statAvail = document.getElementById('statAvailablePatrols');
        const statAssigned = document.getElementById('statAssignedPatrols');
        const statStale = document.getElementById('statStalePatrols');
        const polPatrolBadge = document.getElementById('polPatrolBadge');

        if (statTotal) statTotal.innerText = total;
        if (statAvail) statAvail.innerText = available;
        if (statAssigned) statAssigned.innerText = assigned;
        if (statStale) statStale.innerText = staleOrMissing;
        if (polPatrolBadge) polPatrolBadge.innerText = total;
    }

    /**
     * Renders the comprehensive Patrol Fleet Management Table with filters and search
     */
    function renderFleetTable() {
        const tbody = document.getElementById('patrolUnitsTableBody');
        if (!tbody) return;

        // Apply filters
        let filtered = [...realPatrolUnits];

        // Search query
        if (fleetSearchQuery) {
            const q = fleetSearchQuery.toLowerCase();
            filtered = filtered.filter(u =>
                (u.cleanPatrolId && u.cleanPatrolId.toLowerCase().includes(q)) ||
                (u.unitCallsign && u.unitCallsign.toLowerCase().includes(q)) ||
                (u.officerName && u.officerName.toLowerCase().includes(q)) ||
                (u.phone && u.phone.includes(q)) ||
                (u.vehicleReg && u.vehicleReg.toLowerCase().includes(q)) ||
                (u.station_name && u.station_name.toLowerCase().includes(q))
            );
        }

        // Status filter
        if (fleetStatusFilter !== 'all') {
            filtered = filtered.filter(u => u.status === fleetStatusFilter);
        }

        // Source filter
        if (fleetSourceFilter !== 'all') {
            if (fleetSourceFilter === 'gps') filtered = filtered.filter(u => u.locationSource === 'GPS');
            else if (fleetSourceFilter === 'manual') filtered = filtered.filter(u => u.locationSource === 'Manual');
            else if (fleetSourceFilter === 'missing') filtered = filtered.filter(u => u.freshness === 'missing');
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="fleet-table-empty">
                        <i class="las la-search"></i>
                        <span>No patrol units matching the selected filter criteria</span>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(unit => {
            // Status Badge
            let statusPillClass = 'badge-available';
            let statusText = 'Available';
            if (unit.status === 'assigned') { statusPillClass = 'badge-assigned'; statusText = 'Assigned'; }
            else if (unit.status === 'unavailable') { statusPillClass = 'badge-offline'; statusText = 'Unavailable'; }
            else if (unit.status === 'off_duty') { statusPillClass = 'badge-offline'; statusText = 'Off Duty'; }

            // Location Source Badge (GPS vs MANUAL LOCATION)
            const isManual = unit.locationSource === 'Manual';
            const sourceBadgeHtml = isManual
                ? `<span class="patrol-source-badge badge-manual"><i class="las la-crosshairs"></i> MANUAL LOCATION</span>`
                : `<span class="patrol-source-badge badge-gps"><i class="las la-satellite-dish"></i> GPS Telemetry</span>`;

            // Freshness Badge
            let freshClass = 'fresh-current';
            let freshIcon = 'la-check-circle';
            if (unit.freshness === 'stale') {
                freshClass = 'fresh-stale';
                freshIcon = 'la-exclamation-triangle';
            } else if (unit.freshness === 'missing') {
                freshClass = 'fresh-missing';
                freshIcon = 'la-question-circle';
            }
            const freshnessHtml = `<span class="freshness-badge ${freshClass}"><i class="las ${freshIcon}"></i> ${unit.freshnessLabel}</span>`;

            // Coordinates Display
            const coordsText = unit.latitude && unit.longitude
                ? `${unit.latitude.toFixed(5)}, ${unit.longitude.toFixed(5)}`
                : '<span class="text-muted">Not Set</span>';

            // Last Updated
            const updatedText = unit.lastLocationTime ? formatRelativeTime(unit.lastLocationTime) : 'Never';

            // Current Assignment
            let assignmentHtml = '<span class="text-muted">—</span>';
            if (unit.status === 'assigned') {
                assignmentHtml = `<span class="badge-assigned" style="font-size:0.75rem;"><i class="las la-shield-alt"></i> Active Incident</span>`;
            }

            // Mode toggle action label
            const modeToggleText = isManual ? 'Switch to GPS' : 'Switch to Manual';
            const modeToggleIcon = isManual ? 'la-satellite-dish' : 'la-crosshairs';

            return `
                <tr id="patrolRow-${unit.id}">
                    <td>
                        <div class="patrol-cell-id">
                            <div class="patrol-avatar-icon"><i class="las la-car"></i></div>
                            <div class="patrol-title-col">
                                <strong>${unit.cleanPatrolId}</strong>
                                <small>${unit.unitCallsign} · ${unit.station_name || 'Station'}</small>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="patrol-officer-col">
                            <strong>${unit.officerName}</strong>
                            <small><i class="las la-phone"></i> ${unit.phone || 'N/A'}</small>
                        </div>
                    </td>
                    <td>
                        ${unit.vehicleReg ? `<span class="patrol-veh-plate">${unit.vehicleReg}</span>` : '<span class="text-muted">—</span>'}
                    </td>
                    <td>
                        <span class="patrol-badge-status ${statusPillClass}">${statusText}</span>
                    </td>
                    <td>
                        <div style="font-size:0.78rem;">
                            <strong>${coordsText}</strong>
                        </div>
                    </td>
                    <td>
                        <div>
                            ${sourceBadgeHtml}
                            ${freshnessHtml}
                        </div>
                    </td>
                    <td>
                        <span style="font-size:0.78rem; color:#64748B;"><i class="las la-clock"></i> ${updatedText}</span>
                    </td>
                    <td>
                        ${assignmentHtml}
                    </td>
                    <td style="text-align: right;">
                        <div class="patrol-actions-cell">
                            <button class="btn-row-action btn-action-loc" onclick="window.openPatrolLocationModal('${unit.id}');" title="Set Coordinates">
                                <i class="las la-map-pin"></i> Location
                            </button>
                            <button class="btn-row-action" onclick="window.togglePatrolLocationMode('${unit.id}');" title="${modeToggleText}">
                                <i class="las ${modeToggleIcon}"></i> ${isManual ? 'GPS' : 'Manual'}
                            </button>
                            <button class="btn-row-action" onclick="window.openEditPatrolModal('${unit.id}');" title="Edit Unit">
                                <i class="las la-edit"></i>
                            </button>
                            <button class="btn-row-action btn-action-del" onclick="window.openDeletePatrolModal('${unit.id}');" title="Deactivate / Delete">
                                <i class="las la-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Toggle a patrol unit between Manual Location mode and GPS Telemetry mode
     */
    window.togglePatrolLocationMode = async function(unitId) {
        const unit = realPatrolUnits.find(u => u.id === unitId);
        if (!unit || !supabase) return;

        const newMode = unit.locationMode === 'manual' ? 'GPS' : 'MANUAL';
        const confirmMsg = newMode === 'GPS'
            ? `Switch ${unit.cleanPatrolId} to live GPS Telemetry mode? It will follow device GPS signals from patrol units.`
            : `Switch ${unit.cleanPatrolId} to Manual Location mode? Coordinates will be manually controlled by command.`;

        if (!confirm(confirmMsg)) return;

        try {
            const updatedOfficerId = `${unit.cleanPatrolId} [${unit.vehicleReg || 'N/A'}] [MODE:${newMode}]`;
            const { error } = await supabase
                .from('police_units')
                .update({ officer_id: updatedOfficerId })
                .eq('id', unit.id);

            if (error) throw error;
            await fetchRealPatrolUnits();
        } catch (err) {
            console.error("Failed to toggle patrol location mode:", err);
            alert("Error updating location mode: " + err.message);
        }
    };

    /**
     * Method A: Interactive Leaflet Map Selection Mode on main policeMap
     */
    window.startMapLocationPicker = function(unitId) {
        const unit = realPatrolUnits.find(u => u.id === unitId);
        if (!unit || !policeMap) return;

        pickingPatrolUnit = unit;

        // Close any open modals
        closeAllPatrolModals();

        // Scroll to policeMap
        const mapCard = document.querySelector('.map-panel-card');
        if (mapCard) mapCard.scrollIntoView({ behavior: 'smooth' });
        policeMap.invalidateSize();

        // Setup banner
        const banner = document.getElementById('mapLocationPickerBanner');
        const unitNameSpan = document.getElementById('pickerTargetUnitName');
        const latSpan = document.getElementById('pickerLatDisplay');
        const lngSpan = document.getElementById('pickerLngDisplay');
        const addrSpan = document.getElementById('pickerAddrDisplay');

        if (unitNameSpan) unitNameSpan.innerText = `${unit.cleanPatrolId} (${unit.officerName})`;
        if (banner) banner.style.display = 'flex';

        // Initial coordinates (patrol's current coordinates or map center)
        let initialLat = unit.latitude || 13.0380;
        let initialLng = unit.longitude || 77.5120;

        if (latSpan) latSpan.innerText = initialLat.toFixed(6);
        if (lngSpan) lngSpan.innerText = initialLng.toFixed(6);

        // Reverse geocode initial point
        reverseGeocode(initialLat, initialLng).then(addr => {
            if (addrSpan) addrSpan.innerText = addr;
        });

        // Create draggable temporary marker
        if (tempPickerMarker) {
            policeMap.removeLayer(tempPickerMarker);
        }

        const pickerIcon = L.divIcon({
            html: `
                <div style="position:relative; display:flex; align-items:center; justify-content:center;">
                    <div style="width:36px; height:36px; border-radius:50%; background:#D97706; border:3px solid #FFFFFF; box-shadow:0 0 16px rgba(217,119,6,0.9); display:flex; align-items:center; justify-content:center; color:white; font-size:16px; cursor:move;">
                        <i class="las la-car"></i>
                    </div>
                    <div style="position:absolute; bottom:40px; left:50%; transform:translateX(-50%); white-space:nowrap; background:#0D1535; color:#FCD34D; font-size:11px; font-weight:800; padding:2px 8px; border-radius:6px; border:1px solid #FCD34D;">
                        📍 DRAG TO PLACE: ${unit.cleanPatrolId}
                    </div>
                </div>
            `,
            className: '',
            iconSize: [44, 44],
            iconAnchor: [22, 22]
        });

        tempPickerMarker = L.marker([initialLat, initialLng], {
            icon: pickerIcon,
            draggable: true
        }).addTo(policeMap);

        policeMap.setView([initialLat, initialLng], 15);

        // Marker drag handler
        tempPickerMarker.on('drag', (e) => {
            const pos = e.target.getLatLng();
            if (latSpan) latSpan.innerText = pos.lat.toFixed(6);
            if (lngSpan) lngSpan.innerText = pos.lng.toFixed(6);
        });

        tempPickerMarker.on('dragend', async (e) => {
            const pos = e.target.getLatLng();
            const addr = await reverseGeocode(pos.lat, pos.lng);
            if (addrSpan) addrSpan.innerText = addr;
        });

        // Map click handler (moves marker to click location)
        policeMap.on('click', onMapLocationPickerClick);
    };

    async function onMapLocationPickerClick(e) {
        if (!tempPickerMarker) return;
        tempPickerMarker.setLatLng(e.latlng);

        const latSpan = document.getElementById('pickerLatDisplay');
        const lngSpan = document.getElementById('pickerLngDisplay');
        const addrSpan = document.getElementById('pickerAddrDisplay');

        if (latSpan) latSpan.innerText = e.latlng.lat.toFixed(6);
        if (lngSpan) lngSpan.innerText = e.latlng.lng.toFixed(6);

        const addr = await reverseGeocode(e.latlng.lat, e.latlng.lng);
        if (addrSpan) addrSpan.innerText = addr;
    }

    function stopMapLocationPicker() {
        const banner = document.getElementById('mapLocationPickerBanner');
        if (banner) banner.style.display = 'none';

        if (tempPickerMarker && policeMap) {
            policeMap.removeLayer(tempPickerMarker);
            tempPickerMarker = null;
        }

        if (policeMap) {
            policeMap.off('click', onMapLocationPickerClick);
        }

        pickingPatrolUnit = null;
    }

    // Cancel map picker button
    const btnCancelMapPicker = document.getElementById('btnCancelMapPicker');
    if (btnCancelMapPicker) {
        btnCancelMapPicker.addEventListener('click', () => {
            if (isRegisteringMapPicker) {
                stopMapLocationPicker();
                isRegisteringMapPicker = false;
                const modal = document.getElementById('patrolRegistrationModal');
                const overlay = document.getElementById('patrolRegOverlay');
                if (modal) modal.classList.add('show');
                if (overlay) overlay.classList.add('show');
            } else {
                stopMapLocationPicker();
            }
        });
    }

    // Confirm map picker button
    const btnConfirmMapPicker = document.getElementById('btnConfirmMapPicker');
    if (btnConfirmMapPicker) {
        btnConfirmMapPicker.addEventListener('click', async () => {
            if (!tempPickerMarker) return;

            // Scenario A: Pinned for new patrol registration
            if (isRegisteringMapPicker) {
                const pos = tempPickerMarker.getLatLng();
                stopMapLocationPicker();
                isRegisteringMapPicker = false;

                const modal = document.getElementById('patrolRegistrationModal');
                const overlay = document.getElementById('patrolRegOverlay');
                if (modal) modal.classList.add('show');
                if (overlay) overlay.classList.add('show');

                syncRegInputs(pos.lat, pos.lng, true);
                if (regMiniMap && regMiniMarker) {
                    regMiniMap.setView([pos.lat, pos.lng], 14);
                    regMiniMarker.setLatLng([pos.lat, pos.lng]);
                    regMiniMap.invalidateSize();
                }
                return;
            }

            // Scenario B: Pinned for existing patrol unit
            if (!pickingPatrolUnit || !supabase) return;

            const pos = tempPickerMarker.getLatLng();
            btnConfirmMapPicker.disabled = true;
            btnConfirmMapPicker.innerHTML = '<i class="las la-spinner la-spin"></i> Saving...';

            try {
                // 1. Insert into live_locations with MANUAL tag
                await supabase.from('live_locations').insert([{
                    user_phone: pickingPatrolUnit.phone,
                    latitude: parseFloat(pos.lat.toFixed(6)),
                    longitude: parseFloat(pos.lng.toFixed(6)),
                    travel_mode: `MANUAL | ${pickingPatrolUnit.vehicleReg || 'Patrol Unit'}`,
                    alert_status: pickingPatrolUnit.status || 'available',
                    created_at: new Date().toISOString()
                }]);

                // 2. Set unit mode to MANUAL in police_units
                const updatedOfficerId = `${pickingPatrolUnit.cleanPatrolId} [${pickingPatrolUnit.vehicleReg || 'N/A'}] [MODE:MANUAL]`;
                await supabase
                    .from('police_units')
                    .update({ officer_id: updatedOfficerId })
                    .eq('id', pickingPatrolUnit.id);

                stopMapLocationPicker();
                await fetchRealPatrolUnits();

                alert(`Coordinates saved for ${pickingPatrolUnit.cleanPatrolId}! Location mode switched to MANUAL.`);
            } catch (err) {
                console.error("Failed to save coordinates:", err);
                alert("Error saving coordinates: " + err.message);
            } finally {
                btnConfirmMapPicker.disabled = false;
                btnConfirmMapPicker.innerHTML = '<i class="las la-check"></i> Save Coordinates';
            }
        });
    }

    /**
     * Location Modal Handler (Method A: Embedded Leaflet Mini-Map, Method B: Coordinate Inputs)
     */
    let activeLocationTargetUnit = null;

    window.openPatrolLocationModal = function(unitId) {
        const unit = realPatrolUnits.find(u => u.id === unitId);
        if (!unit) return;

        activeLocationTargetUnit = unit;

        const modal = document.getElementById('patrolLocationModal');
        const overlay = document.getElementById('patrolLocOverlay');
        const subTitle = document.getElementById('patrolLocModalSubtitle');
        const latInput = document.getElementById('inputManualLat');
        const lngInput = document.getElementById('inputManualLng');
        const addrText = document.getElementById('manualAddrPreviewText');

        if (subTitle) subTitle.innerText = `Target Unit: ${unit.cleanPatrolId} (${unit.officerName})`;

        // Default or current coordinates
        const initLat = unit.latitude || 13.0380;
        const initLng = unit.longitude || 77.5120;

        if (latInput) latInput.value = initLat.toFixed(6);
        if (lngInput) lngInput.value = initLng.toFixed(6);

        if (modal) modal.classList.add('show');
        if (overlay) overlay.classList.add('show');

        // Initial reverse geocode
        reverseGeocode(initLat, initLng).then(addr => {
            if (addrText) addrText.innerText = addr;
        });

        // Initialize / Refresh Mini Leaflet Map & reset active tab to Map
        const btnMethodMap = document.getElementById('btnMethodMap');
        const btnMethodCoords = document.getElementById('btnMethodCoords');
        const methodMapContainer = document.getElementById('methodMapContainer');
        if (btnMethodMap) btnMethodMap.classList.add('active');
        if (btnMethodCoords) btnMethodCoords.classList.remove('active');
        if (methodMapContainer) methodMapContainer.style.display = 'flex';

        setTimeout(() => {
            initOrUpdateMiniPickerMap(initLat, initLng);
        }, 150);
        setTimeout(() => {
            if (miniPickerMap) miniPickerMap.invalidateSize();
        }, 300);
    };

    function initOrUpdateMiniPickerMap(lat, lng) {
        const container = document.getElementById('patrolPickerMiniMap');
        if (!container) return;

        if (!miniPickerMap) {
            miniPickerMap = L.map('patrolPickerMiniMap', { zoomControl: true }).setView([lat, lng], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(miniPickerMap);

            const miniIcon = L.divIcon({
                html: `
                    <div style="width:30px; height:30px; border-radius:50%; background:#D97706; border:3px solid #FFFFFF; box-shadow:0 0 12px rgba(217,119,6,0.8); display:flex; align-items:center; justify-content:center; color:white; font-size:14px; cursor:move;">
                        <i class="las la-car"></i>
                    </div>
                `,
                className: '',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            miniPickerMarker = L.marker([lat, lng], { icon: miniIcon, draggable: true }).addTo(miniPickerMap);

            miniPickerMarker.on('drag', (e) => {
                const pos = e.target.getLatLng();
                syncManualInputs(pos.lat, pos.lng, false);
            });

            miniPickerMarker.on('dragend', (e) => {
                const pos = e.target.getLatLng();
                syncManualInputs(pos.lat, pos.lng, true);
            });

            miniPickerMap.on('click', (e) => {
                miniPickerMarker.setLatLng(e.latlng);
                syncManualInputs(e.latlng.lat, e.latlng.lng, true);
            });
        } else {
            miniPickerMap.setView([lat, lng], 14);
            miniPickerMarker.setLatLng([lat, lng]);
            miniPickerMap.invalidateSize();
        }
    }

    // Modal Tabs Switching (Interactive Map vs Direct Coordinate Entry)
    const btnMethodMap = document.getElementById('btnMethodMap');
    const btnMethodCoords = document.getElementById('btnMethodCoords');
    const methodMapContainer = document.getElementById('methodMapContainer');

    if (btnMethodMap && btnMethodCoords) {
        btnMethodMap.addEventListener('click', () => {
            btnMethodMap.classList.add('active');
            btnMethodCoords.classList.remove('active');
            if (methodMapContainer) methodMapContainer.style.display = 'flex';
            if (miniPickerMap) {
                setTimeout(() => miniPickerMap.invalidateSize(), 50);
            }
        });

        btnMethodCoords.addEventListener('click', () => {
            btnMethodCoords.classList.add('active');
            btnMethodMap.classList.remove('active');
            if (methodMapContainer) methodMapContainer.style.display = 'none';
            const latInput = document.getElementById('inputManualLat');
            if (latInput) latInput.focus();
        });
    }

    function syncManualInputs(lat, lng, fetchAddr) {
        const latInput = document.getElementById('inputManualLat');
        const lngInput = document.getElementById('inputManualLng');
        const addrText = document.getElementById('manualAddrPreviewText');

        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);

        if (fetchAddr && addrText) {
            reverseGeocode(lat, lng).then(addr => {
                addrText.innerText = addr;
            });
        }
    }

    function closePatrolLocationModal() {
        const modal = document.getElementById('patrolLocationModal');
        const overlay = document.getElementById('patrolLocOverlay');
        if (modal) modal.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
        activeLocationTargetUnit = null;
    }

    const btnClosePatrolLocModal = document.getElementById('btnClosePatrolLocModal');
    const btnCancelManualLoc = document.getElementById('btnCancelManualLoc');
    const btnSaveManualLocation = document.getElementById('btnSaveManualLocation');

    if (btnClosePatrolLocModal) btnClosePatrolLocModal.onclick = closePatrolLocationModal;
    if (btnCancelManualLoc) btnCancelManualLoc.onclick = closePatrolLocationModal;

    // Direct input change listener (bounds validation and map update)
    const inputManualLat = document.getElementById('inputManualLat');
    const inputManualLng = document.getElementById('inputManualLng');

    function onCoordinateInputChange() {
        if (!inputManualLat || !inputManualLng) return;
        const lat = parseFloat(inputManualLat.value);
        const lng = parseFloat(inputManualLng.value);

        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            if (miniPickerMarker && miniPickerMap) {
                miniPickerMarker.setLatLng([lat, lng]);
                miniPickerMap.setView([lat, lng], miniPickerMap.getZoom());
            }
            reverseGeocode(lat, lng).then(addr => {
                const addrText = document.getElementById('manualAddrPreviewText');
                if (addrText) addrText.innerText = addr;
            });
        }
    }

    if (inputManualLat) inputManualLat.addEventListener('input', onCoordinateInputChange);
    if (inputManualLng) inputManualLng.addEventListener('input', onCoordinateInputChange);

    // Quick presets
    document.querySelectorAll('.btn-preset-pill[data-lat]').forEach(btn => {
        btn.addEventListener('click', () => {
            const lat = parseFloat(btn.dataset.lat);
            const lng = parseFloat(btn.dataset.lng);
            syncManualInputs(lat, lng, true);
            if (miniPickerMarker && miniPickerMap) {
                miniPickerMarker.setLatLng([lat, lng]);
                miniPickerMap.setView([lat, lng], 15);
            }
        });
    });

    // "Pick on Main Dashboard Map" button in location modal
    const btnPickOnDashboardMap = document.getElementById('btnPickOnDashboardMap');
    if (btnPickOnDashboardMap) {
        btnPickOnDashboardMap.addEventListener('click', () => {
            if (!activeLocationTargetUnit) return;
            const targetId = activeLocationTargetUnit.id;
            closePatrolLocationModal();
            window.startMapLocationPicker(targetId);
        });
    }

    // Save manual coordinates submission
    if (btnSaveManualLocation) {
        btnSaveManualLocation.addEventListener('click', async () => {
            if (!activeLocationTargetUnit || !supabase) return;

            const latInput = document.getElementById('inputManualLat');
            const lngInput = document.getElementById('inputManualLng');

            const lat = parseFloat(latInput?.value);
            const lng = parseFloat(lngInput?.value);

            // Validation: lat between -90 and 90, lng between -180 and 180
            if (isNaN(lat) || lat < -90 || lat > 90) {
                alert("Invalid Latitude: Value must be between -90 and 90.");
                return;
            }
            if (isNaN(lng) || lng < -180 || lng > 180) {
                alert("Invalid Longitude: Value must be between -180 and 180.");
                return;
            }

            btnSaveManualLocation.disabled = true;
            btnSaveManualLocation.innerHTML = '<i class="las la-spinner la-spin"></i> Saving...';

            try {
                // 1. Insert into live_locations with MANUAL tag
                await supabase.from('live_locations').insert([{
                    user_phone: activeLocationTargetUnit.phone,
                    latitude: parseFloat(lat.toFixed(6)),
                    longitude: parseFloat(lng.toFixed(6)),
                    travel_mode: `MANUAL | ${activeLocationTargetUnit.vehicleReg || 'Patrol Unit'}`,
                    alert_status: activeLocationTargetUnit.status || 'available',
                    created_at: new Date().toISOString()
                }]);

                // 2. Set unit mode to MANUAL in police_units
                const updatedOfficerId = `${activeLocationTargetUnit.cleanPatrolId} [${activeLocationTargetUnit.vehicleReg || 'N/A'}] [MODE:MANUAL]`;
                await supabase
                    .from('police_units')
                    .update({ officer_id: updatedOfficerId })
                    .eq('id', activeLocationTargetUnit.id);

                closePatrolLocationModal();
                await fetchRealPatrolUnits();

                alert(`Coordinates saved for ${activeLocationTargetUnit.cleanPatrolId}! Location mode set to MANUAL.`);
            } catch (err) {
                console.error("Failed to save coordinates:", err);
                alert("Error saving coordinates: " + err.message);
            } finally {
                btnSaveManualLocation.disabled = false;
                btnSaveManualLocation.innerHTML = '<i class="las la-check-circle"></i> Save Coordinates';
            }
        });
    }

    /**
     * Patrol Registration & Edit Modal Handler
     */
    let editingUnitRecord = null;

    window.openRegisterPatrolModal = function() {
        editingUnitRecord = null;
        const modal = document.getElementById('patrolRegistrationModal');
        const overlay = document.getElementById('patrolRegOverlay');
        const title = document.getElementById('patrolRegModalTitle');
        const alertBox = document.getElementById('patrolRegAlert');
        const form = document.getElementById('patrolRegistrationForm');
        const editIdInput = document.getElementById('patrolEditUnitId');

        if (title) title.innerText = "Register New Patrol Unit";
        if (alertBox) alertBox.style.display = 'none';
        if (form) form.reset();
        if (editIdInput) editIdInput.value = '';

        // Auto-generate next Patrol ID
        generateNextPatrolId();

        // Default station from session
        const stationInput = document.getElementById('patrolInputStation');
        if (stationInput) stationInput.value = storedStation;

        const regLatInput = document.getElementById('patrolRegLat');
        const regLngInput = document.getElementById('patrolRegLng');
        const regBox = document.getElementById('regManualCoordsBox');
        if (regLatInput) regLatInput.value = '13.038000';
        if (regLngInput) regLngInput.value = '77.512000';
        const modeSelect = document.getElementById('patrolInputLocationMode');
        if (modeSelect) modeSelect.value = 'manual';
        if (regBox) regBox.style.display = 'block';

        const detailsEl = modal.querySelector('.patrol-advanced-toggle');
        if (detailsEl) detailsEl.open = false;

        if (modal) modal.classList.add('show');
        if (overlay) overlay.classList.add('show');

        const nameInput = document.getElementById('patrolInputUnitName');
        if (nameInput) setTimeout(() => nameInput.focus(), 80);

        // Initialize / Refresh Mini Leaflet Map for registration
        setTimeout(() => {
            initOrUpdateRegMiniMap(13.0380, 77.5120);
        }, 100);
        setTimeout(() => {
            if (regMiniMap) regMiniMap.invalidateSize();
        }, 300);
    };

    window.openEditPatrolModal = function(unitId) {
        const unit = realPatrolUnits.find(u => u.id === unitId);
        if (!unit) return;

        editingUnitRecord = unit;

        const modal = document.getElementById('patrolRegistrationModal');
        const overlay = document.getElementById('patrolRegOverlay');
        const title = document.getElementById('patrolRegModalTitle');
        const alertBox = document.getElementById('patrolRegAlert');
        const editIdInput = document.getElementById('patrolEditUnitId');

        if (title) title.innerText = `Edit Patrol Unit: ${unit.cleanPatrolId}`;
        if (alertBox) alertBox.style.display = 'none';
        if (editIdInput) editIdInput.value = unit.id;

        const idInput = document.getElementById('patrolInputId');
        const unitNameInput = document.getElementById('patrolInputUnitName');
        const officerInput = document.getElementById('patrolInputOfficerName');
        const phoneInput = document.getElementById('patrolInputPhone');
        const vehInput = document.getElementById('patrolInputVehicleReg');
        const stationInput = document.getElementById('patrolInputStation');
        const statusSelect = document.getElementById('patrolInputStatus');
        const modeSelect = document.getElementById('patrolInputLocationMode');
        const regLatInput = document.getElementById('patrolRegLat');
        const regLngInput = document.getElementById('patrolRegLng');
        const regBox = document.getElementById('regManualCoordsBox');

        if (idInput) idInput.value = unit.cleanPatrolId;
        if (unitNameInput) unitNameInput.value = unit.unitCallsign;
        if (officerInput) officerInput.value = unit.officerName;
        if (phoneInput) phoneInput.value = unit.phone || '';
        if (vehInput) vehInput.value = unit.vehicleReg || '';
        if (stationInput) stationInput.value = unit.station_name || '';
        if (statusSelect) statusSelect.value = unit.status || 'available';
        if (modeSelect) modeSelect.value = unit.locationMode || 'gps';

        // Prepopulate existing coordinates
        const initLat = (unit.latitude != null) ? unit.latitude : 13.0380;
        const initLng = (unit.longitude != null) ? unit.longitude : 77.5120;
        if (regLatInput) regLatInput.value = initLat.toFixed(6);
        if (regLngInput) regLngInput.value = initLng.toFixed(6);
        if (regBox) regBox.style.display = 'block';

        if (modal) modal.classList.add('show');
        if (overlay) overlay.classList.add('show');

        setTimeout(() => {
            initOrUpdateRegMiniMap(initLat, initLng);
        }, 150);
        setTimeout(() => {
            if (regMiniMap) regMiniMap.invalidateSize();
        }, 300);
    };

    function closePatrolRegModal() {
        const modal = document.getElementById('patrolRegistrationModal');
        const overlay = document.getElementById('patrolRegOverlay');
        if (modal) modal.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
        editingUnitRecord = null;
    }

    const btnOpenRegisterPatrolModal = document.getElementById('btnOpenRegisterPatrolModal');
    const btnClosePatrolRegModal = document.getElementById('btnClosePatrolRegModal');
    const btnCancelPatrolReg = document.getElementById('btnCancelPatrolReg');
    const btnSavePatrolSubmit = document.getElementById('btnSavePatrolSubmit');
    const btnAutoGenerateId = document.getElementById('btnAutoGenerateId');
    const patrolInputLocationMode = document.getElementById('patrolInputLocationMode');

    if (btnOpenRegisterPatrolModal) btnOpenRegisterPatrolModal.onclick = window.openRegisterPatrolModal;
    if (btnClosePatrolRegModal) btnClosePatrolRegModal.onclick = closePatrolRegModal;
    if (btnCancelPatrolReg) btnCancelPatrolReg.onclick = closePatrolRegModal;

    if (patrolInputLocationMode) {
        patrolInputLocationMode.addEventListener('change', () => {
            const regBox = document.getElementById('regManualCoordsBox');
            if (regBox) regBox.style.display = patrolInputLocationMode.value === 'manual' ? 'block' : 'none';
        });
    }

    function generateNextPatrolId() {
        let maxNum = 0;
        realPatrolUnits.forEach(u => {
            const m = (u.cleanPatrolId || '').match(/(\d+)/);
            if (m) {
                const num = parseInt(m[1], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        const nextId = `PATROL-${String(maxNum + 1).padStart(3, '0')}`;
        const idInput = document.getElementById('patrolInputId');
        if (idInput) idInput.value = nextId;
    }

    // Mini Leaflet Map Handler for Patrol Registration
    let regMiniMap = null;
    let regMiniMarker = null;
    let isRegisteringMapPicker = false;

    function initOrUpdateRegMiniMap(lat, lng) {
        const container = document.getElementById('regPatrolMiniMap');
        if (!container) return;

        const regIcon = L.divIcon({
            html: `
                <div class="reg-pin-marker-wrap">
                    <div class="reg-pin-pulse-ring"></div>
                    <div class="reg-pin-bubble">
                        <i class="las la-car"></i>
                    </div>
                    <div class="reg-pin-label-pill">📍 DRAG TO PIN</div>
                </div>
            `,
            className: 'custom-reg-patrol-pin',
            iconSize: [60, 68],
            iconAnchor: [30, 36]
        });

        if (!regMiniMap) {
            regMiniMap = L.map('regPatrolMiniMap', { zoomControl: true }).setView([lat, lng], 14);
            L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps'
            }).addTo(regMiniMap);

            regMiniMarker = L.marker([lat, lng], { icon: regIcon, draggable: true }).addTo(regMiniMap);

            regMiniMarker.on('drag', (e) => {
                const pos = e.target.getLatLng();
                syncRegInputs(pos.lat, pos.lng, false);
            });

            regMiniMarker.on('dragend', (e) => {
                const pos = e.target.getLatLng();
                syncRegInputs(pos.lat, pos.lng, true);
            });

            regMiniMap.on('click', (e) => {
                regMiniMarker.setLatLng(e.latlng);
                syncRegInputs(e.latlng.lat, e.latlng.lng, true);
            });
        } else {
            regMiniMap.setView([lat, lng], 14);
            if (!regMiniMarker) {
                regMiniMarker = L.marker([lat, lng], { icon: regIcon, draggable: true }).addTo(regMiniMap);
            } else {
                regMiniMarker.setIcon(regIcon);
                regMiniMarker.setLatLng([lat, lng]);
            }
            regMiniMap.invalidateSize();
        }
        syncRegInputs(lat, lng, true);
    }

    function syncRegInputs(lat, lng, doGeocode = true) {
        const latInput = document.getElementById('patrolRegLat');
        const lngInput = document.getElementById('patrolRegLng');
        const addrSpan = document.getElementById('regAddrPreviewText');

        if (latInput) latInput.value = Number(lat).toFixed(6);
        if (lngInput) lngInput.value = Number(lng).toFixed(6);

        if (doGeocode && addrSpan) {
            addrSpan.innerText = "Locating address...";
            reverseGeocode(lat, lng).then(addr => {
                if (addrSpan) addrSpan.innerText = addr || `Lat: ${Number(lat).toFixed(4)}, Lng: ${Number(lng).toFixed(4)}`;
            });
        }
    }

    // Connect text input change to mini map marker
    const regLatInputEl = document.getElementById('patrolRegLat');
    const regLngInputEl = document.getElementById('patrolRegLng');
    [regLatInputEl, regLngInputEl].forEach(inp => {
        if (inp) {
            inp.addEventListener('input', () => {
                const lat = parseFloat(regLatInputEl.value);
                const lng = parseFloat(regLngInputEl.value);
                if (!isNaN(lat) && !isNaN(lng) && regMiniMarker && regMiniMap) {
                    regMiniMarker.setLatLng([lat, lng]);
                    regMiniMap.panTo([lat, lng]);
                    reverseGeocode(lat, lng).then(addr => {
                        const addrSpan = document.getElementById('regAddrPreviewText');
                        if (addrSpan) addrSpan.innerText = addr || `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
                    });
                }
            });
        }
    });

    // Preset location quick buttons
    document.querySelectorAll('.btn-reg-preset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const lat = parseFloat(btn.dataset.lat);
            const lng = parseFloat(btn.dataset.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                if (regMiniMap && regMiniMarker) {
                    regMiniMarker.setLatLng([lat, lng]);
                    regMiniMap.setView([lat, lng], 14);
                }
                syncRegInputs(lat, lng, true);
            }
        });
    });

    // Pick on Main Dashboard Map button inside registration modal
    const btnRegPickOnMainMap = document.getElementById('btnRegPickOnMainMap');
    if (btnRegPickOnMainMap) {
        btnRegPickOnMainMap.addEventListener('click', (e) => {
            e.preventDefault();
            const modal = document.getElementById('patrolRegistrationModal');
            const overlay = document.getElementById('patrolRegOverlay');
            if (modal) modal.classList.remove('show');
            if (overlay) overlay.classList.remove('show');

            const curLat = parseFloat(document.getElementById('patrolRegLat')?.value) || 13.0380;
            const curLng = parseFloat(document.getElementById('patrolRegLng')?.value) || 77.5120;
            const unitName = document.getElementById('patrolInputUnitName')?.value.trim() || document.getElementById('patrolInputOfficerName')?.value.trim() || 'New Patrol';

            startMainMapPickerForRegistration(unitName, curLat, curLng);
        });
    }

    function startMainMapPickerForRegistration(unitName, initialLat, initialLng) {
        isRegisteringMapPicker = true;

        const mapCard = document.querySelector('.map-panel-card');
        if (mapCard) mapCard.scrollIntoView({ behavior: 'smooth' });
        if (policeMap) policeMap.invalidateSize();

        const banner = document.getElementById('mapLocationPickerBanner');
        const unitNameSpan = document.getElementById('pickerTargetUnitName');
        const latSpan = document.getElementById('pickerLatDisplay');
        const lngSpan = document.getElementById('pickerLngDisplay');
        const addrSpan = document.getElementById('pickerAddrDisplay');

        if (unitNameSpan) unitNameSpan.innerText = `${unitName} (Pin Position)`;
        if (banner) banner.style.display = 'flex';

        if (latSpan) latSpan.innerText = initialLat.toFixed(6);
        if (lngSpan) lngSpan.innerText = initialLng.toFixed(6);

        reverseGeocode(initialLat, initialLng).then(addr => {
            if (addrSpan) addrSpan.innerText = addr;
        });

        if (tempPickerMarker && policeMap) {
            policeMap.removeLayer(tempPickerMarker);
        }

        const pickerIcon = L.divIcon({
            html: `
                <div style="position:relative; display:flex; align-items:center; justify-content:center;">
                    <div style="width:38px; height:38px; border-radius:50%; background:#D97706; border:3px solid #FFFFFF; box-shadow:0 0 16px rgba(217,119,6,0.9); display:flex; align-items:center; justify-content:center; color:white; font-size:16px; cursor:move;">
                        <i class="las la-car"></i>
                    </div>
                    <div style="position:absolute; bottom:42px; left:50%; transform:translateX(-50%); white-space:nowrap; background:#0D1535; color:#FCD34D; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; border:1px solid #FCD34D;">
                        📍 PIN PATROL LOCATION
                    </div>
                </div>
            `,
            className: '',
            iconSize: [44, 44],
            iconAnchor: [22, 22]
        });

        tempPickerMarker = L.marker([initialLat, initialLng], {
            icon: pickerIcon,
            draggable: true
        }).addTo(policeMap);

        policeMap.setView([initialLat, initialLng], 15);

        tempPickerMarker.on('drag', (e) => {
            const pos = e.target.getLatLng();
            if (latSpan) latSpan.innerText = pos.lat.toFixed(6);
            if (lngSpan) lngSpan.innerText = pos.lng.toFixed(6);
        });

        tempPickerMarker.on('dragend', async (e) => {
            const pos = e.target.getLatLng();
            const addr = await reverseGeocode(pos.lat, pos.lng);
            if (addrSpan) addrSpan.innerText = addr;
        });

        policeMap.on('click', onMapLocationPickerClick);
    }

    // Patrol Save / Registration Submit
    if (btnSavePatrolSubmit) {
        btnSavePatrolSubmit.addEventListener('click', async () => {
            if (!supabase) return;

            const editId = document.getElementById('patrolEditUnitId')?.value;
            let patrolId = document.getElementById('patrolInputId')?.value.trim();
            let unitName = document.getElementById('patrolInputUnitName')?.value.trim();
            let officerName = document.getElementById('patrolInputOfficerName')?.value.trim();
            let phone = document.getElementById('patrolInputPhone')?.value.trim();
            const vehReg = document.getElementById('patrolInputVehicleReg')?.value.trim();
            const station = document.getElementById('patrolInputStation')?.value.trim() || storedStation || 'Yelahanka Police Station';
            const status = document.getElementById('patrolInputStatus')?.value || 'available';
            const locationMode = document.getElementById('patrolInputLocationMode')?.value || 'manual';

            const alertBox = document.getElementById('patrolRegAlert');
            if (alertBox) alertBox.style.display = 'none';

            // Smart Auto-Fill: Allow registering simply by Name
            if (!unitName && !officerName) {
                if (alertBox) {
                    alertBox.innerText = "Please enter at least a Patrol Unit Name (e.g. Cheetah-01) or Officer Name.";
                    alertBox.style.display = 'block';
                }
                return;
            }

            if (!unitName) unitName = officerName;
            if (!officerName) officerName = unitName;

            if (!patrolId) {
                let maxNum = 0;
                realPatrolUnits.forEach(u => {
                    const m = (u.cleanPatrolId || '').match(/(\d+)/);
                    if (m) {
                        const num = parseInt(m[1], 10);
                        if (num > maxNum) maxNum = num;
                    }
                });
                patrolId = `PATROL-${String(maxNum + 1).padStart(3, '0')}`;
            }

            let cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
            if (cleanPhone.length < 10) {
                // Generate a guaranteed unique phone number for this patrol unit
                let randomSuffix = Math.floor(10000000 + Math.random() * 90000000);
                cleanPhone = '98' + randomSuffix;
                while (realPatrolUnits.some(u => u.phone === cleanPhone)) {
                    randomSuffix = Math.floor(10000000 + Math.random() * 90000000);
                    cleanPhone = '98' + randomSuffix;
                }
            }

            // Duplicate prevention check:
            const duplicateIdUnit = realPatrolUnits.find(u =>
                u.id !== editId &&
                (u.cleanPatrolId || '').toLowerCase() === patrolId.toLowerCase()
            );
            if (duplicateIdUnit) {
                if (alertBox) {
                    alertBox.innerText = `Patrol ID '${patrolId}' is already registered to ${duplicateIdUnit.officerName}. Please specify a unique identifier.`;
                    alertBox.style.display = 'block';
                }
                return;
            }

            btnSavePatrolSubmit.disabled = true;
            btnSavePatrolSubmit.innerHTML = '<i class="las la-spinner la-spin"></i> Saving Unit...';

            try {
                // Formatted identity strings preserving backwards compatibility
                const formattedOfficerId = `${patrolId} [${vehReg || 'N/A'}] [MODE:${locationMode.toUpperCase()}]`;
                const formattedOfficerName = `${officerName} (${unitName})`;

                if (editId) {
                    // Update existing unit
                    const { error } = await supabase
                        .from('police_units')
                        .update({
                            officer_id: formattedOfficerId,
                            officer_name: formattedOfficerName,
                            phone: cleanPhone,
                            station_name: station,
                            status: status
                        })
                        .eq('id', editId);

                    if (error) throw error;
                } else {
                    // Insert new unit with fallback for schema differences
                    let insertPayload = {
                        officer_id: formattedOfficerId,
                        officer_name: formattedOfficerName,
                        phone: cleanPhone,
                        station_name: station,
                        status: status,
                        created_at: new Date().toISOString()
                    };
                    let { error } = await supabase.from('police_units').insert([insertPayload]);
                    if (error) {
                        delete insertPayload.created_at;
                        const retry = await supabase.from('police_units').insert([insertPayload]);
                        if (retry.error) throw retry.error;
                    }
                }

                // Retrieve pinned coordinates (from mini-map or manual inputs)
                let regLat = parseFloat(document.getElementById('patrolRegLat')?.value);
                let regLng = parseFloat(document.getElementById('patrolRegLng')?.value);

                if (isNaN(regLat) || isNaN(regLng) || regLat < -90 || regLat > 90 || regLng < -180 || regLng > 180) {
                    regLat = 13.0380;
                    regLng = 77.5120;
                }

                // Immediately insert pinned coordinates into live_locations
                await supabase.from('live_locations').insert([{
                    user_phone: cleanPhone,
                    latitude: parseFloat(regLat.toFixed(6)),
                    longitude: parseFloat(regLng.toFixed(6)),
                    travel_mode: `MANUAL | ${vehReg || unitName}`,
                    alert_status: status,
                    created_at: new Date().toISOString()
                }]);

                closePatrolRegModal();
                await fetchRealPatrolUnits();

                // Center main dashboard map on the newly pinned patrol unit!
                if (policeMap && regLat && regLng) {
                    policeMap.setView([regLat, regLng], 15, { animate: true });
                    const mapCard = document.querySelector('.map-panel-card');
                    if (mapCard) mapCard.scrollIntoView({ behavior: 'smooth' });
                }

                alert(`Patrol Unit "${unitName}" (${patrolId}) successfully ${editId ? 'updated' : 'registered'} and pinned on map!`);
            } catch (err) {
                console.error("Failed to register patrol unit:", err);
                if (alertBox) {
                    alertBox.innerText = "Database error: " + err.message;
                    alertBox.style.display = 'block';
                }
            } finally {
                btnSavePatrolSubmit.disabled = false;
                btnSavePatrolSubmit.innerHTML = '<i class="las la-check-circle"></i> Save Patrol Unit';
            }
        });
    }

    /**
     * Patrol Deletion / Deactivation Modal
     */
    window.openDeletePatrolModal = function(unitId) {
        const unit = realPatrolUnits.find(u => u.id === unitId);
        if (!unit) return;

        deletingPatrolUnitId = unit.id;

        const modal = document.getElementById('patrolDeleteModal');
        const overlay = document.getElementById('patrolDeleteOverlay');
        const targetName = document.getElementById('deleteTargetUnitName');
        const subtitle = document.getElementById('patrolDeleteModalSubtitle');

        if (targetName) targetName.innerText = `${unit.cleanPatrolId} — ${unit.officerName} (${unit.unitCallsign})`;
        if (subtitle) subtitle.innerText = `Patrol ID: ${unit.cleanPatrolId}`;

        if (modal) modal.classList.add('show');
        if (overlay) overlay.classList.add('show');
    };

    function closePatrolDeleteModal() {
        const modal = document.getElementById('patrolDeleteModal');
        const overlay = document.getElementById('patrolDeleteOverlay');
        if (modal) modal.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
        deletingPatrolUnitId = null;
    }

    const btnClosePatrolDeleteModal = document.getElementById('btnClosePatrolDeleteModal');
    const btnCancelDeletePatrol = document.getElementById('btnCancelDeletePatrol');
    const btnConfirmDeletePatrol = document.getElementById('btnConfirmDeletePatrol');

    if (btnClosePatrolDeleteModal) btnClosePatrolDeleteModal.onclick = closePatrolDeleteModal;
    if (btnCancelDeletePatrol) btnCancelDeletePatrol.onclick = closePatrolDeleteModal;

    if (btnConfirmDeletePatrol) {
        btnConfirmDeletePatrol.addEventListener('click', async () => {
            if (!deletingPatrolUnitId || !supabase) return;

            const unit = realPatrolUnits.find(u => u.id === deletingPatrolUnitId);
            if (!unit) return;

            btnConfirmDeletePatrol.disabled = true;
            btnConfirmDeletePatrol.innerHTML = '<i class="las la-spinner la-spin"></i> Processing...';

            try {
                // Check if unit has any assigned active cases or history
                const hasActiveAssignment = unit.status === 'assigned';

                if (hasActiveAssignment) {
                    // Soft deactivation to protect audit trail
                    await supabase
                        .from('police_units')
                        .update({ status: 'off_duty' })
                        .eq('id', unit.id);
                    alert(`${unit.cleanPatrolId} has active response duties and was safely marked Off Duty rather than deleting historical logs.`);
                } else {
                    // Safe delete from police_units
                    const { error } = await supabase
                        .from('police_units')
                        .delete()
                        .eq('id', unit.id);

                    if (error) throw error;
                    alert(`${unit.cleanPatrolId} was successfully removed from the patrol registry.`);
                }

                closePatrolDeleteModal();
                await fetchRealPatrolUnits();
            } catch (err) {
                console.error("Error deleting patrol:", err);
                alert("Failed to process patrol removal: " + err.message);
            } finally {
                btnConfirmDeletePatrol.disabled = false;
                btnConfirmDeletePatrol.innerHTML = '<i class="las la-trash"></i> Deactivate / Remove Unit';
            }
        });
    }

    function closeAllPatrolModals() {
        closePatrolLocationModal();
        closePatrolRegModal();
        closePatrolDeleteModal();
    }

    // Toolbar event listeners
    const patrolSearchInput = document.getElementById('patrolSearchInput');
    const patrolStatusFilter = document.getElementById('patrolStatusFilter');
    const patrolSourceFilter = document.getElementById('patrolSourceFilter');
    const btnRefreshFleet = document.getElementById('btnRefreshFleet');

    if (patrolSearchInput) {
        patrolSearchInput.addEventListener('input', (e) => {
            fleetSearchQuery = e.target.value.trim();
            renderFleetTable();
        });
    }

    if (patrolStatusFilter) {
        patrolStatusFilter.addEventListener('change', (e) => {
            fleetStatusFilter = e.target.value;
            renderFleetTable();
        });
    }

    if (patrolSourceFilter) {
        patrolSourceFilter.addEventListener('change', (e) => {
            fleetSourceFilter = e.target.value;
            renderFleetTable();
        });
    }

    if (btnRefreshFleet) {
        btnRefreshFleet.addEventListener('click', async () => {
            btnRefreshFleet.innerHTML = '<i class="las la-spinner la-spin"></i>';
            await fetchRealPatrolUnits();
            setTimeout(() => {
                btnRefreshFleet.innerHTML = '<i class="las la-sync-alt"></i>';
            }, 400);
        });
    }

    const viewAllResourcesLink = document.getElementById('viewAllResourcesLink');
    if (viewAllResourcesLink) {
        viewAllResourcesLink.addEventListener('click', () => {
            const patrolSec = document.getElementById('patrolManagementSection');
            if (patrolSec) patrolSec.scrollIntoView({ behavior: 'smooth' });
        });
    }

    /**
     * Nearest Patrol Assignment Ranking
     * Integrates registered units with SOS incident location via OSRM & straight-line fallback.
     * Clearly labels Location Source and Freshness.
     */
    async function calculateNearestPatrolRecommendations(alert) {
        const destLat = parseFloat(alert.latitude);
        const destLon = parseFloat(alert.longitude);

        if (isNaN(destLat) || isNaN(destLon)) return;

        // Filter and calculate distances
        const routingPromises = realPatrolUnits.map(async (unit) => {
            // Exclude units without coordinates
            if (!unit.latitude || !unit.longitude) {
                return {
                    ...unit,
                    calculatedDistance: Infinity,
                    calculatedEta: Infinity,
                    distLabel: 'No Coordinates Fixed',
                    isEligible: false
                };
            }

            const isEligible = unit.status === 'available';

            // Straight-line distance
            const straightKmStr = calculateDistanceKm(unit.latitude, unit.longitude, destLat, destLon);
            const straightKm = parseFloat(straightKmStr);

            try {
                // Query OSRM for road distance and duration (with 1.5s timeout)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);
                const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${unit.longitude},${unit.latitude};${destLon},${destLat}?overview=false`;
                const res = await fetch(osrmUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await res.json();

                if (data.routes && data.routes.length > 0) {
                    const roadKm = parseFloat((data.routes[0].distance / 1000).toFixed(1));
                    const roadMins = Math.max(1, Math.round(data.routes[0].duration / 60));
                    return {
                        ...unit,
                        calculatedDistance: roadKm,
                        calculatedEta: roadMins,
                        distLabel: `${roadKm} km (~${roadMins} min Road ETA)`,
                        isRoadRouted: true,
                        isEligible
                    };
                }
            } catch (err) {
                // Fallback to straight-line
            }

            return {
                ...unit,
                calculatedDistance: straightKm,
                calculatedEta: Math.max(1, Math.round(straightKm * 2.5)),
                distLabel: `${straightKm} km (straight-line)`,
                isRoadRouted: false,
                isEligible
            };
        });

        const unitsWithDist = await Promise.all(routingPromises);

        // Sort strictly by distance to SOS victim (shortest distance first)
        unitsWithDist.sort((a, b) => {
            const aDist = (typeof a.calculatedDistance === 'number' && !isNaN(a.calculatedDistance)) ? a.calculatedDistance : Infinity;
            const bDist = (typeof b.calculatedDistance === 'number' && !isNaN(b.calculatedDistance)) ? b.calculatedDistance : Infinity;

            if (aDist !== bDist) return aDist - bDist;
            return (a.calculatedEta || 0) - (b.calculatedEta || 0);
        });

        realPatrolUnits = unitsWithDist;
        renderPatrolUnitsList(realPatrolUnits);
    }

    /**
     * Renders the Nearby Resources tab for Patrol Units
     */
    function renderPatrolUnitsList(units) {
        const container = document.getElementById('listResPatrol');
        if (!container) return;

        if (units.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card">
                    <i class="las la-car"></i>
                    <p>No active patrol units available</p>
                </div>
            `;
            return;
        }

        // Recommended unit: closest unit with fixed coordinates to the SOS user
        const eligibleUnits = units.filter(u => u.calculatedDistance !== Infinity && !isNaN(u.calculatedDistance));
        const closestAvailable = eligibleUnits.find(u => u.status === 'available');
        const recommendedUnit = closestAvailable || eligibleUnits[0] || null;
        const recommendedId = recommendedUnit ? recommendedUnit.id : null;

        container.innerHTML = units.map(unit => {
            const isRec = unit.id === recommendedId;
            let statusClass = 'badge-available';
            let iconClass = 'patrol-icon-available';
            let statusLabel = 'Available';

            if (unit.status === 'assigned') {
                statusClass = 'badge-assigned';
                iconClass = 'patrol-icon-assigned';
                statusLabel = 'Assigned';
            } else if (unit.status === 'unavailable') {
                statusClass = 'badge-offline';
                iconClass = 'patrol-icon-offline';
                statusLabel = 'Unavailable';
            } else if (unit.status === 'off_duty') {
                statusClass = 'badge-offline';
                iconClass = 'patrol-icon-offline';
                statusLabel = 'Off Duty';
            }

            const distText = unit.distLabel || (unit.latitude ? 'Location Fixed' : 'No Coordinates');
            const timeAgoText = unit.lastLocationTime ? formatRelativeTime(unit.lastLocationTime) : 'Never';

            const isManual = unit.locationSource === 'Manual';
            const sourceBadge = isManual
                ? `<span class="patrol-source-badge badge-manual" style="font-size:0.68rem; margin-left:6px;"><i class="las la-crosshairs"></i> MANUAL LOCATION</span>`
                : `<span class="patrol-source-badge badge-gps" style="font-size:0.68rem; margin-left:6px;"><i class="las la-satellite-dish"></i> GPS</span>`;

            return `
                <div class="patrol-unit-card ${isRec ? 'is-recommended' : ''}" id="patrolCard-${unit.id}">
                    <div class="patrol-card-header">
                        <div class="patrol-unit-info">
                            <div class="patrol-icon-wrap ${iconClass}">
                                <i class="las la-car"></i>
                            </div>
                            <div>
                                <strong class="patrol-name-text">
                                    ${unit.cleanPatrolId} · ${unit.unitCallsign}
                                    ${isRec ? '<span class="rec-badge"><i class="las la-star"></i> RECOMMENDED</span>' : ''}
                                </strong>
                                <span class="patrol-sub-text">
                                    ${unit.officerName} · ${unit.station_name || 'Station'}
                                    ${sourceBadge}
                                </span>
                            </div>
                        </div>
                        <span class="patrol-badge-status ${statusClass}">${statusLabel}</span>
                    </div>

                    <div class="patrol-telemetry-row">
                        <div class="patrol-dist-eta">
                            <i class="las la-map-pin"></i>
                            <span>${distText}</span>
                        </div>
                        <span class="patrol-gps-freshness ${unit.isStale ? 'text-warning fw-bold' : ''}">
                            <i class="las ${unit.isStale ? 'la-exclamation-triangle' : 'la-clock'}"></i> ${timeAgoText}
                        </span>
                        <button class="btn-dispatch-unit" onclick="window.openDispatchConfirmModal('${unit.id}');" ${unit.status !== 'available' ? 'disabled' : ''}>
                            <i class="las la-paper-plane"></i> ${unit.status === 'available' ? 'Dispatch' : statusLabel}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Updates Leaflet Map Markers for all patrol units.
     * Clearly distinguishes GPS markers (pulse) from Manual markers (static amber pin).
     */
    function updatePatrolMapMarkers() {
        if (!policeMap) return;
        layerPatrolGroup.clearLayers();

        realPatrolUnits.forEach(unit => {
            if (!unit.latitude || !unit.longitude) return;

            const coords = [unit.latitude, unit.longitude];
            const isManual = unit.locationSource === 'Manual';
            const isDispatched = unit.status === 'assigned';

            // High-visibility status and animation styling
            let dotColor = '#0ABF78'; // Green available (GPS)
            let pulseClass = 'pulse-radar-wave-green';

            if (isDispatched) {
                dotColor = '#2563EB'; // Vibrant Electric Blue for Dispatched Patrol
                pulseClass = 'pulse-radar-wave-dispatched'; // High-intensity dual-ring dispatch pulse
            } else if (isManual) {
                dotColor = '#D97706'; // Amber for manual
                pulseClass = 'pulse-radar-wave-amber';
            } else if (unit.status === 'unavailable' || unit.status === 'off_duty') {
                dotColor = '#94A3B8';
                pulseClass = ''; // No pulse wave if off duty
            }

            const markerHtml = `
                <div style="position:relative; display:flex; align-items:center; justify-content:center;">
                    ${pulseClass ? `<div class="pulse-radar-wave ${pulseClass}"></div>` : ''}
                    <div style="width:30px; height:30px; border-radius:50%; background:${dotColor}; border:3px solid #FFFFFF; box-shadow:0 0 14px ${dotColor}; display:flex; align-items:center; justify-content:center; color:white; font-size:14px; z-index:3; transition:all 0.3s ease;">
                        <i class="las ${isDispatched ? 'la-shield-alt' : 'la-car'}"></i>
                    </div>
                    ${isDispatched ? `
                        <div style="position:absolute; top:-24px; left:50%; transform:translateX(-50%); background:#2563EB; color:white; font-size:9px; font-weight:800; padding:2px 7px; border-radius:4px; box-shadow:0 2px 8px rgba(37,99,235,0.6); white-space:nowrap; letter-spacing:0.5px; z-index:4; display:flex; align-items:center; gap:4px; pointer-events:none;">
                            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#67E8F9; animation:beaconBlink 0.7s infinite alternate;"></span> DISPATCHED
                        </div>
                    ` : ''}
                </div>
            `;

            const icon = L.divIcon({ html: markerHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });
            const marker = L.marker(coords, { icon });
            marker.bindPopup(`
                <div style="font-family: inherit; min-width: 220px;">
                    <div style="font-size: 13px; font-weight: 700; margin-bottom: 5px; display: flex; align-items: center; justify-content: space-between;">
                        <span>🚔 ${unit.cleanPatrolId}</span>
                        <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${isDispatched ? '#2563EB' : (isManual ? '#D97706' : '#0ABF78')}; color: white; font-weight: 700;">
                            ${isDispatched ? 'DISPATCHED' : (isManual ? 'MANUAL' : 'GPS')}
                        </span>
                    </div>
                    <div style="font-size: 11px; color: #475569; line-height: 1.45; margin-bottom: 8px;">
                        <div>Officer: <b>${unit.officerName}</b> (${unit.unitCallsign})</div>
                        <div>Vehicle: <b>${unit.vehicleReg || 'N/A'}</b></div>
                        <div>Station: ${unit.station_name || 'N/A'}</div>
                        <div>Status: <span style="font-weight: 700; color: ${isDispatched ? '#2563EB' : '#0D1535'}; text-transform: uppercase;">${isDispatched ? 'ASSIGNED & RESPONDING' : unit.status}</span></div>
                        <div>Updated: ${unit.lastLocationTime ? formatRelativeTime(unit.lastLocationTime) : 'N/A'}</div>
                    </div>
                    <div style="display: flex; gap: 6px; border-top: 1px solid #E2E8F0; padding-top: 6px;">
                        <button onclick="window.openPatrolLocationModal('${unit.id}');" style="flex: 1; background: #0284C7; color: white; border: none; padding: 5px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <i class="las la-map-pin"></i> Edit Location
                        </button>
                        <button onclick="window.togglePatrolLocationMode('${unit.id}');" style="background: #1E293B; color: white; border: none; padding: 5px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;" title="Toggle GPS / Manual mode">
                            <i class="las ${isManual ? 'la-satellite-dish' : 'la-crosshairs'}"></i>
                        </button>
                    </div>
                </div>
            `);
            layerPatrolGroup.addLayer(marker);
        });
    }

    /**
     * Modal Dispatch Workflow
     */
    window.openDispatchConfirmModal = function(unitId) {
        const unit = realPatrolUnits.find(u => u.id === unitId);
        let alert = realAlertsList.find(a => a.id === selectedAlertId);

        // Auto-select latest active emergency alert if none is selected
        if (!alert && realAlertsList.length > 0) {
            alert = realAlertsList[0];
            selectedAlertId = alert.id;
            selectAlertById(alert.id);
        }

        if (!alert) {
            window.alert("Please select an active emergency alert first.");
            return;
        }
        if (!unit) {
            window.alert("Selected patrol unit not found.");
            return;
        }

        selectedPatrolUnit = unit;

        const userObj = usersCache.get(alert.user_phone);
        const victimName = userObj ? userObj.full_name : (alert.user_phone || 'Distress Citizen');

        const dispVictimName = document.getElementById('dispVictimName');
        const dispVictimPhone = document.getElementById('dispVictimPhone');
        const dispAlertType = document.getElementById('dispAlertType');
        const dispAlertLoc = document.getElementById('dispAlertLoc');
        const dispUnitName = document.getElementById('dispUnitName');
        const dispOfficerInfo = document.getElementById('dispOfficerInfo');
        const dispEtaValue = document.getElementById('dispEtaValue');
        const dispRoutingMode = document.getElementById('dispRoutingMode');
        const dispStaleWarningBox = document.getElementById('dispStaleWarningBox');

        if (dispVictimName) dispVictimName.innerText = victimName;
        if (dispVictimPhone) dispVictimPhone.innerText = alert.user_phone || '—';
        if (dispAlertType) dispAlertType.innerText = alert.alert_type || 'SOS Alert';
        if (dispAlertLoc) dispAlertLoc.innerText = `${alert.latitude?.toFixed(4)}, ${alert.longitude?.toFixed(4)}`;
        if (dispUnitName) dispUnitName.innerText = `${unit.cleanPatrolId} (${unit.unitCallsign})`;
        if (dispOfficerInfo) dispOfficerInfo.innerText = `${unit.officerName} · ${unit.phone} · Source: ${unit.locationSource}`;
        if (dispEtaValue) dispEtaValue.innerText = unit.distLabel || 'Distance calculating...';
        if (dispRoutingMode) dispRoutingMode.innerText = unit.isRoadRouted ? 'OSRM Road Routing' : 'Straight-line Distance';

        // Check if manual coordinates are stale (> 60m)
        if (dispStaleWarningBox) {
            if (unit.isStale && unit.locationSource === 'Manual') {
                dispStaleWarningBox.style.display = 'flex';
                const warningText = document.getElementById('dispStaleWarningText');
                if (warningText) {
                    warningText.innerText = `This unit's manual coordinates were entered over 60 minutes ago (${unit.lastLocationTime ? formatRelativeTime(unit.lastLocationTime) : 'unknown'}). Please verify officer position before dispatching.`;
                }
            } else {
                dispStaleWarningBox.style.display = 'none';
            }
        }

        const modal = document.getElementById('dispatchConfirmModal');
        const overlay = document.getElementById('dispatchConfirmOverlay');
        if (modal) modal.classList.add('show');
        if (overlay) overlay.classList.add('show');
    };

    function closeDispatchConfirmModal() {
        const modal = document.getElementById('dispatchConfirmModal');
        const overlay = document.getElementById('dispatchConfirmOverlay');
        if (modal) modal.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
        selectedPatrolUnit = null;
    }

    const btnCloseDispatchModal = document.getElementById('btnCloseDispatchModal');
    const btnCancelDispatch = document.getElementById('btnCancelDispatch');
    const btnConfirmDispatchSubmit = document.getElementById('btnConfirmDispatchSubmit');

    if (btnCloseDispatchModal) btnCloseDispatchModal.onclick = closeDispatchConfirmModal;
    if (btnCancelDispatch) btnCancelDispatch.onclick = closeDispatchConfirmModal;

    if (btnConfirmDispatchSubmit) {
        btnConfirmDispatchSubmit.addEventListener('click', async () => {
            if (!selectedPatrolUnit || !selectedAlertId || !supabase) return;

            const alert = realAlertsList.find(a => a.id === selectedAlertId);
            if (!alert) return;

            btnConfirmDispatchSubmit.disabled = true;
            btnConfirmDispatchSubmit.innerHTML = '<i class="las la-spinner la-spin"></i> Dispatching Unit...';

            try {
                const instructionsInput = document.getElementById('dispatchInstructions');
                const instructions = instructionsInput ? instructionsInput.value.trim() : '';

                // 1. Update police_units status to assigned
                await supabase
                    .from('police_units')
                    .update({ status: 'assigned' })
                    .eq('id', selectedPatrolUnit.id);

                // Optimistically mark assigned in memory immediately
                selectedPatrolUnit.status = 'assigned';
                const foundUnit = realPatrolUnits.find(u => u.id === selectedPatrolUnit.id);
                if (foundUnit) {
                    foundUnit.status = 'assigned';
                }
                updatePatrolMapMarkers();

                // 3. Update emergency_alerts with assignment tag
                const dispatchTag = `[ASSIGNED: ${selectedPatrolUnit.cleanPatrolId} (${selectedPatrolUnit.unitCallsign}) | OFFICER: ${selectedPatrolUnit.officerName} | PHONE: ${selectedPatrolUnit.phone} | SOURCE: ${selectedPatrolUnit.locationSource} | AT: ${new Date().toLocaleTimeString()}${instructions ? ' | NOTE: ' + instructions : ''}]`;
                const updatedMessage = alert.message ? `${alert.message} | ${dispatchTag}` : dispatchTag;

                await supabase
                    .from('emergency_alerts')
                    .update({
                        police_escalation: 'ACTIVE',
                        message: updatedMessage
                    })
                    .eq('id', alert.id);

                alert.police_escalation = 'ACTIVE';
                alert.message = updatedMessage;

                // 4. Draw road route polyline from unit to victim on Leaflet map
                if (selectedPatrolUnit.latitude && selectedPatrolUnit.longitude && alert.latitude && alert.longitude) {
                    await drawAssignedPatrolRoute(selectedPatrolUnit.latitude, selectedPatrolUnit.longitude, alert.latitude, alert.longitude);
                }

                // Center map on the dispatched patrol and distress location
                if (policeMap && selectedPatrolUnit.latitude && selectedPatrolUnit.longitude) {
                    policeMap.setView([selectedPatrolUnit.latitude, selectedPatrolUnit.longitude], 15, { animate: true });
                }

                // 5. Update UI state
                populateActiveAlertDetails(alert);
                await fetchRealPatrolUnits();
                closeDispatchConfirmModal();

                btnConfirmDispatchSubmit.disabled = false;
                btnConfirmDispatchSubmit.innerHTML = '<i class="las la-paper-plane"></i> Confirm & Dispatch Unit';
                if (instructionsInput) instructionsInput.value = '';

                window.alert(`Emergency dispatch confirmed! ${selectedPatrolUnit.cleanPatrolId} (${selectedPatrolUnit.unitCallsign}) dispatched to SOS location.`);

            } catch (err) {
                console.error("Dispatch execution exception:", err);
                btnConfirmDispatchSubmit.disabled = false;
                btnConfirmDispatchSubmit.innerHTML = '<i class="las la-paper-plane"></i> Confirm & Dispatch Unit';
                window.alert("Failed to confirm dispatch: " + err.message);
            }
        });
    }

    async function drawAssignedPatrolRoute(unitLat, unitLon, victimLat, victimLon) {
        if (!policeMap) return;
        layerRouteGroup.clearLayers();

        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${unitLon},${unitLat};${victimLon},${victimLat}?overview=full&geometries=geojson`;

        try {
            const res = await fetch(osrmUrl);
            const data = await res.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const routeLine = L.geoJSON(route.geometry, {
                    style: {
                        color: '#0284C7',
                        weight: 6,
                        opacity: 0.9,
                        dashArray: '10, 10'
                    }
                });
                layerRouteGroup.addLayer(routeLine);
                policeMap.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
            }
        } catch (e) {
            // Draw straight line fallback
            const line = L.polyline([[unitLat, unitLon], [victimLat, victimLon]], {
                color: '#0284C7',
                weight: 5,
                dashArray: '8, 8',
                opacity: 0.8
            });
            layerRouteGroup.addLayer(line);
        }
    }

    /* ==========================================================================
       7. CASE ACTIONS (Send Team, Call User, Mark Resolved)
       ========================================================================== */
    const btnDispatch = document.getElementById('btnDispatch');
    const btnCallUser = document.getElementById('btnCallUser');
    const btnMarkResolved = document.getElementById('btnMarkResolved');

    if (btnDispatch) {
        btnDispatch.addEventListener('click', async () => {
            const alert = realAlertsList.find(a => a.id === selectedAlertId);
            if (!alert) {
                window.alert("Please select an active alert first.");
                return;
            }

            // If an eligible unit is available, open the nearest unit dispatch confirmation
            const eligibleUnit = realPatrolUnits.find(u => u.status === 'available');
            if (eligibleUnit) {
                window.openDispatchConfirmModal(eligibleUnit.id);
                return;
            }

            // General station dispatch fallback
            btnDispatch.disabled = true;
            btnDispatch.innerHTML = '<i class="las la-spinner la-spin"></i> Dispatching...';

            try {
                if (supabase) {
                    await supabase
                        .from('emergency_alerts')
                        .update({ police_escalation: 'ACTIVE' })
                        .eq('id', alert.id);
                }

                alert.police_escalation = 'ACTIVE';
                btnDispatch.innerHTML = '<i class="las la-check-double"></i> Team Dispatched';
                btnDispatch.style.background = '#0ABF78';

                const infoRouteStatus = document.getElementById('infoRouteStatus');
                if (infoRouteStatus) {
                    infoRouteStatus.innerText = 'Team Dispatched (Active Response)';
                    infoRouteStatus.className = 'field-value text-success fw-bold';
                }

                window.alert("Emergency response team dispatched. Status recorded in database.");
            } catch (err) {
                btnDispatch.disabled = false;
                btnDispatch.innerHTML = '<i class="las la-paper-plane"></i> Dispatch Patrol';
                window.alert("Failed to update dispatch status: " + err.message);
            }
        });
    }

    if (btnCallUser) {
        btnCallUser.addEventListener('click', () => {
            const alert = realAlertsList.find(a => a.id === selectedAlertId);
            if (!alert || !alert.user_phone) {
                window.alert("No phone number available for selected alert.");
                return;
            }
            if (confirm(`Establish emergency phone connection to victim at ${alert.user_phone}?`)) {
                window.location.href = `tel:${alert.user_phone.replace(/\s+/g, '')}`;
            }
        });
    }

    // Modal Case Completion Flow
    const reportModal = document.getElementById('caseReportModal');
    const reportOverlay = document.getElementById('reportOverlay');
    const reportText = document.getElementById('caseReportText');
    const btnSubmitReport = document.getElementById('btnSubmitReport');
    const btnCancelReport = document.getElementById('btnCancelReport');

    if (btnMarkResolved) {
        btnMarkResolved.addEventListener('click', () => {
            const alert = realAlertsList.find(a => a.id === selectedAlertId);
            if (!alert) {
                window.alert("Please select an alert to resolve.");
                return;
            }
            if (reportOverlay && reportModal) {
                reportOverlay.classList.add('show');
                reportModal.classList.add('show');
            }
        });
    }

    if (btnCancelReport) {
        btnCancelReport.addEventListener('click', () => {
            if (reportOverlay) reportOverlay.classList.remove('show');
            if (reportModal) reportModal.classList.remove('show');
        });
    }

    if (btnSubmitReport) {
        btnSubmitReport.addEventListener('click', async () => {
            const alert = realAlertsList.find(a => a.id === selectedAlertId);
            if (!alert) return;

            const actionNote = reportText ? reportText.value.trim() : '';
            if (!actionNote) {
                window.alert("Please provide a brief case completion summary.");
                return;
            }

            btnSubmitReport.disabled = true;
            btnSubmitReport.innerText = "Archiving...";

            try {
                if (supabase) {
                    await supabase
                        .from('emergency_alerts')
                        .update({
                            status: 'resolved',
                            message: `${alert.message} | [RESOLVED] Action Taken: ${actionNote}`
                        })
                        .eq('id', alert.id);

                    if (alert.sos_id) {
                        if (window.jagruthiSosService) {
                            await window.jagruthiSosService.resolveSosEvent(alert.sos_id);
                        } else {
                            await supabase
                                .from('sos_events')
                                .update({ status: 'RESOLVED', ended_at: new Date().toISOString() })
                                .eq('id', alert.sos_id);
                        }
                    }

                    // Reset citizen's telemetry status in live_locations to 'normal' so polling does not re-deviate
                    if (alert.user_phone) {
                        await supabase
                            .from('live_locations')
                            .insert([{
                                user_phone: alert.user_phone,
                                latitude: alert.latitude || 13.133,
                                longitude: alert.longitude || 77.574,
                                travel_mode: 'Normal',
                                alert_status: 'normal',
                                created_at: new Date().toISOString()
                            }]);
                    }

                    // Release assigned patrol unit back to available
                    const assignedUnit = realPatrolUnits.find(u => u.status === 'assigned');
                    if (assignedUnit) {
                        await supabase
                            .from('police_units')
                            .update({ status: 'available' })
                            .eq('id', assignedUnit.id);
                        assignedUnit.status = 'available';
                    }
                }

                // Explicitly deselect this alert so it is never re-selected on refresh
                selectedAlertId = null;

                // Immediately clear map layers for resolved alert
                if (alert.user_phone && activeCitizenMarkers.has(alert.user_phone)) {
                    layerUsersGroup.removeLayer(activeCitizenMarkers.get(alert.user_phone));
                    activeCitizenMarkers.delete(alert.user_phone);
                }
                layerSosGroup.clearLayers();
                layerRouteGroup.clearLayers();
                layerDeviationGroup.clearLayers();
                try { localStorage.removeItem('safeRouteLiveLocation'); } catch (e) {}

                if (reportOverlay) reportOverlay.classList.remove('show');
                if (reportModal) reportModal.classList.remove('show');
                btnSubmitReport.disabled = false;
                btnSubmitReport.innerHTML = '<i class="las la-check-circle"></i> Complete & Close Case';
                if (reportText) reportText.value = '';

                // Clear details panel immediately
                clearActiveAlertDetails();

                // Refresh state
                await fetchRealPoliceStats();
                await fetchRealEmergencyAlerts();
                await fetchRealPatrolUnits();

                window.alert("Case marked resolved and archived in police records.");
            } catch (err) {
                btnSubmitReport.disabled = false;
                btnSubmitReport.innerText = "Complete Case";
                window.alert("Resolution update error: " + err.message);
            }
        });
    }

    // Emergency Acknowledge Modal Button
    const btnAcknowledgeAlert = document.getElementById('btnAcknowledgeAlert');
    if (btnAcknowledgeAlert) {
        btnAcknowledgeAlert.addEventListener('click', () => {
            const policeIncidentOverlay = document.getElementById('policeIncidentOverlay');
            const policeIncidentModal = document.getElementById('policeIncidentModal');
            const policeAlertSound = document.getElementById('policeAlertSound');

            if (policeIncidentOverlay) policeIncidentOverlay.classList.remove('show');
            if (policeIncidentModal) policeIncidentModal.classList.remove('show');
            if (policeAlertSound) {
                policeAlertSound.pause();
                policeAlertSound.currentTime = 0;
            }

            document.querySelector('.alert-details-card').scrollIntoView({ behavior: 'smooth' });
        });
    }

    /* ==========================================================================
       8. SEARCH & REAL-TIME FILTERING
       ========================================================================== */
    const searchInput = document.getElementById('dashboardSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const alertCards = document.querySelectorAll('.recent-alert-item');

            alertCards.forEach(card => {
                const text = card.innerText.toLowerCase();
                const alertId = (card.dataset.alertId || '').toLowerCase();
                if (!query || text.includes(query) || alertId.includes(query)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    // Tabs for Evidence, Active Alert Details, and Resources
    document.querySelectorAll('.underline-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.underline-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tabKey = btn.dataset.detailTab;
            const tabMap = {
                details: document.getElementById('tabSubDetails'),
                location: document.getElementById('tabSubLocation'),
                evidence: document.getElementById('tabSubEvidence'),
                actionlog: document.getElementById('tabSubActionLog')
            };

            Object.entries(tabMap).forEach(([k, el]) => {
                if (el) el.style.display = (k === tabKey) ? 'block' : 'none';
            });
        });
    });

    document.querySelectorAll('.pill-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tabKey = btn.dataset.evidenceTab;
            const tabMap = {
                video: document.getElementById('tabEvdVideo'),
                images: document.getElementById('tabEvdImages'),
                audio: document.getElementById('tabEvdAudio')
            };

            Object.entries(tabMap).forEach(([k, el]) => {
                if (el) el.style.display = (k === tabKey) ? 'block' : 'none';
            });
        });
    });

    document.querySelectorAll('.resource-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.resource-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tabKey = btn.dataset.resTab;
            const listMap = {
                police: document.getElementById('listResPolice'),
                patrol: document.getElementById('listResPatrol'),
                hospitals: document.getElementById('listResHospitals')
            };

            Object.entries(listMap).forEach(([k, el]) => {
                if (el) el.style.display = (k === tabKey) ? 'flex' : 'none';
            });
        });
    });

    /* ==========================================================================
       9. SUPABASE REALTIME & FALLBACK POLLING
       ========================================================================== */
    let realtimeChannel = null;

    if (supabase) {
        try {
            realtimeChannel = supabase.channel('police_dashboard_live_feed')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, async (payload) => {
                    console.log("Realtime: emergency_alerts change received:", payload);
                    await fetchRealPoliceStats();
                    await fetchRealEmergencyAlerts();

                    // If new active alert inserted, sound alarm and open strobe modal
                    if (payload.eventType === 'INSERT' && payload.new && payload.new.status === 'active') {
                        if (!processedAlertIds.has(payload.new.id)) {
                            processedAlertIds.add(payload.new.id);
                            triggerIncomingAlertModal(payload.new);
                        }
                    }
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_locations' }, async (payload) => {
                    console.log("Realtime: live_locations update:", payload);
                    if (payload.new && payload.new.latitude && payload.new.longitude) {
                        const phone = payload.new.user_phone;
                        const lat = parseFloat(payload.new.latitude);
                        const lng = parseFloat(payload.new.longitude);
                        window.updateCitizenLivePosition(
                            phone,
                            lat,
                            lng,
                            payload.new.travel_mode || 'Normal',
                            payload.new.alert_status || 'normal'
                        );
                    }
                    if (realAlertsList.length > 0) {
                        updateMapWithRealRecords(realAlertsList);
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_evidence' }, async (payload) => {
                    console.log("Realtime: sos_evidence update:", payload);
                    const currentAlert = realAlertsList.find(a => a.id === selectedAlertId);
                    if (currentAlert) {
                        await loadRealEvidenceForAlert(currentAlert);
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'police_units' }, async (payload) => {
                    console.log("Realtime: police_units update received:", payload);
                    await fetchRealPatrolUnits();
                })
                .subscribe((status) => {
                    console.log("Supabase Realtime subscription status:", status);
                });
        } catch (e) {
            console.warn("Realtime subscription exception:", e);
        }
    }

    // Instant Cross-Window / Tab Live Movement Sync (when user is moving in user tab)
    window.addEventListener('storage', (e) => {
        if (e.key === 'safeRouteLiveLocation' && e.newValue) {
            try {
                const data = JSON.parse(e.newValue);
                if (data.lat && data.lng) {
                    const userPhone = localStorage.getItem('userPhone') || 'Citizen';
                    window.updateCitizenLivePosition(
                        userPhone,
                        parseFloat(data.lat),
                        parseFloat(data.lng),
                        'Walking',
                        data.isDeviated ? 'deviated' : 'normal'
                    );
                }
            } catch (err) {}
        }
    });

    // Check initial safeRouteLiveLocation from storage on load
    try {
        const initialSaved = localStorage.getItem('safeRouteLiveLocation');
        if (initialSaved) {
            const data = JSON.parse(initialSaved);
            if (data.lat && data.lng) {
                const phone = localStorage.getItem('userPhone') || 'Citizen';
                window.updateCitizenLivePosition(phone, data.lat, data.lng, 'Walking', data.isDeviated ? 'deviated' : 'normal');
            }
        }
    } catch (e) {}

    function triggerIncomingAlertModal(alert) {
        const popPolUserName = document.getElementById('popPolUserName');
        const popPolAlertType = document.getElementById('popPolAlertType');
        const policeIncidentOverlay = document.getElementById('policeIncidentOverlay');
        const policeIncidentModal = document.getElementById('policeIncidentModal');
        const policeAlertSound = document.getElementById('policeAlertSound');

        const userObj = usersCache.get(alert.user_phone);
        const name = userObj ? userObj.full_name : (alert.user_phone || 'Citizen SOS');

        if (popPolUserName) popPolUserName.innerText = name;
        if (popPolAlertType) popPolAlertType.innerText = alert.alert_type || 'Active SOS';
        if (policeIncidentOverlay) policeIncidentOverlay.classList.add('show');
        if (policeIncidentModal) policeIncidentModal.classList.add('show');

        try {
            if (policeAlertSound) policeAlertSound.play().catch(() => {});
        } catch (e) {}
    }

    // High-frequency live telemetry polling so moving citizens update on the map in real-time
    const telemetryTimer = setInterval(async () => {
        if (!supabase) return;
        try {
            const { data: recs } = await supabase
                .from('live_locations')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (recs && recs.length > 0) {
                const seenPhones = new Set();
                recs.forEach(r => {
                    if (r.user_phone && !seenPhones.has(r.user_phone) && r.latitude && r.longitude) {
                        seenPhones.add(r.user_phone);
                        window.updateCitizenLivePosition(
                            r.user_phone,
                            parseFloat(r.latitude),
                            parseFloat(r.longitude),
                            r.travel_mode || 'Normal',
                            r.alert_status || 'normal'
                        );
                    }
                });
            }
        } catch (e) {}
    }, 1500);

    // Controlled fallback polling every 8 seconds for dashboard stats
    const pollingTimer = setInterval(async () => {
        await fetchRealPoliceStats();
        await fetchRealEmergencyAlerts();
        await fetchRealPatrolUnits();
    }, 8000);

    // Clean up channel & timers on window unload
    window.addEventListener('beforeunload', () => {
        clearInterval(pollingTimer);
        clearInterval(telemetryTimer);
        if (realtimeChannel && supabase) {
            supabase.removeChannel(realtimeChannel);
        }
    });

    /* ==========================================================================
       10. INITIAL DATA BOOTSTRAP
       ========================================================================== */
    async function initDashboardData() {
        await loadUsersCache();
        await fetchRealPoliceStats();
        await fetchRealEmergencyAlerts();
        await loadNearbyPoliceStations();
        await fetchRealPatrolUnits();
    }

    initDashboardData();
});
