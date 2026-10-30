/* ==============================================================================
   Jagruthi Officer Patrol Unit Tracking & Dispatch Controller
   Direct connection to Supabase real-time telemetry and dispatch workflow.
   ============================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;

    // 1. Authenticated Officer Session
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');

    if (isLoggedIn !== 'true' || userRole !== 'police') {
        window.location.href = '../../login.html';
        return;
    }

    const sessionName = (localStorage.getItem('fullName') || localStorage.getItem('userName') || '').trim();
    // Vineet is system administrator, not field patrol unit
    const isVineet = sessionName.toLowerCase().includes('vineet');
    const officerName = (!isVineet && sessionName) ? sessionName : 'Patrol Officer';
    const officerPhone = (!isVineet && localStorage.getItem('userPhone')) ? localStorage.getItem('userPhone') : '9845593427';
    const officerStation = localStorage.getItem('policeStation') || 'Command Center';
    const officerId = (!isVineet && localStorage.getItem('officerId')) ? localStorage.getItem('officerId') : 'PATROL-001';

    // Populate DOM
    const patrolOfficerName = document.getElementById('patrolOfficerName');
    const patrolOfficerStation = document.getElementById('patrolOfficerStation');
    const patrolOfficerId = document.getElementById('patrolOfficerId');
    const patrolOfficerPhone = document.getElementById('patrolOfficerPhone');
    const officerAvatarText = document.getElementById('officerAvatarText');

    if (patrolOfficerName) patrolOfficerName.innerText = officerName;
    if (patrolOfficerStation) patrolOfficerStation.innerText = officerStation;
    if (patrolOfficerId) patrolOfficerId.innerText = officerId;
    if (patrolOfficerPhone) patrolOfficerPhone.innerText = officerPhone;
    if (officerAvatarText) {
        officerAvatarText.innerText = officerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    // 2. State Management
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

    let isOnDuty = false;
    let watchId = null;
    let latestCoords = null;
    let lastUploadTime = 0;
    let patrolMap = null;
    let patrolMarker = null;
    let accuracyCircle = null;
    let victimMarker = null;
    let routePolyline = null;
    let activeDispatch = null;
    let realtimeChannel = null;

    // DOM Elements
    const btnDutyToggle = document.getElementById('btnDutyToggle');
    const btnDutyToggleText = document.getElementById('btnDutyToggleText');
    const dutyStatusBadge = document.getElementById('dutyStatusBadge');
    const dutyStatusText = document.getElementById('dutyStatusText');
    const dutyDescText = document.getElementById('dutyDescText');

    const gpsAccuracyText = document.getElementById('gpsAccuracyText');
    const gpsSpeedText = document.getElementById('gpsSpeedText');
    const gpsHeadingText = document.getElementById('gpsHeadingText');
    const gpsSyncText = document.getElementById('gpsSyncText');
    const gpsCoordsBadge = document.getElementById('gpsCoordsBadge');

    const activeDispatchCard = document.getElementById('activeDispatchCard');
    const dispVictimName = document.getElementById('dispVictimName');
    const dispAlertType = document.getElementById('dispAlertType');
    const dispLocationText = document.getElementById('dispLocationText');
    const dispDistanceEta = document.getElementById('dispDistanceEta');
    const dispCurrentStatus = document.getElementById('dispCurrentStatus');
    const dispReceivedTime = document.getElementById('dispReceivedTime');
    const dispatchSound = document.getElementById('dispatchSound');

    const btnOpenNav = document.getElementById('btnOpenNav');
    const btnAckDispatch = document.getElementById('btnAckDispatch');
    const btnEnRouteDispatch = document.getElementById('btnEnRouteDispatch');
    const btnArrivedDispatch = document.getElementById('btnArrivedDispatch');
    const btnCompleteDispatch = document.getElementById('btnCompleteDispatch');

    // 3. Initialize Mini Leaflet Map with Google Maps Tiles
    function initPatrolMap() {
        if (patrolMap) return;
        const container = document.getElementById('patrolMap');
        if (!container) return;

        patrolMap = L.map('patrolMap', { zoomControl: true }).setView([13.0380, 77.5120], 14);

        // Google Streets Tiles (No API Key Required via Google Tile Servers)
        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google Maps'
        }).addTo(patrolMap);
    }
    initPatrolMap();

    // 4. GPS Geolocation Tracking & Supabase Upload
    function startGpsTracking() {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your device browser.");
            return;
        }

        isOnDuty = true;
        updateDutyUi(true);

        const options = {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        };

        watchId = navigator.geolocation.watchPosition(
            handleGpsPosition,
            handleGpsError,
            options
        );
    }

    function stopGpsTracking() {
        isOnDuty = false;
        updateDutyUi(false);

        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }

        // Set unit status to offline in Supabase
        if (supabase) {
            supabase
                .from('police_units')
                .update({ status: 'offline' })
                .eq('phone', officerPhone)
                .then(() => console.log("Officer unit marked offline in Supabase."));
        }

        if (gpsSyncText) gpsSyncText.innerText = "Offline (Off-Duty)";
    }

    function updateDutyUi(onDuty) {
        if (onDuty) {
            dutyStatusBadge.className = 'duty-status-badge on-duty';
            dutyStatusText.innerText = 'ON DUTY';
            btnDutyToggle.className = 'btn-duty-toggle active';
            btnDutyToggleText.innerText = 'Go Off-Duty';
            dutyDescText.innerText = 'Broadcasting live patrol GPS to Jagruthi Command';
        } else {
            dutyStatusBadge.className = 'duty-status-badge off-duty';
            dutyStatusText.innerText = 'OFF DUTY';
            btnDutyToggle.className = 'btn-duty-toggle';
            btnDutyToggleText.innerText = 'Go On-Duty';
            dutyDescText.innerText = 'Start real-time GPS streaming to command center';
        }
    }

    async function handleGpsPosition(pos) {
        latestCoords = pos.coords;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        const speed = pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) : 0;
        const heading = pos.coords.heading ? `${Math.round(pos.coords.heading)}°` : '—';

        // Update telemetry stats
        if (gpsAccuracyText) gpsAccuracyText.innerText = `± ${accuracy}m`;
        if (gpsSpeedText) gpsSpeedText.innerText = `${speed} km/h`;
        if (gpsHeadingText) gpsHeadingText.innerText = heading;
        if (gpsCoordsBadge) gpsCoordsBadge.innerText = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;

        // Update Mini Map
        if (patrolMap) {
            const latLng = [lat, lng];

            if (!patrolMarker) {
                const patrolIcon = L.divIcon({
                    html: `
                        <div style="position:relative; display:flex; align-items:center; justify-content:center;">
                            <div style="width:24px; height:24px; border-radius:50%; background:#1E60FF; border:3px solid #FFFFFF; box-shadow:0 0 14px rgba(30,96,255,0.9); display:flex; align-items:center; justify-content:center; color:white; font-size:12px;">
                                <i class="las la-car"></i>
                            </div>
                        </div>
                    `,
                    className: '',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });
                patrolMarker = L.marker(latLng, { icon: patrolIcon }).addTo(patrolMap);
                accuracyCircle = L.circle(latLng, { radius: accuracy, color: '#1E60FF', fillOpacity: 0.15 }).addTo(patrolMap);
                patrolMap.setView(latLng, 16);
            } else {
                patrolMarker.setLatLng(latLng);
                accuracyCircle.setLatLng(latLng);
                accuracyCircle.setRadius(accuracy);
            }
        }

        // Throttle Supabase updates to every 6 seconds to prevent network saturation
        const now = Date.now();
        if (now - lastUploadTime > 6000) {
            lastUploadTime = now;
            await streamLocationToSupabase(lat, lng);
        }
    }

    function handleGpsError(err) {
        console.warn("GPS Geolocation error:", err.message);
        if (gpsSyncText) gpsSyncText.innerText = `GPS Error: ${err.message}`;
    }

    async function streamLocationToSupabase(lat, lng) {
        if (!supabase) return;

        try {
            // 1. Update live_locations table
            await supabase.from('live_locations').insert([{
                user_phone: officerPhone,
                latitude: lat,
                longitude: lng,
                travel_mode: 'Patrol Vehicle',
                alert_status: activeDispatch ? 'assigned' : 'available',
                created_at: new Date().toISOString()
            }]);

            // 2. Update police_units table status
            await supabase.from('police_units').update({
                status: activeDispatch ? 'assigned' : 'available'
            }).eq('phone', officerPhone);

            if (gpsSyncText) {
                const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                gpsSyncText.innerText = `Synced at ${timeStr}`;
            }
        } catch (e) {
            console.error("Exception streaming patrol GPS to Supabase:", e);
        }
    }

    // Duty button toggle event
    btnDutyToggle.addEventListener('click', () => {
        if (!isOnDuty) {
            startGpsTracking();
        } else {
            stopGpsTracking();
        }
    });

    // 5. Emergency Dispatch Subscription & Workflow
    function listenForDispatches() {
        if (!supabase) return;

        try {
            // Check for existing active dispatch on startup
            checkForAssignedDispatches();

            // Realtime listener on emergency_alerts
            realtimeChannel = supabase.channel('patrol_unit_alert_feed')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, async (payload) => {
                    console.log("Patrol Realtime Alert update:", payload);
                    await checkForAssignedDispatches();
                })
                .subscribe();
        } catch (e) {
            console.warn("Realtime dispatch listener error:", e);
        }
    }

    async function checkForAssignedDispatches() {
        if (!supabase) return;

        try {
            const { data: alerts } = await supabase
                .from('emergency_alerts')
                .select('*')
                .eq('status', 'active');

            if (!alerts || alerts.length === 0) {
                clearActiveDispatch();
                return;
            }

            // Find alert assigned to this officer's phone or officer ID
            const myDispatch = alerts.find(a => 
                a.message && (
                    a.message.includes(`PHONE: ${officerPhone}`) || 
                    a.message.includes(`OFFICER: ${officerId}`) ||
                    a.message.includes(officerPhone)
                )
            );

            if (myDispatch) {
                handleNewDispatch(myDispatch);
            } else {
                clearActiveDispatch();
            }
        } catch (e) {
            console.error("Error checking assigned dispatches:", e);
        }
    }

    function handleNewDispatch(alert) {
        activeDispatch = alert;

        if (activeDispatchCard) activeDispatchCard.style.display = 'block';
        if (dispVictimName) dispVictimName.innerText = alert.user_phone || 'Distress Citizen';
        if (dispAlertType) dispAlertType.innerText = alert.alert_type || 'Emergency SOS';
        if (dispReceivedTime) dispReceivedTime.innerText = `Received ${parseUtcDate(alert.created_at).toLocaleTimeString()}`;

        // Extract escalation status
        const escalation = alert.police_escalation || 'ASSIGNED';
        if (dispCurrentStatus) dispCurrentStatus.innerText = escalation;

        // Button state progression
        updateLifecycleButtons(escalation);

        // Turn-by-Turn GPS button
        if (btnOpenNav && alert.latitude && alert.longitude) {
            btnOpenNav.onclick = () => {
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${alert.latitude},${alert.longitude}`, '_blank');
            };
        }

        // Draw victim on map and route
        if (patrolMap && alert.latitude && alert.longitude) {
            const victimLatLng = [parseFloat(alert.latitude), parseFloat(alert.longitude)];

            if (!victimMarker) {
                const victimIcon = L.divIcon({
                    html: `
                        <div style="width:26px; height:26px; border-radius:50%; background:#F41464; border:3px solid white; box-shadow:0 0 14px #F41464; display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:800;">
                            !
                        </div>
                    `,
                    className: '',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });
                victimMarker = L.marker(victimLatLng, { icon: victimIcon }).addTo(patrolMap)
                    .bindPopup(`<b>🚨 SOS Target</b><br>${alert.user_phone}`);
            } else {
                victimMarker.setLatLng(victimLatLng);
            }

            // Draw OSRM route if patrol position is known
            if (latestCoords) {
                drawRoadRoute(latestCoords.latitude, latestCoords.longitude, alert.latitude, alert.longitude);
            }
        }

        // Sound alert
        try {
            if (dispatchSound) dispatchSound.play().catch(() => {});
        } catch (e) {}
    }

    function updateLifecycleButtons(status) {
        if (!btnAckDispatch) return;

        if (status === 'ASSIGNED' || status === 'PENDING') {
            btnAckDispatch.disabled = false;
            btnEnRouteDispatch.disabled = true;
            btnArrivedDispatch.disabled = true;
            btnCompleteDispatch.disabled = true;
        } else if (status === 'ACKNOWLEDGED') {
            btnAckDispatch.disabled = true;
            btnEnRouteDispatch.disabled = false;
            btnArrivedDispatch.disabled = true;
            btnCompleteDispatch.disabled = true;
        } else if (status === 'EN_ROUTE' || status === 'ACTIVE') {
            btnAckDispatch.disabled = true;
            btnEnRouteDispatch.disabled = true;
            btnArrivedDispatch.disabled = false;
            btnCompleteDispatch.disabled = true;
        } else if (status === 'ARRIVED') {
            btnAckDispatch.disabled = true;
            btnEnRouteDispatch.disabled = true;
            btnArrivedDispatch.disabled = true;
            btnCompleteDispatch.disabled = false;
        }
    }

    async function drawRoadRoute(lat1, lon1, lat2, lon2) {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;

        try {
            const res = await fetch(osrmUrl);
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const km = (route.distance / 1000).toFixed(1);
                const mins = Math.round(route.duration / 60);

                if (dispDistanceEta) dispDistanceEta.innerText = `${km} km (~${mins} mins ETA)`;

                if (routePolyline) patrolMap.removeLayer(routePolyline);
                routePolyline = L.geoJSON(route.geometry, {
                    style: { color: '#F41464', weight: 5, dashArray: '8, 8', opacity: 0.85 }
                }).addTo(patrolMap);

                patrolMap.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });
            }
        } catch (e) {
            console.warn("Could not query road route:", e);
        }
    }

    function clearActiveDispatch() {
        activeDispatch = null;
        if (activeDispatchCard) activeDispatchCard.style.display = 'none';
        if (victimMarker && patrolMap) {
            patrolMap.removeLayer(victimMarker);
            victimMarker = null;
        }
        if (routePolyline && patrolMap) {
            patrolMap.removeLayer(routePolyline);
            routePolyline = null;
        }
    }

    // Lifecycle Action Buttons
    if (btnAckDispatch) {
        btnAckDispatch.addEventListener('click', async () => {
            if (!activeDispatch || !supabase) return;
            btnAckDispatch.disabled = true;
            await supabase.from('emergency_alerts').update({
                police_escalation: 'ACKNOWLEDGED',
                message: `${activeDispatch.message} | [STATUS: ACKNOWLEDGED at ${new Date().toLocaleTimeString()}]`
            }).eq('id', activeDispatch.id);
            updateLifecycleButtons('ACKNOWLEDGED');
            if (dispCurrentStatus) dispCurrentStatus.innerText = 'ACKNOWLEDGED';
        });
    }

    if (btnEnRouteDispatch) {
        btnEnRouteDispatch.addEventListener('click', async () => {
            if (!activeDispatch || !supabase) return;
            btnEnRouteDispatch.disabled = true;
            await supabase.from('emergency_alerts').update({
                police_escalation: 'EN_ROUTE',
                message: `${activeDispatch.message} | [STATUS: EN_ROUTE at ${new Date().toLocaleTimeString()}]`
            }).eq('id', activeDispatch.id);
            updateLifecycleButtons('EN_ROUTE');
            if (dispCurrentStatus) dispCurrentStatus.innerText = 'EN ROUTE';
        });
    }

    if (btnArrivedDispatch) {
        btnArrivedDispatch.addEventListener('click', async () => {
            if (!activeDispatch || !supabase) return;
            btnArrivedDispatch.disabled = true;
            await supabase.from('emergency_alerts').update({
                police_escalation: 'ARRIVED',
                message: `${activeDispatch.message} | [STATUS: ARRIVED at ${new Date().toLocaleTimeString()}]`
            }).eq('id', activeDispatch.id);
            updateLifecycleButtons('ARRIVED');
            if (dispCurrentStatus) dispCurrentStatus.innerText = 'ARRIVED';
        });
    }

    if (btnCompleteDispatch) {
        btnCompleteDispatch.addEventListener('click', async () => {
            if (!activeDispatch || !supabase) return;
            if (!confirm("Confirm case resolved and return patrol unit to available pool?")) return;

            btnCompleteDispatch.disabled = true;
            await supabase.from('emergency_alerts').update({
                status: 'resolved',
                police_escalation: 'RESOLVED',
                message: `${activeDispatch.message} | [RESOLVED: Action completed by Officer ${officerName}]`
            }).eq('id', activeDispatch.id);

            await supabase.from('police_units').update({
                status: 'available'
            }).eq('phone', officerPhone);

            clearActiveDispatch();
            alert("Emergency dispatch marked resolved and unit returned to Available status.");
        });
    }

    // Polling fallback every 8 seconds
    setInterval(checkForAssignedDispatches, 8000);
    listenForDispatches();

    // Auto-prompt to go on duty
    setTimeout(() => {
        if (!isOnDuty) {
            startGpsTracking();
        }
    }, 500);

    // Unload cleanup
    window.addEventListener('beforeunload', () => {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (realtimeChannel && supabase) supabase.removeChannel(realtimeChannel);
    });
});
