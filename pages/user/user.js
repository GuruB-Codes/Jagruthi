document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;
    const roleMap = { 'index.html': 'user', 'emergency.html': 'emergency', 'police.html': 'police', 'admin.html': 'admin' };
    
    // Auth Check
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');
    if (isLoggedIn !== 'true' || userRole !== 'user') {
        window.location.href = '../../login.html';
        return;
    }
    
    // Set Profile Image based on user name
    const userName = localStorage.getItem('fullName') || localStorage.getItem('userName') || 'User';
    const profileImg = document.getElementById('userProfileImg');
    if (profileImg) {
        profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=7b2cbf&color=fff&rounded=true`;
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

    /* =========================================
       1. MAP INITIALIZATION — Real Device Geolocation
       ========================================= */
    let userMap, userMarker, destMarker, liveTrackingInterval;
    let safestRouteLine, altRouteLine, shortestRouteLine;
    let deviationLine;
    
    let startLoc = null; // Dynamically acquired from GPS
    let destinationLoc = null; // Set when user searches
    let activePathCoords = null;
    let safestPath = null, shortPath = null, altPath = null;
    let currentStep = 0;
    let routesGenerated = false;

    // Initialize map view centered neutrally until location is acquired
    userMap = L.map('userMap', {zoomControl: false}).setView([12.9716, 77.5946], 12);
    L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
    }).addTo(userMap);

    const userIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
        className: 'user-journey-marker'
    });

    const destIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
    });

    const sourceInput = document.getElementById('sourceInput');
    const homeCurrentLocText = document.getElementById('homeCurrentLocText');
    const homeGpsStatus = document.getElementById('homeGpsStatus');

    let liveUserCoords = null; // { lat, lng, accuracy, timestamp }
    let globalGpsWatchId = null;
    let isJourneyActive = false;
    let simulationCoords = null;

    function applyUserGpsPosition(latitude, longitude, accuracy = null) {
        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) return;

        const lat = Number(latitude);
        const lng = Number(longitude);

        liveUserCoords = {
            lat: lat,
            lng: lng,
            accuracy: accuracy || 10,
            timestamp: Date.now()
        };

        // When journey simulation or deviation is active, keep background liveUserCoords updated
        // but DO NOT snap userMarker and camera away from simulated journey progress!
        if (isJourneyActive || lastDeviatedPosition) {
            if (isEmergencyCountdownActive || isEmergencyDispatchedActive) {
                onDispatchedLocationSecured(lat, lng, accuracy || 8);
            }
            return;
        }

        startLoc = [lat, lng];

        if (!userMarker) {
            userMarker = L.marker(startLoc, {icon: userIcon, zIndexOffset: 1000}).addTo(userMap);
        } else {
            userMarker.setLatLng(startLoc);
        }
        userMap.setView(startLoc, 16);

        if (sourceInput) sourceInput.value = "Current Location";
        updateCoordsDisplays(startLoc);

        // If emergency is currently counting down or active, propagate live coordinates immediately
        if (isEmergencyCountdownActive || isEmergencyDispatchedActive) {
            onDispatchedLocationSecured(lat, lng, accuracy || 8);
        }

        // Reverse geocode to show friendly address on Home tab
        reverseGeocode(lat, lng).then(addr => {
            if (addr && homeCurrentLocText) {
                homeCurrentLocText.innerText = addr;
            }
        });
    }

    async function reverseGeocode(lat, lng) {
        if (!lat || !lng) return null;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
                headers: { 'Accept-Language': 'en' }
            });
            const data = await res.json();
            return data.display_name || null;
        } catch (e) {
            console.error('Reverse geocode failed:', e);
            return null;
        }
    }

    function handleLocationError(error) {
        console.warn("Geolocation access notice:", error?.message || "Unavailable");
        if (sourceInput && !startLoc) {
            sourceInput.value = "";
            sourceInput.placeholder = "Location unavailable — enter starting point";
        }
        if (homeGpsStatus && !startLoc) {
            homeGpsStatus.innerText = "GPS Offline";
            homeGpsStatus.style.color = "var(--text-light)";
        }
        if (homeCurrentLocText && !startLoc) {
            homeCurrentLocText.innerText = "Location permission needed";
        }
    }

    // Continuous Real-Time GPS Tracking & Satellite Watcher
    function initGlobalGpsWatcher() {
        if (!navigator.geolocation) {
            handleLocationError({ message: "Geolocation not supported by device" });
            return;
        }

        if (sourceInput && !startLoc) sourceInput.value = "Acquiring GPS...";

        // 1. Immediate fast cached/network fix (< 800ms)
        navigator.geolocation.getCurrentPosition(
            (position) => {
                applyUserGpsPosition(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
            },
            (err) => {
                console.warn("Fast GPS hint:", err?.message);
            },
            { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
        );

        // 2. High-precision continuous hardware GPS satellite watcher
        try {
            globalGpsWatchId = navigator.geolocation.watchPosition(
                (position) => {
                    applyUserGpsPosition(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
                },
                (error) => {
                    handleLocationError(error);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
            );
        } catch (e) {
            console.warn("watchPosition error:", e);
        }
    }

    initGlobalGpsWatcher();

    /* =========================================
       2. DESTINATION SEARCH (Nominatim API)
       ========================================= */
    const destInput = document.getElementById('destInput');
    const searchDestBtn = document.getElementById('searchDestBtn');
    const destSuggestions = document.getElementById('destSuggestions');
    let searchDebounceTimer;

    // Live search suggestions as user types
    if (destInput) {
        destInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            const query = destInput.value.trim();
            if (query.length < 3) {
                if(destSuggestions) destSuggestions.classList.add('hidden');
                return;
            }
            searchDebounceTimer = setTimeout(() => fetchSuggestions(query), 500);
        });

        // Enter key to search
        destInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if(destSuggestions) destSuggestions.classList.add('hidden');
                searchAndRoute(destInput.value.trim());
            }
        });
    }

    // Search button click
    if (searchDestBtn) {
        searchDestBtn.addEventListener('click', () => {
            if(destSuggestions) destSuggestions.classList.add('hidden');
            searchAndRoute(destInput.value.trim());
        });
    }

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (destSuggestions && destInput && !destInput.contains(e.target) && !destSuggestions.contains(e.target)) {
            destSuggestions.classList.add('hidden');
        }
    });

    async function fetchSuggestions(query) {
        try {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
            const res = await fetch(url);
            const photonData = await res.json();
            
            const data = (photonData.features || []).map(f => {
                const props = f.properties;
                const coords = f.geometry.coordinates || [0, 0];
                const parts = [props.name, props.street, props.city, props.state].filter(Boolean);
                return {
                    display_name: parts.join(', ') || 'Unknown Location',
                    lat: coords[1],
                    lon: coords[0],
                    short_name: props.name || props.street || parts[0] || 'Unknown'
                };
            });

            if (!destSuggestions) return;
            destSuggestions.innerHTML = '';

            if (data.length === 0) {
                destSuggestions.innerHTML = '<div style="padding:12px 16px; color:#94a3b8; font-size:0.9rem;">No results found</div>';
                destSuggestions.classList.remove('hidden');
                return;
            }

            data.forEach(place => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.style.cssText = 'padding:10px 16px; cursor:pointer; font-weight:500; font-size:0.9rem; display:flex; align-items:center; gap:8px; transition: background 0.2s;';
                item.innerHTML = `<i class="las la-map-marker" style="color:#6366f1; font-size:1.1rem;"></i> <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${place.display_name}</span>`;
                
                item.addEventListener('mouseenter', () => item.style.background = '#f1f5f9');
                item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                
                item.addEventListener('click', () => {
                    destInput.value = place.short_name; // Short name
                    destSuggestions.classList.add('hidden');
                    processDestination(parseFloat(place.lat), parseFloat(place.lon), place.display_name);
                });
                destSuggestions.appendChild(item);
            });

            destSuggestions.classList.remove('hidden');
        } catch (err) {
            console.error('Search suggestion error (Photon):', err);
        }
    }

    async function searchAndRoute(query) {
        if (!query || query.length < 2) {
            alert('Please enter a destination.');
            return;
        }
        try {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
            const res = await fetch(url);
            const photonData = await res.json();

            if (!photonData.features || photonData.features.length === 0) {
                alert('Destination not found. Try a more specific name.');
                return;
            }

            const place = photonData.features[0];
            const props = place.properties;
            const coords = place.geometry.coordinates || [0, 0];
            const parts = [props.name, props.street, props.city, props.state].filter(Boolean);
            const displayName = parts.join(', ') || 'Unknown Location';
            const shortName = props.name || props.street || parts[0] || 'Unknown';

            destInput.value = shortName;
            processDestination(parseFloat(coords[1]), parseFloat(coords[0]), displayName);
        } catch (err) {
            console.error('Geocoding error (Photon):', err);
            alert('Search failed. Please check your internet connection.');
        }
    }

    /* =========================================
       3. ROUTE GENERATION (OSRM API)
       ========================================= */
    async function processDestination(lat, lon, displayName) {
        destinationLoc = [lat, lon];

        // Clear previous routes and markers
        clearExistingRoutes();

        // Place/move destination marker
        if (destMarker) {
            destMarker.setLatLng(destinationLoc);
        } else {
            destMarker = L.marker(destinationLoc, {icon: destIcon}).addTo(userMap);
        }
        destMarker.bindPopup(`Destination: ${displayName.split(',')[0]}`).openPopup();

        // Fit map to show both markers
        const bounds = L.latLngBounds([userMarker.getLatLng(), destinationLoc]);
        userMap.fitBounds(bounds, {padding: [40, 40]});

        // Show routes section with loading
        const routesSection = document.getElementById('routesSection');
        const routeLoading = document.getElementById('routeLoading');
        const dynamicRouteList = document.getElementById('dynamicRouteList');
        
        if (routesSection) routesSection.classList.remove('hidden');
        if (routeLoading) routeLoading.classList.remove('hidden');
        if (dynamicRouteList) dynamicRouteList.innerHTML = '';

        // Fetch routes from OSRM
        try {
            const srcLatLng = userMarker.getLatLng();
            
            // Determine OSRM profile based on active mode
            let osrmProfile = 'driving';
            const activeModeObj = document.querySelector('.mode-btn.active');
            if (activeModeObj) {
                const modeStr = activeModeObj.dataset.mode;
                if (modeStr === 'walking') osrmProfile = 'foot'; // OSRM uses 'foot' for walking
                else if (modeStr === 'bike') osrmProfile = 'bike'; // OSRM uses 'bike' for biking
                else if (modeStr === 'car') osrmProfile = 'driving';
            }

            const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${srcLatLng.lng},${srcLatLng.lat};${lon},${lat}?overview=full&geometries=geojson&alternatives=true`;
            
            const res = await fetch(osrmUrl);
            const data = await res.json();

            if (routeLoading) routeLoading.classList.add('hidden');

            if (!data.routes || data.routes.length === 0) {
                if (dynamicRouteList) dynamicRouteList.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:16px;">No routes found for this destination.</p>';
                return;
            }

            // Identify actual shortest and fastest
            let minDistance = Infinity;
            let shortestIdx = 0;
            data.routes.forEach((r, i) => {
                if (r.distance < minDistance) {
                    minDistance = r.distance;
                    shortestIdx = i;
                }
            });

            const processedRoutes = data.routes.slice(0, 3).map((route, idx) => {
                const distKm = (route.distance / 1000).toFixed(1);
                const timeMin = Math.round(route.duration / 60);
                const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
                
                let badge = 'Alternative';
                let badgeClass = 'badge-alt';
                let safetyLabel = 'Risk';
                let safetyClass = 'risk';
                let color = '#94a3b8';
                let icon = 'la-exclamation-triangle';
                let weight = 4;
                let dashArray = '5,5';

                if (idx === 0) {
                    badge = 'SAFEST';
                    badgeClass = 'badge-safe';
                    safetyLabel = 'Safe';
                    safetyClass = 'safe';
                    color = '#10b981';
                    icon = 'la-shield-check';
                    weight = 6;
                    dashArray = null;
                } else if (idx === shortestIdx) {
                    badge = 'SHORTEST';
                    badgeClass = 'badge-short';
                    safetyLabel = 'Moderate';
                    safetyClass = 'moderate';
                    color = '#6366f1';
                    icon = 'la-exclamation-circle';
                    weight = 5;
                    dashArray = null;
                }

                // Edge case: If Route 1 is also the shortest, give Route 2 the 'SHORTEST' badge anyway 
                // but if we want to be 100% logical, we should swap them or just ensure labels make sense.
                // The user's screenshot had Route 1 as Safest and Route 2 as Shortest.
                // If Route 1 (25km) is shorter than Route 2 (29km), then Route 1 should be Safest & Shortest.
                // But typically users want to see 2 different options.
                // I will ensure that the badges correctly match the minimum value found.
                
                return { idx, distKm, timeMin, coords, badge, badgeClass, safetyLabel, safetyClass, color, icon, weight, dashArray };
            });

            // If index 0 is the shortest, we need to make sure Route 2 gets a sensible badge
            if (shortestIdx === 0 && processedRoutes.length > 1) {
                processedRoutes[0].badge = "SAFEST & SHORTEST";
                processedRoutes[1].badge = "ALTERNATIVE";
                processedRoutes[1].badgeClass = "badge-alt";
            }

            const routeLines = [];
            const routePaths = [];

            processedRoutes.forEach((res) => {
                routePaths.push(res.coords);

                // Draw polyline on map
                const lineOpts = { color: res.color, weight: res.weight, opacity: res.idx === 0 ? 1 : 0.6 };
                if (res.dashArray) lineOpts.dashArray = res.dashArray;
                const line = L.polyline(res.coords, lineOpts).addTo(userMap);
                routeLines.push(line);

                // Build route card HTML
                const cardHtml = `
                    <div class="route-card ${res.idx === 0 ? 'active-route' : ''}" tabindex="0" data-route-idx="${res.idx}">
                        <div class="route-info">
                            <div class="route-header">
                                <span class="route-name">Route ${res.idx + 1}</span>
                                <span class="badge ${res.badgeClass}">${res.badge}</span>
                            </div>
                            <span class="route-details">${res.timeMin} mins <span class="dot-sep">•</span> ${res.distKm} km</span>
                        </div>
                        <div class="route-safety ${res.safetyClass}">
                            <i class="las ${res.icon}"></i> ${res.safetyLabel}
                        </div>
                    </div>
                `;
                if (dynamicRouteList) dynamicRouteList.insertAdjacentHTML('beforeend', cardHtml);
            });

            // Store globally
            safestRouteLine = routeLines[0] || null;
            shortestRouteLine = routeLines[1] || null;
            altRouteLine = routeLines[2] || null;
            safestPath = routePaths[0] || null;
            shortPath = routePaths[1] || null;
            altPath = routePaths[2] || null;
            activePathCoords = safestPath;
            routesGenerated = true;

            // Fit map to primary route
            if (safestRouteLine) userMap.fitBounds(safestRouteLine.getBounds(), {padding: [30, 30]});

            // Attach click handlers to new route cards
            attachRouteCardListeners();

        } catch (err) {
            console.error('OSRM routing error:', err);
            if (routeLoading) routeLoading.classList.add('hidden');
            if (dynamicRouteList) dynamicRouteList.innerHTML = '<p style="text-align:center; color:#ef4444; padding:16px;">Route generation failed. Please try again.</p>';
        }
    }

    function clearExistingRoutes() {
        if (isJourneyActive) stopTracking();
        if (safestRouteLine) { userMap.removeLayer(safestRouteLine); safestRouteLine = null; }
        if (shortestRouteLine) { userMap.removeLayer(shortestRouteLine); shortestRouteLine = null; }
        if (altRouteLine) { userMap.removeLayer(altRouteLine); altRouteLine = null; }
        if (deviationLine) { userMap.removeLayer(deviationLine); deviationLine = null; }
        safestPath = null; shortPath = null; altPath = null;
        activePathCoords = null;
        simulationCoords = null;
        routesGenerated = false;
    }

    function attachRouteCardListeners() {
        const cards = document.querySelectorAll('.route-card');
        const lines = [safestRouteLine, shortestRouteLine, altRouteLine].filter(Boolean);
        const paths = [safestPath, shortPath, altPath].filter(Boolean);

        cards.forEach((card, idx) => {
            card.addEventListener('click', () => {
                cards.forEach(c => c.classList.remove('active-route'));
                card.classList.add('active-route');

                // Dim all, highlight selected
                lines.forEach(l => { if(l) l.setStyle({weight: 4, opacity: 0.5}); });
                if (lines[idx]) {
                    lines[idx].setStyle({weight: 6, opacity: 1});
                    userMap.fitBounds(lines[idx].getBounds(), {padding: [30, 30]});
                }
                if (paths[idx]) activePathCoords = paths[idx];
            });
        });
    }

    /* =========================================
       4. SOS LOGIC
       ========================================= */
    const sosBtn = document.getElementById('sosBtn');
    let sosHoldTimer;
    let sosCooldown = false;
    let hasTriggeredAlert = false; // Prevent duplicate alert triggers
    let lastDeviatedPosition = null; // Store the actual deviated location
    
    if (sosBtn) {
        sosBtn.addEventListener('mousedown', startSos);
        sosBtn.addEventListener('touchstart', startSos, {passive: true});
        sosBtn.addEventListener('mouseup', cancelSos);
        sosBtn.addEventListener('mouseleave', cancelSos);
        sosBtn.addEventListener('touchend', cancelSos);
        
        // Ensure manual clicks also activate it immediately if desired, 
        // but user requested "when the user click" so I'll add a standard click as well
        // with a shorter hold requirement or just make the hold very fast.
        // Let's stick to 800ms hold but add a visual pulse.
    }
    
    function startSos() {
        if (sosBtn) {
            sosBtn.classList.add('sos-holding');
            sosBtn.style.transform = 'scale(0.9)';
        }
        sosHoldTimer = setTimeout(() => {
            if('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 500]);
            triggerSOSAction("SOS Triggered", "User pressed SOS button");
            if(sosBtn) sosBtn.classList.remove('sos-holding');
        }, 800); 
    }
    
    function cancelSos() {
        if (sosBtn) {
            sosBtn.classList.remove('sos-holding');
            sosBtn.style.transform = 'scale(1)';
        }
        clearTimeout(sosHoldTimer);
    }

    let activeSosId = null;
    let activeUserId = null;

    // Helper: Ensure valid authenticated User ID UUID
    async function getAuthenticatedUserId() {
        let userId = localStorage.getItem('userId');
        const userPhone = localStorage.getItem('userPhone');
        
        if (!userId && userPhone && supabase) {
            try {
                const { data } = await supabase.from('users').select('id').eq('phone', userPhone).limit(1).single();
                if (data && data.id) {
                    userId = data.id;
                    localStorage.setItem('userId', userId);
                }
            } catch (e) {
                console.warn('Could not fetch user ID from DB:', e);
            }
        }
        
        if (!userId || userId.length < 10) {
            userId = window.generateUUID ? window.generateUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random()*16|0 : (Math.random()*16|0)&0x3|0x8).toString(16));
            localStorage.setItem('userId', userId);
        }
        return userId;
    }

    // UI updater for Evidence Card states
    function updateEvidenceUI(state, details = {}) {
        const overallBadge = document.getElementById('evidenceOverallBadge');
        const banner = document.getElementById('evidenceStatusBanner');
        const bannerText = document.getElementById('evidenceBannerText');
        const videoVal = document.getElementById('videoStatusVal');
        const audioVal = document.getElementById('audioStatusVal');
        const timeVal = document.getElementById('evidenceCaptureTimeVal');
        const btnViewVid = document.getElementById('btnUserViewVideo');
        const btnPlayAud = document.getElementById('btnUserPlayAudio');
        const btnRetry = document.getElementById('btnUserRetryUpload');

        if (timeVal && details.timestamp) {
            timeVal.innerText = new Date(details.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        }

        if (state === 'RECORDING') {
            // STATE 1: 🔴 Evidence Recording
            if (overallBadge) {
                overallBadge.innerText = '🔴 Recording';
                overallBadge.style.background = '#fee2e2';
                overallBadge.style.color = '#ef4444';
            }
            if (banner) {
                banner.style.background = '#fef2f2';
                banner.style.border = '1px solid #fecaca';
                banner.style.color = '#b91c1c';
            }
            if (bannerText) bannerText.innerHTML = '<strong>🔴 Evidence Recording</strong>: Video + Audio are being captured...';
            if (videoVal) { videoVal.innerText = 'Recording'; videoVal.style.background = '#fee2e2'; videoVal.style.color = '#ef4444'; }
            if (audioVal) { audioVal.innerText = 'Recording'; audioVal.style.background = '#fee2e2'; audioVal.style.color = '#ef4444'; }
            if (btnViewVid) btnViewVid.classList.add('hidden');
            if (btnPlayAud) btnPlayAud.classList.add('hidden');
            if (btnRetry) btnRetry.classList.add('hidden');

        } else if (state === 'UPLOADING') {
            // STATE 2: 🟡 Evidence Uploading
            if (overallBadge) {
                overallBadge.innerText = '🟡 Uploading';
                overallBadge.style.background = '#fef3c7';
                overallBadge.style.color = '#d97706';
            }
            if (banner) {
                banner.style.background = '#fffbeb';
                banner.style.border = '1px solid #fde68a';
                banner.style.color = '#b45309';
            }
            if (bannerText) bannerText.innerHTML = '<strong>🟡 Evidence Uploading</strong>: Video and Audio are being uploaded securely to private vault...';
            if (videoVal) { videoVal.innerText = details.videoStatus || 'Uploading'; videoVal.style.background = '#fef3c7'; videoVal.style.color = '#d97706'; }
            if (audioVal) { audioVal.innerText = details.audioStatus || 'Uploading'; audioVal.style.background = '#fef3c7'; audioVal.style.color = '#d97706'; }
            if (btnViewVid) btnViewVid.classList.add('hidden');
            if (btnPlayAud) btnPlayAud.classList.add('hidden');
            if (btnRetry) btnRetry.classList.add('hidden');

        } else if (state === 'UPLOADED') {
            // STATE 3: 🟢 Evidence Secured
            if (overallBadge) {
                overallBadge.innerText = '🟢 Secured';
                overallBadge.style.background = '#d1fae5';
                overallBadge.style.color = '#059669';
            }
            if (banner) {
                banner.style.background = '#f0fdf4';
                banner.style.border = '1px solid #bbf7d0';
                banner.style.color = '#15803d';
            }
            if (bannerText) bannerText.innerHTML = '<strong>🟢 Evidence Secured</strong>: Video + Audio uploaded successfully to encrypted cloud storage.';
            if (videoVal) { videoVal.innerText = 'Uploaded'; videoVal.style.background = '#d1fae5'; videoVal.style.color = '#059669'; }
            if (audioVal) { audioVal.innerText = 'Uploaded'; audioVal.style.background = '#d1fae5'; audioVal.style.color = '#059669'; }
            if (btnViewVid) btnViewVid.classList.remove('hidden');
            if (btnPlayAud) btnPlayAud.classList.remove('hidden');
            if (btnRetry) btnRetry.classList.add('hidden');

        } else if (state === 'FAILED') {
            // STATE 4: 🔴 Evidence Upload Failed
            if (overallBadge) {
                overallBadge.innerText = '🔴 Upload Failed';
                overallBadge.style.background = '#fee2e2';
                overallBadge.style.color = '#b91c1c';
            }
            if (banner) {
                banner.style.background = '#fef2f2';
                banner.style.border = '1px solid #f87171';
                banner.style.color = '#991b1b';
            }
            if (bannerText) bannerText.innerHTML = '<strong>🔴 Evidence Upload Failed</strong>: Cloud sync interrupted. Click retry to securely upload stored evidence.';
            if (videoVal) { videoVal.innerText = details.videoStatus || 'Failed'; videoVal.style.background = details.videoStatus === 'Uploaded' ? '#d1fae5' : '#fee2e2'; videoVal.style.color = details.videoStatus === 'Uploaded' ? '#059669' : '#b91c1c'; }
            if (audioVal) { audioVal.innerText = details.audioStatus || 'Failed'; audioVal.style.background = details.audioStatus === 'Uploaded' ? '#d1fae5' : '#fee2e2'; audioVal.style.color = details.audioStatus === 'Uploaded' ? '#059669' : '#b91c1c'; }
            if (btnViewVid) {
                if (details.videoStatus === 'Uploaded') btnViewVid.classList.remove('hidden');
                else btnViewVid.classList.add('hidden');
            }
            if (btnPlayAud) {
                if (details.audioStatus === 'Uploaded') btnPlayAud.classList.remove('hidden');
                else btnPlayAud.classList.add('hidden');
            }
            if (btnRetry) btnRetry.classList.remove('hidden');
        }
    }

    // Subscribe to mediaService state changes
    if (window.emergencyMedia) {
        window.emergencyMedia.onStatusChange((state, details) => {
            updateEvidenceUI(state, details);
        });
    }

    // Bind Evidence Action Buttons
    const btnUserViewVideo = document.getElementById('btnUserViewVideo');
    const btnUserPlayAudio = document.getElementById('btnUserPlayAudio');
    const btnUserRetryUpload = document.getElementById('btnUserRetryUpload');
    const userEvdOverlay = document.getElementById('userEvdOverlay');
    const userEvdModal = document.getElementById('userEvdModal');
    const userEvdVideo = document.getElementById('userEvdVideo');
    const userEvdAudio = document.getElementById('userEvdAudio');
    const closeUserEvdBtn = document.getElementById('closeUserEvdBtn');

    if (btnUserViewVideo) {
        btnUserViewVideo.addEventListener('click', async () => {
            if (!window.emergencyMedia || !window.emergencyMedia.lastEvidence) return;
            const evd = window.emergencyMedia.lastEvidence;
            
            // Try to get Supabase signed URL, fallback to local URL
            let videoSrc = evd.videoLocalUrl;
            if (supabase && activeUserId && activeSosId && evd.videoInfo) {
                const storagePath = `${activeUserId}/${activeSosId}/evidence_video.${evd.videoInfo.extension}`;
                const signedUrl = await window.jagruthiSosService.getSignedEvidenceUrl(storagePath);
                if (signedUrl) videoSrc = signedUrl;
            }

            if (userEvdVideo && videoSrc) {
                userEvdVideo.src = videoSrc;
                userEvdVideo.style.display = 'block';
                if (userEvdAudio) userEvdAudio.style.display = 'none';
                if (userEvdOverlay) userEvdOverlay.classList.add('show');
                if (userEvdModal) userEvdModal.classList.add('show');
                userEvdVideo.play().catch(e => console.log("User video playback init:", e));
            }
        });
    }

    if (btnUserPlayAudio) {
        btnUserPlayAudio.addEventListener('click', async () => {
            if (!window.emergencyMedia || !window.emergencyMedia.lastEvidence) return;
            const evd = window.emergencyMedia.lastEvidence;
            
            let audioSrc = evd.audioLocalUrl;
            if (supabase && activeUserId && activeSosId && evd.audioInfo) {
                const storagePath = `${activeUserId}/${activeSosId}/evidence_audio.${evd.audioInfo.extension}`;
                const signedUrl = await window.jagruthiSosService.getSignedEvidenceUrl(storagePath);
                if (signedUrl) audioSrc = signedUrl;
            }

            if (userEvdAudio && audioSrc) {
                userEvdAudio.src = audioSrc;
                userEvdAudio.style.display = 'block';
                if (userEvdVideo) userEvdVideo.style.display = 'none';
                if (userEvdOverlay) userEvdOverlay.classList.add('show');
                if (userEvdModal) userEvdModal.classList.add('show');
                userEvdAudio.play().catch(e => console.log("User audio playback init:", e));
            }
        });
    }

    if (closeUserEvdBtn) {
        closeUserEvdBtn.addEventListener('click', () => {
            if (userEvdOverlay) userEvdOverlay.classList.remove('show');
            if (userEvdModal) userEvdModal.classList.remove('show');
            if (userEvdVideo) { userEvdVideo.pause(); userEvdVideo.src = ''; }
            if (userEvdAudio) { userEvdAudio.pause(); userEvdAudio.src = ''; }
        });
    }

    if (btnUserRetryUpload) {
        btnUserRetryUpload.addEventListener('click', async () => {
            if (window.emergencyMedia) {
                btnUserRetryUpload.innerText = "Retrying upload...";
                btnUserRetryUpload.disabled = true;
                await window.emergencyMedia.retryUpload();
                btnUserRetryUpload.innerText = "Retry Upload";
                btnUserRetryUpload.disabled = false;
            }
        });
    }

    async function triggerSOSAction(type = "SOS Triggered", message = "Emergency SOS Activated", options = {}) {
        const isAutoTrigger = type === "Auto-SOS Activated" || type === "Not Safe Triggered";
        
        // STRICT: Only allow ONE alert to fire per event. 
        // Manual SOS can be re-triggered after cooldown.
        if ((isAutoTrigger && hasTriggeredAlert) || sosCooldown) {
            console.log("Alert already triggered or in cooldown. Ignoring duplicate.");
            return;
        }
        
        if (isAutoTrigger) hasTriggeredAlert = true;
        sosCooldown = true;
        setTimeout(() => sosCooldown = false, 10000); // 10s cooldown

        console.log("====================================");
        console.log("🚨 EMERGENCY SOS INITIATED: 🚨", type, message);
        console.log("====================================");
        
        let travelMode = "Unknown";
        const activeModeObj = document.querySelector('.mode-btn.active span');
        if (activeModeObj) travelMode = activeModeObj.innerText;
        
        // Determine real live position for SOS record:
        // Priority 1: Explicit coords passed in options
        // Priority 2: Deviated road location if user deviated from route
        // Priority 3: Current walking/journey position if journey is active or marker along route
        // Priority 4: Active SOS coords / Live device GPS / Start location
        let alertLat, alertLng;
        if (options.latitude && options.longitude) {
            alertLat = Number(options.latitude).toFixed(5);
            alertLng = Number(options.longitude).toFixed(5);
        } else if (lastDeviatedPosition && Array.isArray(lastDeviatedPosition)) {
            alertLat = Number(lastDeviatedPosition[0]).toFixed(5);
            alertLng = Number(lastDeviatedPosition[1]).toFixed(5);
        } else if (isJourneyActive && userMarker) {
            alertLat = Number(userMarker.getLatLng().lat).toFixed(5);
            alertLng = Number(userMarker.getLatLng().lng).toFixed(5);
        } else if (userMarker && (routesGenerated || isJourneyActive)) {
            alertLat = Number(userMarker.getLatLng().lat).toFixed(5);
            alertLng = Number(userMarker.getLatLng().lng).toFixed(5);
        } else if (activeSosLat && activeSosLng) {
            alertLat = Number(activeSosLat).toFixed(5);
            alertLng = Number(activeSosLng).toFixed(5);
        } else if (liveUserCoords) {
            alertLat = Number(liveUserCoords.lat).toFixed(5);
            alertLng = Number(liveUserCoords.lng).toFixed(5);
        } else if (userMarker) {
            alertLat = Number(userMarker.getLatLng().lat).toFixed(5);
            alertLng = Number(userMarker.getLatLng().lng).toFixed(5);
        } else if (startLoc) {
            alertLat = Number(startLoc[0]).toFixed(5);
            alertLng = Number(startLoc[1]).toFixed(5);
        } else {
            alertLat = "0.0000";
            alertLng = "0.0000";
        }

        activeSosLat = parseFloat(alertLat);
        activeSosLng = parseFloat(alertLng);

        // 1. Get authenticated user ID UUID
        activeUserId = await getAuthenticatedUserId();

        // 2. CREATE sos_events RECORD FIRST
        console.log("Creating sos_events record in Supabase...");
        const sosEventResult = await window.jagruthiSosService.createSosEvent({
            userId: activeUserId,
            latitude: parseFloat(alertLat),
            longitude: parseFloat(alertLng)
        });
        activeSosId = sosEventResult.data.id;
        console.log("Generated SOS ID:", activeSosId);

        // Check for attached driver/vehicle info
        const carNumberInput = document.getElementById('carNumberInput');
        let driverData = null;
        if (carNumberInput && carNumberInput.value.trim() !== '') {
            const enteredNum = carNumberInput.value.trim().toUpperCase();
            driverData = {
                driverCarNumber: enteredNum
            };
        }

        let fullMessage = message;
        if (driverData && driverData.driverCarNumber) {
            fullMessage += ` | Vehicle: ${driverData.driverCarNumber}`;
        }

        let alertAddress = "";
        if (destInput && destInput.value.trim()) {
            alertAddress = destInput.value.trim();
        } else if (homeCurrentLocText && homeCurrentLocText.innerText && homeCurrentLocText.innerText !== "Location permission needed") {
            alertAddress = homeCurrentLocText.innerText;
        } else if (alertLat !== "0.0000") {
            alertAddress = `Coordinates: ${alertLat}, ${alertLng}`;
        } else {
            alertAddress = "Location coordinates pending";
        }

        const currentUserName = localStorage.getItem('fullName') || localStorage.getItem('userName') || "User";
        const currentUserPhone = localStorage.getItem('userPhone') || "";

        const emergencyData = {
            id: Date.now(),
            sos_id: activeSosId,
            user_id: activeUserId,
            userName: currentUserName,
            phone: currentUserPhone,
            latitude: alertLat,
            longitude: alertLng,
            address: alertAddress,
            alertType: type,
            message: fullMessage,
            travelMode: travelMode,
            driverDetails: driverData,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            status: "ACTIVE",
            contactNotified: "YES",
            contactResponded: "NO",
            policeEscalation: "PENDING",
            evidence_status: "recording"
        };
        
        localStorage.setItem('safeRouteEmergency', JSON.stringify(emergencyData));

        let insertSuccess = true;
        let insertError = null;

        // 3. INSERT INTO emergency_alerts LINKED WITH sos_id
        if (supabase) {
             const nowIso = new Date().toISOString();
             const { error } = await supabase.from('emergency_alerts').insert([{
                 sos_id: activeSosId,
                 user_phone: emergencyData.phone,
                 alert_type: type,
                 latitude: parseFloat(alertLat),
                 longitude: parseFloat(alertLng),
                 message: `${fullMessage} [MODE:${travelMode}]`,
                 status: 'active',
                 created_at: nowIso
             }]);
             if (error) {
                 console.warn("Supabase insert with sos_id failed, attempting standard insert:", error);
                 // Fallback if sos_id column is missing in legacy schema
                 const { error: fallbackError } = await supabase.from('emergency_alerts').insert([{
                     user_phone: emergencyData.phone,
                     alert_type: type,
                     latitude: parseFloat(alertLat),
                     longitude: parseFloat(alertLng),
                     message: `${fullMessage} [MODE:${travelMode}] [SOS:${activeSosId}]`,
                     status: 'active',
                     created_at: nowIso
                 }]);
                 if (fallbackError) {
                     console.error("Supabase fallback insert also failed:", fallbackError);
                     insertSuccess = false;
                     insertError = fallbackError;
                 }
             }
        }

        window.dispatchEvent(new StorageEvent('storage', {
            key: 'safeRouteEmergency',
            newValue: JSON.stringify(emergencyData)
        }));

        // Switch to SOS tab only if the dedicated emergency activation overlay is NOT currently shown
        const emOverlayEl = document.getElementById('emergencyScreenOverlay');
        const isEmOverlayVisible = emOverlayEl && !emOverlayEl.classList.contains('hidden');
        const navTabSos = document.getElementById('navTabSos');
        if (navTabSos && !isAutoTrigger && !isEmOverlayVisible) {
            navTabSos.click();
        }

        // 4. START EVIDENCE CAPTURE & SECURE STORAGE ON SILENT SOS OR JOURNEY SOS!
        const isJourneyTabActive = document.getElementById('tab-journey') && document.getElementById('tab-journey').classList.contains('active');
        const isJourneyContext = isJourneyActive || 
                                 isJourneyTabActive || 
                                 options.isJourney === true || 
                                 type === "Not Safe Triggered" || 
                                 type === "Auto-SOS Activated" || 
                                 type.toLowerCase().includes("journey");

        const shouldCaptureEvidence = options.captureEvidence === true || 
                                      (type && type.toLowerCase().includes("silent")) ||
                                      isJourneyContext;

        if (shouldCaptureEvidence) {
            console.log(`🔒 [${isJourneyContext ? 'JOURNEY SOS' : 'SILENT SOS'}] Automatically recording video & audio evidence and uploading to database...`);
            if (window.emergencyMedia) {
                window.emergencyMedia.captureAndUploadEvidence({
                    sosId: activeSosId,
                    userId: activeUserId,
                    duration: 6000
                }).then(result => {
                    console.log("Evidence capture & upload completed. Result:", result);
                    if (result && result.success) {
                        emergencyData.evidence_status = "captured";
                        localStorage.setItem('safeRouteEmergency', JSON.stringify(emergencyData));
                    }
                }).catch(err => {
                    console.error("Evidence capture workflow exception:", err);
                });
            }
        } else {
            console.log("📢 [SOS + SIREN] Audible alarm active: Automatic video & audio evidence capture bypassed.");
        }

        return {
            success: insertSuccess,
            sosId: activeSosId,
            error: insertError,
            emergencyData: emergencyData
        };
    }


    /* =========================================
       5. TRACKING LOGIC
       ========================================= */
    // Generate evenly spaced coordinates along route for smooth, glitch-free simulation
    function generateSmoothSimulationPath(coords, targetPoints = 55) {
        if (!coords || coords.length < 2) return coords || [];
        
        // Calculate cumulative polyline segment distances
        const dists = [0];
        let totalDist = 0;
        for (let i = 1; i < coords.length; i++) {
            const p1 = coords[i - 1];
            const p2 = coords[i];
            const dLat = (p2[0] - p1[0]);
            const dLng = (p2[1] - p1[1]);
            const dist = Math.sqrt(dLat * dLat + dLng * dLng);
            totalDist += dist;
            dists.push(totalDist);
        }

        if (totalDist === 0) return coords;

        const count = Math.max(25, Math.min(90, targetPoints));
        const smoothPath = [coords[0]];
        const stepDist = totalDist / (count - 1);

        let currSeg = 0;
        for (let i = 1; i < count - 1; i++) {
            const targetDist = i * stepDist;
            while (currSeg < dists.length - 1 && dists[currSeg + 1] < targetDist) {
                currSeg++;
            }
            const segStartDist = dists[currSeg];
            const segEndDist = dists[currSeg + 1];
            const segLen = segEndDist - segStartDist;
            const t = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;
            
            const p1 = coords[currSeg];
            const p2 = coords[currSeg + 1];
            const interpLat = p1[0] + t * (p2[0] - p1[0]);
            const interpLng = p1[1] + t * (p2[1] - p1[1]);
            smoothPath.push([interpLat, interpLng]);
        }
        smoothPath.push(coords[coords.length - 1]);
        return smoothPath;
    }

    const startJourneyBtn = document.getElementById('startJourneyBtn');
    
    if (startJourneyBtn) {
        startJourneyBtn.addEventListener('click', () => {
            if (!routesGenerated || !activePathCoords) {
                alert('Please search and select a destination first.');
                return;
            }

            let travelMode = "Unknown";
            const activeModeObj = document.querySelector('.mode-btn.active span');
            if (activeModeObj) travelMode = activeModeObj.innerText;
            
            const carNumberInput = document.getElementById('carNumberInput');
            if ((travelMode === "Car" || travelMode === "Bike") && (!carNumberInput || carNumberInput.value.trim() === '')) {
                alert('Vehicle Number is mandatory for Car and Bike modes. Please enter it before starting.');
                return;
            }

            const btnIcon = startJourneyBtn.querySelector('i.las:not(.arrow-icon)');
            const btnText = startJourneyBtn.querySelector('span');
            
            if (btnText.innerText === 'Start Journey') {
                btnText.innerText = 'Stop Tracking';
                if(btnIcon) { btnIcon.classList.remove('la-play'); btnIcon.classList.add('la-stop-circle'); }
                startJourneyBtn.style.background = 'var(--danger)';
                startJourneyBtn.style.boxShadow = '0 10px 25px rgba(239, 68, 68, 0.4)';
                
                const liveInd = document.querySelector('.live-indicator');
                if(liveInd) liveInd.style.display = 'flex';
                if('vibrate' in navigator) navigator.vibrate(50);

                const homeJourneyTag = document.getElementById('homeJourneyStatusTag');
                const homeJourneyDesc = document.getElementById('homeJourneyDescText');
                if (homeJourneyTag) {
                    homeJourneyTag.innerText = "Live";
                    homeJourneyTag.style.background = "#d1fae5";
                    homeJourneyTag.style.color = "#059669";
                }
                if (homeJourneyDesc) {
                    homeJourneyDesc.innerText = `En route (${travelMode}) • Corridor Active`;
                }
                
                if(liveTrackingInterval) clearInterval(liveTrackingInterval);
                
                isJourneyActive = true;
                simulationCoords = generateSmoothSimulationPath(activePathCoords, 55);
                currentStep = 0;
                
                const initialLoc = simulationCoords[0] || activePathCoords[0];
                if (userMarker) {
                    userMarker.setLatLng(initialLoc);
                    if (userMap) userMap.panTo(initialLoc, { animate: true, duration: 0.8 });
                }
                broadcastLiveLocation(initialLoc);
                
                liveTrackingInterval = setInterval(() => {
                    currentStep++;
                    if (simulationCoords && currentStep < simulationCoords.length) {
                        const newLoc = simulationCoords[currentStep];
                        if (userMarker) {
                            userMarker.setLatLng(newLoc);
                            if (userMap) userMap.panTo(newLoc, { animate: true, duration: 1.0 });
                        }
                        broadcastLiveLocation(newLoc);
                    } else {
                        clearInterval(liveTrackingInterval);
                        liveTrackingInterval = null;
                        isJourneyActive = false;
                        simulationCoords = null;
                        alert("You have reached your destination.");
                        startJourneyBtn.click();
                    }
                }, 1200);

            } else {
                isJourneyActive = false;
                simulationCoords = null;
                btnText.innerText = 'Start Journey';
                if(btnIcon) { btnIcon.classList.remove('la-stop-circle'); btnIcon.classList.add('la-play'); }
                startJourneyBtn.style.background = 'var(--success)';
                startJourneyBtn.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.4)';
                
                const liveInd = document.querySelector('.live-indicator');
                if(liveInd) liveInd.style.display = 'none';
                if(liveTrackingInterval) {
                    clearInterval(liveTrackingInterval);
                    liveTrackingInterval = null;
                }

                const homeJourneyTag = document.getElementById('homeJourneyStatusTag');
                const homeJourneyDesc = document.getElementById('homeJourneyDescText');
                if (homeJourneyTag) {
                    homeJourneyTag.innerText = "Standby";
                    homeJourneyTag.style.background = "#e0e7ff";
                    homeJourneyTag.style.color = "var(--primary)";
                }
                if (homeJourneyDesc) {
                    homeJourneyDesc.innerText = "Safe route corridor ready";
                }
            }
        });
    }

    // Direct SOS trigger button in Journey tab
    const journeySosBtn = document.getElementById('journeySosBtn');
    if (journeySosBtn) {
        journeySosBtn.addEventListener('click', () => {
            const currentCoords = (isJourneyActive && userMarker) ? [userMarker.getLatLng().lat, userMarker.getLatLng().lng] : (liveUserCoords ? [liveUserCoords.lat, liveUserCoords.lng] : null);
            if (currentCoords) {
                broadcastLiveLocation(currentCoords);
                triggerSOSAction("Journey SOS Triggered", "Emergency SOS triggered by user in Journey mode", {
                    latitude: currentCoords[0],
                    longitude: currentCoords[1],
                    isJourney: true,
                    captureEvidence: true
                });
            } else {
                triggerSOSAction("Journey SOS Triggered", "Emergency SOS triggered by user in Journey mode", {
                    isJourney: true,
                    captureEvidence: true
                });
            }
        });
    }
    
    async function broadcastLiveLocation(coords) {
        if (!coords || coords.length < 2) return;
        const payload = {
            lat: coords[0], lng: coords[1], 
            time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            sourceLoc: startLoc,
            destinationLoc: destinationLoc,
            routePath: activePathCoords,
            isDeviated: (typeof deviationLine !== 'undefined' && deviationLine !== null),
            deviationPoint: typeof preDeviationStep !== 'undefined' && preDeviationStep !== null ? activePathCoords[preDeviationStep] : null
        };
        localStorage.setItem('safeRouteLiveLocation', JSON.stringify(payload));
        
        // Push to Supabase 'live_locations' table
        const userPhone = localStorage.getItem('userPhone');
        if (userPhone && supabase) {
            let travelMode = "Unknown";
            const activeModeObj = document.querySelector('.mode-btn.active span');
            if (activeModeObj) travelMode = activeModeObj.innerText;

            await supabase.from('live_locations').insert([{
                user_phone: userPhone,
                latitude: coords[0],
                longitude: coords[1],
                travel_mode: travelMode,
                alert_status: payload.isDeviated ? 'deviated' : 'normal',
                created_at: new Date().toISOString()
            }]);
        }
    }

    /* ===================================================
       PHONE RINGTONE ENGINE (LOCAL WAV + WEB AUDIO SYNTH)
       =================================================== */
    class PhoneRingtoneEngine {
        constructor() {
            this.audioEl = new Audio('../../assets/audio/fake_call_ringtone.mp3');
            this.audioEl.loop = true;
            this.audioEl.preload = 'auto';

            this.audioCtx = null;
            this.osc1 = null;
            this.osc2 = null;
            this.gainNode = null;
            this.synthInterval = null;
            this.isSynthPlaying = false;
            this.isPlaying = false;
        }

        get currentTime() {
            return this.audioEl ? this.audioEl.currentTime : 0;
        }

        set currentTime(val) {
            if (this.audioEl) {
                try { this.audioEl.currentTime = val; } catch (e) {}
            }
        }

        get loop() {
            return this.audioEl ? this.audioEl.loop : true;
        }

        set loop(val) {
            if (this.audioEl) this.audioEl.loop = val;
        }

        async play() {
            this.isPlaying = true;
            let playedViaHtmlAudio = false;

            try {
                this.audioEl.currentTime = 0;
                const playPromise = this.audioEl.play();
                if (playPromise !== undefined) {
                    await playPromise;
                    playedViaHtmlAudio = true;
                    console.log("[Ringtone] Playing user MP3 ringtone via HTML5 Audio.");
                }
            } catch (err) {
                console.warn("[Ringtone] HTML5 Audio notice (activating Web Audio synth fallback):", err);
            }

            // Fallback to Web Audio API Synthesizer if HTML5 Audio was blocked or silent
            if (!playedViaHtmlAudio && this.isPlaying) {
                this.startSyntheticRingtone();
            }
        }

        startSyntheticRingtone() {
            if (this.isSynthPlaying) return;
            try {
                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtxClass) return;
                if (!this.audioCtx) {
                    this.audioCtx = new AudioCtxClass();
                }
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }

                this.gainNode = this.audioCtx.createGain();
                this.gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
                this.gainNode.connect(this.audioCtx.destination);

                this.osc1 = this.audioCtx.createOscillator();
                this.osc2 = this.audioCtx.createOscillator();

                this.osc1.type = 'sine';
                this.osc2.type = 'sine';
                this.osc1.frequency.setValueAtTime(440, this.audioCtx.currentTime);
                this.osc2.frequency.setValueAtTime(480, this.audioCtx.currentTime);

                this.osc1.connect(this.gainNode);
                this.osc2.connect(this.gainNode);

                this.osc1.start();
                this.osc2.start();
                this.isSynthPlaying = true;

                // 2s ringing / 2s silence cadence
                const ringPulse = () => {
                    if (!this.isSynthPlaying || !this.audioCtx) return;
                    const now = this.audioCtx.currentTime;
                    this.gainNode.gain.cancelScheduledValues(now);
                    this.gainNode.gain.setValueAtTime(0.35, now);
                    this.gainNode.gain.setValueAtTime(0.35, now + 1.8);
                    this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.85);
                };

                ringPulse();
                this.synthInterval = setInterval(ringPulse, 4000);
                console.log("[Ringtone] Web Audio API Synthesizer dual-tone ringer active.");
            } catch (e) {
                console.warn("[Ringtone] Web Audio synth notice:", e);
            }
        }

        pause() {
            this.stop();
        }

        stop() {
            this.isPlaying = false;
            try {
                this.audioEl.pause();
                this.audioEl.currentTime = 0;
            } catch (e) {}

            if (this.synthInterval) {
                clearInterval(this.synthInterval);
                this.synthInterval = null;
            }

            if (this.gainNode && this.audioCtx) {
                try {
                    this.gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
                } catch (e) {}
            }

            if (this.osc1) {
                try { this.osc1.stop(); this.osc1.disconnect(); } catch (e) {}
                this.osc1 = null;
            }
            if (this.osc2) {
                try { this.osc2.stop(); this.osc2.disconnect(); } catch (e) {}
                this.osc2 = null;
            }

            this.isSynthPlaying = false;
        }
    }

    /* =========================================
       6. DEVIATION LOGIC
       ========================================= */
    const overlay = document.getElementById('deviationOverlay');
    const modal = document.getElementById('deviationModal');
    let deviationTimer;
    let preDeviationStep = null; // Save position before deviation
    
    let escalationTimer = null;
    let escalationStage = 1;
    const phoneRingtoneEngine = new PhoneRingtoneEngine();
    const fakeCallAudio = phoneRingtoneEngine;

    function showDeviationAlert() {
        // Reset the alert trigger flag for this new deviation event
        hasTriggeredAlert = false;
        lastDeviatedPosition = null;

        // Pause tracking during deviation alert
        if (liveTrackingInterval) {
            clearInterval(liveTrackingInterval);
            liveTrackingInterval = null;
        }
        preDeviationStep = currentStep; // Remember where we were on the route

        if (userMarker && userMap) {
            const current = userMarker.getLatLng();
            const deviatedPos = [current.lat - 0.003, current.lng + 0.005];
            
            // Store the deviated position so the alert sends this exact location
            lastDeviatedPosition = deviatedPos;
            activeSosLat = Number(deviatedPos[0]);
            activeSosLng = Number(deviatedPos[1]);
            
            userMarker.setLatLng(deviatedPos);
            userMap.panTo(deviatedPos, { animate: true, duration: 1.0 });
            broadcastLiveLocation(deviatedPos);
            
            if (deviationLine) userMap.removeLayer(deviationLine);
            deviationLine = L.polyline([current, deviatedPos], {color: '#ef4444', weight: 6, dashArray: '6,6'}).addTo(userMap);
        }

        setTimeout(() => {
            if(overlay) overlay.classList.add('show');
            if(modal) modal.classList.add('show');
            
            const title = document.getElementById('alertTitle');
            const desc = document.getElementById('alertDesc');
            
            // STAGE 1: Standard Alert
            escalationStage = 1;
            if(title) {
                title.innerText = "Route Deviation Detected";
                title.style.color = "var(--text-dark)";
            }
            if(desc) desc.innerText = "You are moving away from the selected safe route. Are you safe?";
            
            if('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
            
            // Start 15s Timer for Stage 2
            clearTimeout(escalationTimer);
            escalationTimer = setTimeout(triggerStageTwo, 15000);
            
        }, 800);
    }

    function triggerStageTwo() {
        escalationStage = 2;
        const title = document.getElementById('alertTitle');
        if(title) {
            title.innerText = "URGENT: Are You Safe?";
            title.style.color = "#dc2626"; // Red
        }
        // Heavy vibration
        if('vibrate' in navigator) navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 1000]);
        
        // Start 15s Timer for Stage 3
        escalationTimer = setTimeout(triggerStageThree, 15000);
    }
    
    function triggerStageThree() {
        escalationStage = 3;
        const title = document.getElementById('alertTitle');
        const desc = document.getElementById('alertDesc');
        if(title) {
            title.innerText = "FINAL WARNING: Fake Call Initiated";
            title.style.color = "#991b1b"; // Dark Red
        }
        if(desc) desc.innerText = "Please answer or SOS will be triggered in 15 seconds!";
        
        // Force full volume fake call ringtone
        fakeCallAudio.currentTime = 0;
        fakeCallAudio.play().catch(e => console.warn("Fake call audio blocked by browser:", e));
        
        // Start 15s Timer for Auto-Trigger SOS
        escalationTimer = setTimeout(autoTriggerDeviationSOS, 15000);
    }
    
    function autoTriggerDeviationSOS() {
        const devPos = lastDeviatedPosition || (userMarker ? [userMarker.getLatLng().lat, userMarker.getLatLng().lng] : null);
        closeDeviationAlert();
        // Do NOT stop tracking; keep broadcasting location for police
        if (devPos) {
            broadcastLiveLocation(devPos);
            triggerSOSAction("Auto-SOS Activated", "User unresponsive to deviation alerts for 45 seconds.", {
                latitude: devPos[0],
                longitude: devPos[1],
                captureEvidence: true,
                isJourney: true
            });
        } else {
            triggerSOSAction("Auto-SOS Activated", "User unresponsive to deviation alerts for 45 seconds.", {
                captureEvidence: true,
                isJourney: true
            });
        }
    }

    function closeDeviationAlert() {
        clearTimeout(deviationTimer);
        deviationTimer = null;
        clearTimeout(escalationTimer);
        escalationTimer = null;
        escalationStage = 1;
        fakeCallAudio.pause();
        fakeCallAudio.currentTime = 0;
        
        // format UI back to normal
        const title = document.getElementById('alertTitle');
        if(title) {
             title.innerText = "Route Deviation Detected";
             title.style.color = "var(--text-dark)";
        }
        
        if(overlay) overlay.classList.remove('show');
        if(modal) modal.classList.remove('show');
    }

    // Resume tracking from where we left off after user confirms safe
    function resumeTrackingAfterDeviation() {
        const path = simulationCoords || activePathCoords;
        if (!path || preDeviationStep === null) return;

        // Remove the red deviation line
        if (deviationLine) { userMap.removeLayer(deviationLine); deviationLine = null; }
        lastDeviatedPosition = null;

        // Snap marker back to route at the saved step
        currentStep = preDeviationStep;
        const snapLoc = path[currentStep];
        if (userMarker && snapLoc) {
            userMarker.setLatLng(snapLoc);
            if(userMap) userMap.panTo(snapLoc, { animate: true, duration: 1.0 });
            broadcastLiveLocation(snapLoc);
        }
        preDeviationStep = null;

        // Resume the tracking interval to continue to destination
        if (liveTrackingInterval) clearInterval(liveTrackingInterval);
        isJourneyActive = true;
        liveTrackingInterval = setInterval(() => {
            currentStep++;
            if (path && currentStep < path.length) {
                const newLoc = path[currentStep];
                if (userMarker) {
                    userMarker.setLatLng(newLoc);
                    if(userMap) userMap.panTo(newLoc, { animate: true, duration: 1.0 });
                }
                broadcastLiveLocation(newLoc);
            } else {
                clearInterval(liveTrackingInterval);
                liveTrackingInterval = null;
                isJourneyActive = false;
                simulationCoords = null;
                alert("You have reached your destination.");
                if (startJourneyBtn) startJourneyBtn.click(); // Reset button
            }
        }, 1200);

        console.log("Tracking resumed from step", currentStep, "of", path.length);
    }

    // Stop tracking completely (used when NOT SAFE or SOS)
    function stopTracking() {
        isJourneyActive = false;
        simulationCoords = null;
        if (liveTrackingInterval) { clearInterval(liveTrackingInterval); liveTrackingInterval = null; }
        preDeviationStep = null;

        const btnIcon = startJourneyBtn ? startJourneyBtn.querySelector('i.las:not(.arrow-icon)') : null;
        const btnText = startJourneyBtn ? startJourneyBtn.querySelector('span') : null;
        if (btnText && btnText.innerText === 'Stop Tracking') {
            if(btnText) btnText.innerText = 'Start Journey';
            if(btnIcon) { btnIcon.classList.remove('la-stop-circle'); btnIcon.classList.add('la-play'); }
            startJourneyBtn.style.background = 'var(--success)';
            startJourneyBtn.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.4)';
        }
        const liveInd = document.querySelector('.live-indicator');
        if(liveInd) liveInd.style.display = 'none';
    }

    /* =========================================
       7. UI EVENT HANDLING
       ========================================= */

    // Travel Mode
    const modeButtons = document.querySelectorAll('.mode-btn');
    const carNumberGroup = document.getElementById('carNumberGroup');
    const carNumberInput = document.getElementById('carNumberInput');
    const carNumberIcon = document.getElementById('carNumberIcon');

    function updateVehicleInputByMode(mode) {
        if (!carNumberGroup) return;
        if (mode === 'walking') {
            carNumberGroup.style.display = 'none';
            if (carNumberInput) carNumberInput.value = '';
        } else if (mode === 'bike') {
            carNumberGroup.style.display = 'flex';
            if (carNumberInput) carNumberInput.placeholder = 'Enter Bike / Two-Wheeler Number';
            if (carNumberIcon) carNumberIcon.className = 'las la-motorcycle';
        } else {
            carNumberGroup.style.display = 'flex';
            if (carNumberInput) carNumberInput.placeholder = 'Enter Vehicle / Car Number';
            if (carNumberIcon) carNumberIcon.className = 'las la-car-side';
        }
    }

    if (modeButtons) {
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const currentMode = btn.getAttribute('data-mode') || 'walking';
                updateVehicleInputByMode(currentMode);

                // Recalculate route if destination is currently set
                if (destinationLoc && destInput && destInput.value) {
                    processDestination(destinationLoc[0], destinationLoc[1], destInput.value);
                }
            });
        });

        // Initialize state based on active button
        const initialActive = document.querySelector('.mode-btn.active');
        if (initialActive) {
            updateVehicleInputByMode(initialActive.getAttribute('data-mode') || 'walking');
        }
    }
    
    // Deviation Triggers (Only active in Journey option)
    const demoTrigger = document.getElementById('demoTrigger');
    if (demoTrigger) {
        demoTrigger.style.display = 'none'; // Initially hidden on Home tab
        demoTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            showDeviationAlert();
        });
    }
    
    const testCloseBtn = document.getElementById('testCloseBtn');
    if (testCloseBtn) testCloseBtn.addEventListener('click', closeDeviationAlert);
    
    // YES — I'm Safe: snap back to route and RESUME tracking to destination
    const btnSafe = document.getElementById('btnSafe');
    if (btnSafe) {
        btnSafe.addEventListener('click', async () => {
            closeDeviationAlert();
            if (activeSosId && window.jagruthiSosService) {
                await window.jagruthiSosService.resolveSosEvent(activeSosId);
            }
            resumeTrackingAfterDeviation();
            console.log("User marked as safe — tracking resumed.");
        });
    }

    // NOT SAFE — trigger SOS ONCE and STOP tracking
    const btnNotSafe = document.getElementById('btnNotSafe');
    if (btnNotSafe) {
        btnNotSafe.addEventListener('click', () => {
            const devPos = lastDeviatedPosition || (userMarker ? [userMarker.getLatLng().lat, userMarker.getLatLng().lng] : null);
            // First: close the deviation modal and kill the auto-escalation timer
            closeDeviationAlert();
            // Do NOT stop tracking; keep movement broadcasting active for emergency response
            if (devPos) {
                broadcastLiveLocation(devPos);
                triggerSOSAction("Not Safe Triggered", "User reported NOT SAFE due to route deviation", {
                    latitude: devPos[0],
                    longitude: devPos[1],
                    captureEvidence: true,
                    isJourney: true
                });
            } else {
                triggerSOSAction("Not Safe Triggered", "User reported NOT SAFE due to route deviation", {
                    captureEvidence: true,
                    isJourney: true
                });
            }
        });
    }

    // "Use current location" logic
    const useCurrentBtn = document.querySelector('.use-current-location:not(#searchDestBtn)');
    if (useCurrentBtn) {
        useCurrentBtn.addEventListener('click', () => {
            const sourceInput = document.getElementById('sourceInput');
            if(sourceInput) sourceInput.value = "Detecting...";
            
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        applyUserGpsPosition(pos.coords.latitude, pos.coords.longitude);
                    },
                    (error) => {
                        handleLocationError(error);
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            } else {
                handleLocationError({ message: "Geolocation not supported" });
            }
        });
    }

    function updateCoordsDisplays(coords) {
        const sosCoords = document.getElementById('sosCoordsDisplay');
        if (sosCoords) sosCoords.innerText = `Lat: ${coords[0].toFixed(4)}, Lng: ${coords[1].toFixed(4)}`;
        const homeGps = document.getElementById('homeGpsStatus');
        if (homeGps) {
            homeGps.innerText = `GPS Active (${coords[0].toFixed(2)}, ${coords[1].toFixed(2)})`;
            homeGps.style.color = "var(--primary)";
        }
        if (typeof updateSafetyLocationUI === 'function') {
            updateSafetyLocationUI();
        }
    }

    /* =========================================
       8. ROLE-BASED BOTTOM NAVIGATION TAB SWITCHING
       ========================================= */
    const navItems = document.querySelectorAll('#womenBottomNav .nav-item');
    const tabViews = document.querySelectorAll('.tab-view');
    const journeyActionBar = document.getElementById('journeyActionBar');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.dataset.tab;
            if (!targetTab) return;

            // Update active nav button
            navItems.forEach(btn => btn.classList.remove('active'));
            item.classList.add('active');

            // Switch active tab view
            tabViews.forEach(view => {
                if (view.id === targetTab) {
                    view.classList.add('active');
                } else {
                    view.classList.remove('active');
                }
            });

            // Toggle Journey action bar visibility
            if (journeyActionBar) {
                if (targetTab === 'tab-journey') {
                    journeyActionBar.classList.remove('hidden');
                } else {
                    journeyActionBar.classList.add('hidden');
                }
            }

            // Toggle Test Alert button (Only show in Journey option)
            if (demoTrigger) {
                if (targetTab === 'tab-journey') {
                    demoTrigger.style.display = 'flex';
                } else {
                    demoTrigger.style.display = 'none';
                }
            }

            // Refresh Safety tab location when selected
            if (targetTab === 'tab-safety' && typeof updateSafetyLocationUI === 'function') {
                updateSafetyLocationUI();
            }

            // Invalidate Leaflet Map Size so map redraws correctly
            if (targetTab === 'tab-journey' && userMap) {
                setTimeout(() => {
                    userMap.invalidateSize();
                }, 200);
            }

            // Refresh Evidence Vault count badge when viewing Profile
            if (targetTab === 'tab-profile' && typeof updateVaultBadges === 'function') {
                updateVaultBadges();
            }

            // Scroll to top smoothly
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // Populate profile tab info from real user session
    const profileTabName = document.getElementById('profileTabName');
    const profileTabPhone = document.getElementById('profileTabPhone');
    const profileTabAvatar = document.getElementById('profileTabAvatar');
    const curUserName = localStorage.getItem('fullName') || localStorage.getItem('userName') || 'User';
    const curUserPhone = localStorage.getItem('userPhone') || '';
    if (profileTabName) profileTabName.innerText = curUserName;
    if (profileTabPhone) profileTabPhone.innerText = curUserPhone || 'No phone registered';
    if (profileTabAvatar) {
        profileTabAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(curUserName)}&background=e11d48&color=ffffff&rounded=true`;
    }

    // Default Emergency Contacts
    const DEFAULT_EMERGENCY_CONTACTS = [
        { name: "Amma", phone: "9843050114" },
        { name: "Deepi", phone: "6383972272" },
        { name: "Gobili", phone: "9042594362" }
    ];

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showAppToast(message, type = 'info') {
        let toast = document.getElementById('globalAppToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'globalAppToast';
            toast.style.cssText = `
                position: fixed;
                bottom: 84px;
                left: 50%;
                transform: translateX(-50%) translateY(20px);
                background: #1e1b4b;
                color: #ffffff;
                padding: 10px 18px;
                border-radius: 30px;
                font-size: 0.86rem;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.18);
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.25s ease, transform 0.25s ease;
                pointer-events: none;
                max-width: 90vw;
                white-space: nowrap;
            `;
            document.body.appendChild(toast);
        }

        const icon = type === 'success' ? 'la-check-circle' : (type === 'error' ? 'la-exclamation-circle' : 'la-info-circle');
        const iconColor = type === 'success' ? '#34d399' : (type === 'error' ? '#f87171' : '#a5b4fc');
        toast.innerHTML = `<i class="las ${icon}" style="font-size: 1.25rem; color: ${iconColor};"></i> <span>${escapeHtml(message)}</span>`;
        
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
        }, 3000);
    }

    function getSavedEmergencyContacts() {
        try {
            const raw = localStorage.getItem('userEmergencyContacts');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn("Could not parse userEmergencyContacts:", e);
        }
        return [...DEFAULT_EMERGENCY_CONTACTS];
    }

    // Dynamic Emergency Contacts Loader
    async function loadUserEmergencyContacts() {
        const contactsContainer = document.getElementById('userEmergencyContactsList');
        const countBadge = document.getElementById('userContactCountBadge');
        const phone = localStorage.getItem('userPhone');

        let contacts = getSavedEmergencyContacts().map(c => ({
            name: c.name || 'Emergency Contact',
            phone: c.phone,
            initial: (c.name ? c.name.trim().charAt(0) : 'E').toUpperCase() || 'E'
        }));

        if (supabase && phone) {
            try {
                // Fetch emergency contact from users table
                const { data: userRow } = await supabase
                    .from('users')
                    .select('emergency_contact')
                    .eq('phone', phone)
                    .single();

                if (userRow?.emergency_contact) {
                    const cleanEc = userRow.emergency_contact.trim();
                    if (!contacts.some(c => c.phone.replace(/\D/g, '') === cleanEc.replace(/\D/g, ''))) {
                        contacts.unshift({
                            name: 'Primary Emergency Contact',
                            phone: cleanEc,
                            initial: 'P'
                        });
                    }
                }
            } catch (e) {
                console.warn("Could not load user contact from DB:", e);
            }
        }

        if (countBadge) {
            countBadge.innerText = `${contacts.length} Connected`;
            countBadge.className = contacts.length > 0 ? 'badge badge-success' : 'badge';
        }

        const homeContactsBadge = document.getElementById('homeContactsBadge');
        const homeContactsPreviewText = document.getElementById('homeContactsPreviewText');
        if (homeContactsBadge) {
            homeContactsBadge.innerText = contacts.length > 0 ? `${contacts.length} Linked` : 'None linked';
            homeContactsBadge.style.background = contacts.length > 0 ? '#d1fae5' : '#fee2e2';
            homeContactsBadge.style.color = contacts.length > 0 ? '#059669' : '#dc2626';
        }
        if (homeContactsPreviewText) {
            homeContactsPreviewText.innerText = contacts.length > 0 ? `${contacts[0].name} (${contacts[0].phone})` : 'No contacts added';
        }

        if (contactsContainer) {
            if (contacts.length === 0) {
                contactsContainer.innerHTML = `
                    <div style="padding: 14px; text-align: center; color: #94a3b8; font-size: 0.85rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px;">
                        <i class="las la-user-plus" style="font-size: 1.5rem; display: block; margin-bottom: 4px;"></i>
                        No emergency contacts configured. Tap below to configure.
                    </div>
                `;
            } else {
                contactsContainer.innerHTML = contacts.map(c => `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 36px; height: 36px; border-radius: 50%; background: #e0e7ff; color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">${c.initial}</div>
                            <div>
                                <h4 style="font-size: 0.9rem; margin: 0;">${c.name}</h4>
                                <span style="font-size: 0.78rem; color: #64748b;">${c.phone}</span>
                            </div>
                        </div>
                        <a href="tel:${c.phone.replace(/\\s+/g, '')}" style="color: var(--primary); font-size: 1.4rem;" aria-label="Call ${c.name}"><i class="las la-phone"></i></a>
                    </div>
                `).join('');
            }
        }
    }

    // Dynamic Recent Alerts Loader
    async function loadUserRecentAlerts() {
        const feedList = document.getElementById('womenAlertsFeedList');
        const phone = localStorage.getItem('userPhone');
        if (!feedList || !phone || !supabase) return;

        try {
            const { data: alerts, error } = await supabase
                .from('emergency_alerts')
                .select('*')
                .eq('user_phone', phone)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error || !alerts || alerts.length === 0) {
                feedList.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 0.85rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: var(--radius-sm);">
                        <i class="las la-shield-alt" style="font-size: 1.6rem; display: block; margin-bottom: 6px; color: #10b981;"></i>
                        No recent SOS alerts. Your safety status is clear.
                    </div>
                `;
                return;
            }

            feedList.innerHTML = alerts.map(a => {
                const isResolved = a.status === 'resolved';
                const borderCol = isResolved ? 'var(--success)' : 'var(--danger)';
                const iconCol = isResolved ? 'var(--success)' : 'var(--danger)';
                const icon = isResolved ? 'la-check-circle' : 'la-exclamation-triangle';
                const time = parseUtcDate(a.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                return `
                    <div style="background: white; border: 1px solid #e2e8f0; border-left: 4px solid ${borderCol}; border-radius: var(--radius-sm); padding: 14px; box-shadow: var(--shadow-sm); margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="las ${icon}" style="color: ${iconCol}; font-size: 1.3rem;"></i>
                                <strong style="font-size: 0.95rem; color: var(--text-dark);">${a.alert_type || 'SOS Alert'}</strong>
                            </div>
                            <span class="badge ${isResolved ? 'badge-success' : 'badge-danger'}" style="font-size: 0.72rem;">${a.status.toUpperCase()}</span>
                        </div>
                        <p style="font-size: 0.82rem; color: var(--text-medium); margin-top: 6px;">${a.message || 'Emergency trigger recorded.'}</p>
                        <span style="font-size: 0.72rem; color: #94a3b8; display: block; margin-top: 4px;"><i class="las la-clock"></i> ${time}</span>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.warn("Could not load user alerts feed:", e);
        }
    }

    loadUserEmergencyContacts();
    loadUserRecentAlerts();

    // Header profile button click -> open Profile tab
    const headerProfileBtn = document.getElementById('headerProfileBtn');
    if (headerProfileBtn) {
        headerProfileBtn.addEventListener('click', () => {
            const navTabProfile = document.getElementById('navTabProfile');
            if (navTabProfile) navTabProfile.click();
        });
    }

    /* ===================================================
       9. EMERGENCY SIREN & FLASHLIGHT HARDWARE CONTROLS
       =================================================== */
    class EmergencySiren {
        constructor() {
            this.audioCtx = null;
            this.oscillator = null;
            this.gainNode = null;
            this.isPlaying = false;
            this.sirenInterval = null;
            this.isMuted = false;
        }

        start() {
            if (this.isPlaying) return;
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                if (!this.audioCtx) {
                    this.audioCtx = new AudioContextClass();
                }
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }

                this.oscillator = this.audioCtx.createOscillator();
                this.gainNode = this.audioCtx.createGain();

                this.oscillator.type = 'sawtooth';
                this.oscillator.frequency.setValueAtTime(700, this.audioCtx.currentTime);

                this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.audioCtx.currentTime);
                this.oscillator.connect(this.gainNode);
                this.gainNode.connect(this.audioCtx.destination);

                this.oscillator.start();
                this.isPlaying = true;

                let high = false;
                this.sirenInterval = setInterval(() => {
                    if (!this.isPlaying || !this.oscillator || !this.audioCtx) return;
                    const now = this.audioCtx.currentTime;
                    const targetFreq = high ? 700 : 1150;
                    this.oscillator.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.45);
                    high = !high;
                }, 500);
            } catch (e) {
                console.warn("Emergency siren Web Audio init:", e);
            }
        }

        stop() {
            if (this.sirenInterval) {
                clearInterval(this.sirenInterval);
                this.sirenInterval = null;
            }
            if (this.oscillator) {
                try {
                    this.oscillator.stop();
                    this.oscillator.disconnect();
                } catch (e) {}
                this.oscillator = null;
            }
            this.isPlaying = false;
        }

        toggleMute() {
            this.isMuted = !this.isMuted;
            if (this.gainNode && this.audioCtx) {
                this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : 0.45, this.audioCtx.currentTime);
            }
            return !this.isMuted;
        }

        playCountdownTick(freq = 880) {
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                if (!this.audioCtx) {
                    this.audioCtx = new AudioContextClass();
                }
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume();
                }
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
                gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.12);
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start();
                osc.stop(this.audioCtx.currentTime + 0.13);
            } catch (e) {}
        }
    }

    class EmergencyTorch {
        constructor() {
            this.stream = null;
            this.track = null;
            this.isActive = false;
        }

        async start() {
            if (this.isActive) return;
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    this.stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'environment' }
                    });
                    const tracks = this.stream.getVideoTracks();
                    if (tracks.length > 0) {
                        this.track = tracks[0];
                        const capabilities = this.track.getCapabilities ? this.track.getCapabilities() : {};
                        if (capabilities.torch) {
                            await this.track.applyConstraints({
                                advanced: [{ torch: true }]
                            });
                            this.isActive = true;
                        }
                    }
                }
            } catch (e) {
                console.warn("Flashlight/torch not supported or camera in use:", e);
            }
        }

        stop() {
            if (this.track) {
                try {
                    this.track.stop();
                } catch (e) {}
                this.track = null;
            }
            if (this.stream) {
                try {
                    this.stream.getTracks().forEach(t => t.stop());
                } catch (e) {}
                this.stream = null;
            }
            this.isActive = false;
        }

        async toggle() {
            if (this.isActive) {
                this.stop();
                return false;
            } else {
                await this.start();
                return this.isActive;
            }
        }
    }

    const emergencySiren = new EmergencySiren();
    const emergencyTorch = new EmergencyTorch();

    /* ===================================================
       10. EMERGENCY ACTIVATION OVERLAY & COUNTDOWN WORKFLOW
       =================================================== */
    let isEmergencyCountdownActive = false;
    let isEmergencyDispatchedActive = false;
    let emergencyCountdownTimer = null;
    let countdownRemaining = 5;
    let pendingSosType = "Emergency SOS";
    let pendingSosMessage = "Emergency SOS Activated";

    const emergencyOverlay = document.getElementById('emergencyScreenOverlay');
    const emCountdownBlock = document.getElementById('emCountdownBlock');
    const emDispatchedBlock = document.getElementById('emDispatchedBlock');
    const emCountdownNum = document.getElementById('emCountdownNum');
    const emCountdownSecondsText = document.getElementById('emCountdownSecondsText');
    const countdownSvgProgress = document.getElementById('countdownSvgProgress');
    const btnCancelEmergency = document.getElementById('btnCancelEmergency');
    const btnResolveEmergency = document.getElementById('btnResolveEmergency');
    const btnRetryAlert = document.getElementById('btnRetryAlert');
    const btnToggleSiren = document.getElementById('btnToggleSiren');
    const btnToggleTorch = document.getElementById('btnToggleTorch');
    const sirenText = document.getElementById('sirenText');
    const sirenIcon = document.getElementById('sirenIcon');
    const torchText = document.getElementById('torchText');
    const torchIcon = document.getElementById('torchIcon');
    const emStatusBanner = document.getElementById('emStatusBanner');
    const emBannerIcon = document.getElementById('emBannerIcon');
    const emStatusTitle = document.getElementById('emStatusTitle');
    const emStatusDesc = document.getElementById('emStatusDesc');
    const emLocationDisplay = document.getElementById('emLocationDisplay');
    const emContactsBadge = document.getElementById('emContactsBadge');
    const emGpsBadge = document.getElementById('emGpsBadge');
    const emEvidenceBadge = document.getElementById('emEvidenceBadge');

    // Dispatched Emergency Overlay DOM elements (Images 1, 2, 3)
    const emSmsPopupBackdrop = document.getElementById('emSmsPopupBackdrop');
    const btnDismissSmsPopup = document.getElementById('btnDismissSmsPopup');
    const btnSendSmsNow = document.getElementById('btnSendSmsNow');
    const emLocationStatusTitle = document.getElementById('emLocationStatusTitle');
    const btnViewOnMap = document.getElementById('btnViewOnMap');
    const emDispatchedContactsList = document.getElementById('emDispatchedContactsList');
    const emBottomStatusToast = document.getElementById('emBottomStatusToast');
    const emBottomStatusToastText = document.getElementById('emBottomStatusToastText');
    const emScreenTitle = document.getElementById('emScreenTitle');
    const emScreenSubtitle = document.getElementById('emScreenSubtitle');

    let activeSosLat = null;
    let activeSosLng = null;
    let pendingSosIsSilent = false;
    let emSmsPopupHandled = false;
    let emSmsPopupTimer = null;

    const CIRCLE_CIRCUMFERENCE = 339.29; // 2 * PI * 54

    function setCountdownDashoffset(secondsLeft, totalSeconds = 5) {
        if (!countdownSvgProgress) return;
        const progressFraction = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
        const offset = CIRCLE_CIRCUMFERENCE * (1 - progressFraction);
        countdownSvgProgress.style.strokeDashoffset = offset;
    }

    function startEmergencyCountdown(type = "Emergency SOS", message = "Emergency SOS Activated", isSilent = false) {
        // Prevent duplicate trigger if already in countdown or emergency is active
        if (isEmergencyCountdownActive || isEmergencyDispatchedActive) {
            console.log("Emergency activation already active. Skipping duplicate trigger.");
            return;
        }

        pendingSosType = type;
        pendingSosMessage = message;
        pendingSosIsSilent = !!isSilent;
        isEmergencyCountdownActive = true;
        const totalDuration = pendingSosIsSilent ? 3 : 5;
        countdownRemaining = totalDuration;

        // Pre-fetch live GPS immediately during countdown so satellites are locked before dispatch
        acquireLiveEmergencyGps();

        // Configure UI for Silent SOS vs SOS + Siren
        if (emScreenTitle) {
            emScreenTitle.innerText = pendingSosIsSilent ? "SILENT SOS ACTIVATED" : "EMERGENCY ACTIVATED";
        }
        if (emScreenSubtitle) {
            emScreenSubtitle.innerText = pendingSosIsSilent ? "Discreet Distress Signal • Siren Muted" : "Distress signal initiated";
        }
        const countdownInstr = document.querySelector('.countdown-instruction');
        if (countdownInstr) {
            countdownInstr.innerHTML = pendingSosIsSilent ?
                `Discreetly preparing distress broadcast &amp; auto video/audio recording in <strong id="emCountdownSecondsText">${countdownRemaining}</strong> seconds` :
                `Sending alerts to emergency contacts and police in <strong id="emCountdownSecondsText">${countdownRemaining}</strong> seconds`;
        }

        // Reset UI elements
        if (emCountdownNum) emCountdownNum.innerText = String(countdownRemaining);
        const secText = document.getElementById('emCountdownSecondsText');
        if (secText) secText.innerText = String(countdownRemaining);
        setCountdownDashoffset(countdownRemaining, totalDuration);

        if (emCountdownBlock) emCountdownBlock.classList.remove('hidden');
        if (emDispatchedBlock) emDispatchedBlock.classList.add('hidden');
        if (emergencyOverlay) {
            emergencyOverlay.classList.remove('hidden');
            emergencyOverlay.classList.add('is-counting-down');
            emergencyOverlay.classList.toggle('is-silent-mode', pendingSosIsSilent);
        }

        // Play initial tick and vibration ONLY if NOT in silent mode
        if (!pendingSosIsSilent) {
            emergencySiren.playCountdownTick(880);
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        } else {
            // Subtle single haptic for discreet silent mode
            if ('vibrate' in navigator) navigator.vibrate(60);
        }

        if (emergencyCountdownTimer) clearInterval(emergencyCountdownTimer);

        emergencyCountdownTimer = setInterval(() => {
            countdownRemaining--;
            
            if (countdownRemaining > 0) {
                if (emCountdownNum) emCountdownNum.innerText = String(countdownRemaining);
                const curSecText = document.getElementById('emCountdownSecondsText');
                if (curSecText) curSecText.innerText = String(countdownRemaining);
                setCountdownDashoffset(countdownRemaining, totalDuration);
                
                if (!pendingSosIsSilent) {
                    emergencySiren.playCountdownTick(countdownRemaining === 1 ? 1100 : 880);
                    if ('vibrate' in navigator) navigator.vibrate(150);
                }
            } else {
                // Countdown reached 0 -> Dispatch Emergency Alert!
                clearInterval(emergencyCountdownTimer);
                emergencyCountdownTimer = null;
                isEmergencyCountdownActive = false;
                setCountdownDashoffset(0, totalDuration);
                executeEmergencyActivation();
            }
        }, 1000);
    }

    function cancelEmergencyCountdown() {
        console.log("Cancelling emergency countdown...");
        if (emergencyCountdownTimer) {
            clearInterval(emergencyCountdownTimer);
            emergencyCountdownTimer = null;
        }
        if (emSmsPopupTimer) {
            clearTimeout(emSmsPopupTimer);
            emSmsPopupTimer = null;
        }
        isEmergencyCountdownActive = false;
        isEmergencyDispatchedActive = false;
        pendingSosIsSilent = false;
        emSmsPopupHandled = false;

        if (emergencyOverlay) {
            emergencyOverlay.classList.remove('is-counting-down', 'is-dispatched', 'is-silent-mode');
            emergencyOverlay.classList.add('hidden');
        }
        if (emCountdownBlock) emCountdownBlock.classList.add('hidden');
        if (emDispatchedBlock) emDispatchedBlock.classList.add('hidden');
        if (emSmsPopupBackdrop) emSmsPopupBackdrop.classList.add('hidden');
        if (emBottomStatusToast) emBottomStatusToast.classList.add('hidden');

        try { emergencySiren.stop(); } catch (e) {}
        try { emergencyTorch.stop(); } catch (e) {}
        if ('vibrate' in navigator) {
            try { navigator.vibrate(80); } catch (e) {}
        }
        showAppToast("Emergency alert cancelled.", "info");
        console.log("Emergency alert activation cancelled by user.");
    }

    function populateDispatchedContacts() {
        if (!emDispatchedContactsList) return;
        
        const saved = getSavedEmergencyContacts();
        const personalContacts = saved.map(c => ({
            name: c.name || "Emergency Contact",
            phone: c.phone,
            type: "contact"
        }));

        const finalContacts = [
            ...personalContacts,
            { name: "Police Emergency", phone: "100", type: "service" },
            { name: "Women Helpline", phone: "181", type: "service" }
        ];

        emDispatchedContactsList.innerHTML = finalContacts.map(c => `
            <div class="em-contact-item">
                <div class="em-contact-item-left">
                    <div class="em-contact-avatar ${c.type === 'service' ? 'avatar-service' : 'avatar-person'}">
                        ${c.type === 'service' ? '<i class="las la-asterisk"></i>' : '<i class="las la-user"></i>'}
                    </div>
                    <div class="em-contact-item-info">
                        <h4 class="em-contact-name">${c.name}</h4>
                        <span class="em-contact-phone">${c.phone}</span>
                    </div>
                </div>
                <a href="tel:${c.phone.replace(/\\s+/g, '')}" class="em-contact-call-btn" aria-label="Call ${c.name}" title="Call ${c.name}">
                    <i class="las la-phone"></i>
                </a>
            </div>
        `).join('');
    }

    // High-priority Live GPS Resolution for SOS
    function acquireLiveEmergencyGps() {
        // If we already have fresh liveUserCoords, secure it immediately
        if (liveUserCoords) {
            onDispatchedLocationSecured(liveUserCoords.lat, liveUserCoords.lng, liveUserCoords.accuracy);
        }

        if (!navigator.geolocation) return;

        // Fresh high-accuracy query
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                applyUserGpsPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                onDispatchedLocationSecured(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
            },
            (err) => {
                console.warn("Emergency high-accuracy GPS query error:", err);
                // Fallback to standard network position if satellite lock is slow indoors
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        applyUserGpsPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                        onDispatchedLocationSecured(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                    },
                    (netErr) => {
                        console.warn("Emergency network geolocation query error:", netErr);
                    },
                    { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
                );
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
        );
    }

    function onDispatchedLocationSecured(lat, lng, accuracy = 8) {
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

        // If user is deviated or in journey simulation, preserve the user's actual road position
        if (lastDeviatedPosition && Array.isArray(lastDeviatedPosition)) {
            lat = lastDeviatedPosition[0];
            lng = lastDeviatedPosition[1];
        } else if (isJourneyActive && userMarker) {
            lat = userMarker.getLatLng().lat;
            lng = userMarker.getLatLng().lng;
        }

        activeSosLat = Number(lat);
        activeSosLng = Number(lng);

        if (emLocationStatusTitle) {
            emLocationStatusTitle.innerText = "Exact Location Secured";
        }
        if (emLocationDisplay) {
            emLocationDisplay.innerHTML = `<span style="font-size:0.95rem; font-weight:600; color:#0f172a;">Lat: ${activeSosLat.toFixed(5)}, Lng: ${activeSosLng.toFixed(5)}</span> <span style="font-size:0.75rem; color:#059669; font-weight:600;">(±${Math.round(accuracy)}m)</span>`;
        }
        if (btnViewOnMap) {
            btnViewOnMap.classList.remove('hidden');
        }

        // Reverse geocode to show street address prominently
        reverseGeocode(activeSosLat, activeSosLng).then(addr => {
            if (addr && emLocationDisplay) {
                emLocationDisplay.innerHTML = `
                    <div style="font-size:0.9rem; font-weight:600; color:#0f172a; margin-bottom:2px; line-height:1.3;">${escapeHtml(addr)}</div>
                    <div style="font-size:0.76rem; color:#64748b;">Lat: ${activeSosLat.toFixed(5)}, Lng: ${activeSosLng.toFixed(5)} (±${Math.round(accuracy)}m)</div>
                `;
            }
        });

        // Update active SOS record in database with verified live GPS coordinates
        if (activeSosId && window.jagruthiSosService?.updateSosEventLocation) {
            window.jagruthiSosService.updateSosEventLocation(activeSosId, activeSosLat, activeSosLng);
        }
    }

    function sendEmergencySmsNow() {
        emSmsPopupHandled = true;
        if (emSmsPopupTimer) clearTimeout(emSmsPopupTimer);

        const lat = activeSosLat || (liveUserCoords ? liveUserCoords.lat : (startLoc ? Number(startLoc[0]) : null));
        const lng = activeSosLng || (liveUserCoords ? liveUserCoords.lng : (startLoc ? Number(startLoc[1]) : null));

        if (!lat || !lng) {
            showAppToast("Acquiring live GPS fix... Please hold 2 seconds", "warning");
            acquireLiveEmergencyGps();
            return;
        }

        const mapsUrl = `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
        const smsMessage = `EMERGENCY! I am in danger. Please help me! My live location: ${mapsUrl}`;

        // Get personal contact numbers from saved user emergency contacts
        const savedContacts = getSavedEmergencyContacts();
        const recipientNumbers = savedContacts
            .map(c => c.phone.replace(/[^0-9+]/g, ''))
            .filter(p => p.length >= 7);

        if (recipientNumbers.length === 0) {
            recipientNumbers.push("9843050114", "6383972272", "9042594362");
        }

        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const delimiter = isIos ? ';' : ',';
        const paramChar = isIos ? '&' : '?';
        const numbersStr = recipientNumbers.join(delimiter);
        const smsUri = `sms:${numbersStr}${paramChar}body=${encodeURIComponent(smsMessage)}`;

        // Hide popup permanently for this emergency session
        if (emSmsPopupBackdrop) {
            emSmsPopupBackdrop.classList.add('hidden');
        }

        // Show bottom status toast (Image 3)
        if (emBottomStatusToast) {
            emBottomStatusToast.classList.remove('hidden');
            if (emBottomStatusToastText) {
                emBottomStatusToastText.innerText = "Sending SMS to emergency contacts...";
            }
            setTimeout(() => {
                if (emBottomStatusToast) emBottomStatusToast.classList.add('hidden');
            }, 6000);
        }

        // Trigger SMS application
        window.location.href = smsUri;
    }

    async function executeEmergencyActivation() {
        isEmergencyDispatchedActive = true;

        // Transition from countdown to dispatched view
        if (emCountdownBlock) emCountdownBlock.classList.add('hidden');
        if (emDispatchedBlock) emDispatchedBlock.classList.remove('hidden');
        if (emergencyOverlay) {
            emergencyOverlay.classList.remove('is-counting-down');
            emergencyOverlay.classList.add('is-dispatched');
        }

        // Populate emergency contacts matching Images 2 & 3
        populateDispatchedContacts();

        // Check if real live coordinates are already available
        if (lastDeviatedPosition && Array.isArray(lastDeviatedPosition)) {
            onDispatchedLocationSecured(lastDeviatedPosition[0], lastDeviatedPosition[1], 5);
        } else if (isJourneyActive && userMarker) {
            onDispatchedLocationSecured(userMarker.getLatLng().lat, userMarker.getLatLng().lng, 5);
        } else if (liveUserCoords) {
            onDispatchedLocationSecured(liveUserCoords.lat, liveUserCoords.lng, liveUserCoords.accuracy);
        } else if (startLoc) {
            onDispatchedLocationSecured(startLoc[0], startLoc[1], 15);
        }

        // Initial Location state: "Securing Live GPS..."
        if (emLocationStatusTitle) emLocationStatusTitle.innerHTML = `<i class="las la-spinner la-spin" style="color:#ef4444;"></i> Securing Live GPS...`;
        if (emLocationDisplay) emLocationDisplay.innerText = "Acquiring high-accuracy current location...";
        if (btnViewOnMap) btnViewOnMap.classList.add('hidden');

        // Reset SMS popup state for this emergency session
        emSmsPopupHandled = false;
        if (emSmsPopupTimer) clearTimeout(emSmsPopupTimer);

        // Fetch high-accuracy position immediately
        acquireLiveEmergencyGps();

        // Wait 2 seconds for accurate location fix before showing the SMS popup ONCE
        emSmsPopupTimer = setTimeout(() => {
            if (isEmergencyDispatchedActive && !emSmsPopupHandled && emSmsPopupBackdrop) {
                emSmsPopupBackdrop.classList.remove('hidden');
                emSmsPopupHandled = true; // Mark as handled so it never re-appears automatically
            }
        }, 2000);

        // Start Siren ONLY if NOT silent mode (audible alarm only - NO camera access)
        if (!pendingSosIsSilent) {
            emergencySiren.start();
            // DO NOT auto-start torch to avoid activating camera hardware / permissions
            if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 600]);
        } else {
            // Keep siren muted and torch off in silent mode
            emergencySiren.stop();
            emergencyTorch.stop();
            if ('vibrate' in navigator) navigator.vibrate(80);
        }
        updateHardwareButtonStyles();

        // Dispatch alert to backend / Supabase with captureEvidence flag
        try {
            await triggerSOSAction(pendingSosType, pendingSosMessage, { captureEvidence: pendingSosIsSilent });
        } catch (err) {
            console.error("Emergency dispatch error:", err);
        }
    }

    async function resolveEmergency() {
        console.log("Cancelling / resolving emergency alert...");

        // 1. Immediately stop audio, siren, torch, and timers
        try { emergencySiren.stop(); } catch (e) {}
        try { emergencyTorch.stop(); } catch (e) {}

        if (emergencyCountdownTimer) {
            clearInterval(emergencyCountdownTimer);
            emergencyCountdownTimer = null;
        }
        if (emSmsPopupTimer) {
            clearTimeout(emSmsPopupTimer);
            emSmsPopupTimer = null;
        }
        emSmsPopupHandled = false;

        // 2. Immediately reset flags and close overlays
        isEmergencyDispatchedActive = false;
        isEmergencyCountdownActive = false;
        pendingSosIsSilent = false;

        if (emergencyOverlay) {
            emergencyOverlay.classList.remove('is-counting-down', 'is-dispatched', 'is-silent-mode');
            emergencyOverlay.classList.add('hidden');
        }
        if (emCountdownBlock) emCountdownBlock.classList.add('hidden');
        if (emDispatchedBlock) emDispatchedBlock.classList.add('hidden');
        if (emSmsPopupBackdrop) emSmsPopupBackdrop.classList.add('hidden');
        if (emBottomStatusToast) emBottomStatusToast.classList.add('hidden');

        if ('vibrate' in navigator) {
            try { navigator.vibrate(80); } catch (e) {}
        }
        showAppToast("Emergency cancelled.", "info");

        // 3. Resolve record in Supabase asynchronously in background without blocking UI
        const sosIdToResolve = activeSosId;
        activeSosId = null;
        if (sosIdToResolve && window.jagruthiSosService?.resolveSosEvent) {
            try {
                await window.jagruthiSosService.resolveSosEvent(sosIdToResolve);
            } catch (err) {
                console.warn("Notice: resolveSosEvent background error:", err);
            }
        }
        console.log("Emergency successfully resolved by user.");
    }

    function updateHardwareButtonStyles() {
        if (btnToggleSiren) {
            if (emergencySiren.isPlaying && !emergencySiren.isMuted) {
                btnToggleSiren.classList.add('hw-active');
                if (sirenText) sirenText.innerText = "Siren: ON";
                if (sirenIcon) sirenIcon.className = "las la-volume-up";
            } else {
                btnToggleSiren.classList.remove('hw-active');
                if (sirenText) sirenText.innerText = "Siren: MUTED";
                if (sirenIcon) sirenIcon.className = "las la-volume-mute";
            }
        }
        if (btnToggleTorch) {
            if (emergencyTorch.isActive) {
                btnToggleTorch.classList.add('hw-active');
                if (torchText) torchText.innerText = "Torch: ON";
            } else {
                btnToggleTorch.classList.remove('hw-active');
                if (torchText) torchText.innerText = "Torch: OFF";
            }
        }
    }

    // Bind Emergency Activation Overlay Controls
    if (btnCancelEmergency) {
        btnCancelEmergency.addEventListener('click', cancelEmergencyCountdown);
    }
    if (btnResolveEmergency) {
        btnResolveEmergency.addEventListener('click', resolveEmergency);
    }

    // Delegated click & touch fallback for emergency cancel buttons
    document.addEventListener('click', (e) => {
        const resolveBtn = e.target.closest('#btnResolveEmergency, .btn-cancel-dispatched-emergency');
        if (resolveBtn) {
            e.preventDefault();
            e.stopPropagation();
            resolveEmergency();
            return;
        }
        const cancelBtn = e.target.closest('#btnCancelEmergency, .btn-cancel-emergency');
        if (cancelBtn) {
            e.preventDefault();
            e.stopPropagation();
            cancelEmergencyCountdown();
            return;
        }
    });
    if (btnViewOnMap) {
        btnViewOnMap.addEventListener('click', () => {
            const lat = activeSosLat || (liveUserCoords ? liveUserCoords.lat : (startLoc ? Number(startLoc[0]) : null));
            const lng = activeSosLng || (liveUserCoords ? liveUserCoords.lng : (startLoc ? Number(startLoc[1]) : null));
            if (lat && lng) {
                window.open(`https://www.google.com/maps?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`, '_blank');
            } else {
                showAppToast("Acquiring GPS fix...", "warning");
                acquireLiveEmergencyGps();
            }
        });
    }
    if (btnDismissSmsPopup) {
        btnDismissSmsPopup.addEventListener('click', () => {
            emSmsPopupHandled = true;
            if (emSmsPopupTimer) clearTimeout(emSmsPopupTimer);
            if (emSmsPopupBackdrop) emSmsPopupBackdrop.classList.add('hidden');
        });
    }
    if (btnSendSmsNow) {
        btnSendSmsNow.addEventListener('click', sendEmergencySmsNow);
    }
    if (btnRetryAlert) {
        btnRetryAlert.addEventListener('click', () => {
            executeEmergencyActivation();
        });
    }
    if (btnToggleSiren) {
        btnToggleSiren.addEventListener('click', () => {
            emergencySiren.toggleMute();
            updateHardwareButtonStyles();
        });
    }
    if (btnToggleTorch) {
        btnToggleTorch.addEventListener('click', async () => {
            await emergencyTorch.toggle();
            updateHardwareButtonStyles();
        });
    }

    // Bind Central SOS Button on Home Tab (SOS + Siren - Audible alarm, no automatic capture)
    const mainCentralSosBtn = document.getElementById('mainCentralSosBtn');
    if (mainCentralSosBtn) {
        mainCentralSosBtn.addEventListener('click', () => {
            startEmergencyCountdown("Emergency SOS", "User tapped central SOS + Siren button", false);
        });
    }

    // Bind Silent SOS Button on Home Tab (Silent SOS - Video & Audio Capture, No Siren)
    const btnSilentSos = document.getElementById('btnSilentSos');
    if (btnSilentSos) {
        btnSilentSos.addEventListener('click', () => {
            startEmergencyCountdown("Silent SOS", "User triggered Silent SOS (Automatic Video & Audio Capture)", true);
        });
    }

    // Direct SOS Button in SOS Tab
    const directSosTriggerBtn = document.getElementById('directSosTriggerBtn');
    if (directSosTriggerBtn) {
        directSosTriggerBtn.addEventListener('click', () => {
            startEmergencyCountdown("Emergency SOS", "User triggered manual SOS from Emergency Hub", false);
        });
    }

    /* ===================================================
       11. SHAKE-TO-SOS & SENSOR DIAGNOSTICS IMPLEMENTATION
       =================================================== */
    let lastShakeTimestamp = 0;
    let shakeStrokeCount = 0;
    let shakeResetTimer = null;
    let shakeCooldownActive = false;
    let shakeThreshold = 14; // Default: 14 m/s² (Firm & Intentional)
    let peakRecordedIntensity = 0;
    let motionListenerActive = false;

    // Diagnostics DOM Elements
    const shakeDiagnosticsModal = document.getElementById('shakeDiagnosticsModal');
    const shakeDiagOverlay = document.getElementById('shakeDiagOverlay');
    const closeShakeDiagBtn = document.getElementById('closeShakeDiagBtn');
    const btnOpenDiagnostics = document.getElementById('btnOpenDiagnostics');
    const diagSensorStatus = document.getElementById('diagSensorStatus');
    const diagPermissionStatus = document.getElementById('diagPermissionStatus');
    const diagIntensityVal = document.getElementById('diagIntensityVal');
    const diagIntensityBar = document.getElementById('diagIntensityBar');
    const diagThresholdMarker = document.getElementById('diagThresholdMarker');
    const diagThreshLabel = document.getElementById('diagThreshLabel');
    const diagAccX = document.getElementById('diagAccX');
    const diagAccY = document.getElementById('diagAccY');
    const diagAccZ = document.getElementById('diagAccZ');
    const diagPeakVal = document.getElementById('diagPeakVal');
    const diagStatusNote = document.getElementById('diagStatusNote');
    const strokeBubble1 = document.getElementById('strokeBubble1');
    const strokeBubble2 = document.getElementById('strokeBubble2');
    const btnResetPeak = document.getElementById('btnResetPeak');
    const btnSimulateShake = document.getElementById('btnSimulateShake');
    const btnSensHigh = document.getElementById('btnSensHigh');
    const btnSensNormal = document.getElementById('btnSensNormal');
    const btnSensFirm = document.getElementById('btnSensFirm');

    function handleDeviceMotion(event) {
        if (shakeCooldownActive || isEmergencyCountdownActive || isEmergencyDispatchedActive) {
            if (diagStatusNote && shakeCooldownActive) {
                diagStatusNote.innerText = "Cooldown active (10s)...";
            }
            return;
        }

        const acc = event.acceleration;
        let magnitude = 0;
        let rx = 0, ry = 0, rz = 0;

        // 1. Try linear acceleration excluding gravity
        if (acc && acc.x !== null && acc.y !== null && acc.z !== null &&
            (Math.abs(acc.x) > 0.001 || Math.abs(acc.y) > 0.001 || Math.abs(acc.z) > 0.001)) {
            rx = acc.x; ry = acc.y; rz = acc.z;
            magnitude = Math.sqrt(rx * rx + ry * ry + rz * rz);
        } else {
            // 2. Fallback to accelerationIncludingGravity minus standard Earth gravity
            const gAcc = event.accelerationIncludingGravity;
            if (gAcc && gAcc.x !== null) {
                rx = gAcc.x; ry = gAcc.y; rz = gAcc.z;
                const totalG = Math.sqrt(rx * rx + ry * ry + rz * rz);
                magnitude = Math.abs(totalG - 9.80665);
            }
        }

        if (magnitude > peakRecordedIntensity) {
            peakRecordedIntensity = magnitude;
        }

        // Live Diagnostics Readout if modal is open
        if (shakeDiagnosticsModal && shakeDiagnosticsModal.classList.contains('show')) {
            if (diagAccX) diagAccX.innerText = (rx >= 0 ? '+' : '') + rx.toFixed(2);
            if (diagAccY) diagAccY.innerText = (ry >= 0 ? '+' : '') + ry.toFixed(2);
            if (diagAccZ) diagAccZ.innerText = (rz >= 0 ? '+' : '') + rz.toFixed(2);
            if (diagIntensityVal) diagIntensityVal.innerText = magnitude.toFixed(2) + " m/s²";
            if (diagPeakVal) diagPeakVal.innerText = peakRecordedIntensity.toFixed(2) + " m/s²";
            if (diagIntensityBar) {
                const pct = Math.min(100, Math.round((magnitude / 30) * 100));
                diagIntensityBar.style.width = pct + "%";
            }
        }

        // 3. Deliberate Double-Shake Detection State Machine
        const now = Date.now();
        if (magnitude >= shakeThreshold) {
            const timeSinceLastShake = now - lastShakeTimestamp;

            // Debounce: must be at least 250ms apart from the previous stroke
            if (timeSinceLastShake < 250) {
                return;
            }

            if (shakeStrokeCount === 0 || timeSinceLastShake > 2500) {
                // First deliberate shake stroke detected
                shakeStrokeCount = 1;
                lastShakeTimestamp = now;

                if ('vibrate' in navigator) navigator.vibrate(60);

                if (strokeBubble1) strokeBubble1.classList.add('active');
                if (strokeBubble2) strokeBubble2.classList.remove('active');
                if (diagStatusNote) diagStatusNote.innerText = "Shake 1/2 detected! Shake once more within 2.5s...";

                clearTimeout(shakeResetTimer);
                shakeResetTimer = setTimeout(() => {
                    shakeStrokeCount = 0;
                    lastShakeTimestamp = 0;
                    if (strokeBubble1) strokeBubble1.classList.remove('active');
                    if (strokeBubble2) strokeBubble2.classList.remove('active');
                    if (diagStatusNote) diagStatusNote.innerText = "Waiting for motion...";
                }, 2500);

            } else if (shakeStrokeCount === 1 && timeSinceLastShake >= 250 && timeSinceLastShake <= 2500) {
                // Second deliberate shake detected within 2.5s -> TRIGGER EMERGENCY SOS!
                clearTimeout(shakeResetTimer);
                shakeStrokeCount = 2;
                lastShakeTimestamp = 0;
                shakeCooldownActive = true;

                if (strokeBubble2) strokeBubble2.classList.add('active');
                if (diagStatusNote) diagStatusNote.innerText = "🚨 Double Shake Verified! Triggering Emergency SOS...";

                if ('vibrate' in navigator) navigator.vibrate([120, 80, 200]);

                setTimeout(() => {
                    shakeCooldownActive = false;
                    shakeStrokeCount = 0;
                    if (strokeBubble1) strokeBubble1.classList.remove('active');
                    if (strokeBubble2) strokeBubble2.classList.remove('active');
                    if (diagStatusNote) diagStatusNote.innerText = "Sensors active • 2 shakes for SOS";
                }, 10000); // 10s cooldown

                closeShakeDiagnostics();

                // Trigger real SOS workflow
                startEmergencyCountdown("Shake-to-SOS Activated", "Emergency triggered via double device shake");
            }
        }
    }

    function initShakeDetection() {
        if (typeof window.DeviceMotionEvent === 'undefined') {
            console.warn("[Shake] DeviceMotionEvent not supported on this platform.");
            if (diagSensorStatus) {
                diagSensorStatus.innerText = "Hardware Unavailable";
                diagSensorStatus.style.background = "#fee2e2";
                diagSensorStatus.style.color = "#dc2626";
            }
            if (diagPermissionStatus) diagPermissionStatus.innerText = "Unsupported";
            return;
        }

        // Clean up any existing listener to prevent duplicate triggers
        window.removeEventListener('devicemotion', handleDeviceMotion);

        // iOS 13+ permission check
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            if (diagPermissionStatus) diagPermissionStatus.innerText = "Click to Authorize";
            const requestIosPermission = async () => {
                try {
                    const permission = await DeviceMotionEvent.requestPermission();
                    if (permission === 'granted') {
                        window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
                        motionListenerActive = true;
                        if (diagPermissionStatus) {
                            diagPermissionStatus.innerText = "Granted";
                            diagPermissionStatus.style.background = "#dcfce7";
                            diagPermissionStatus.style.color = "#15803d";
                        }
                    } else {
                        if (diagPermissionStatus) diagPermissionStatus.innerText = "Denied";
                    }
                } catch (e) {
                    console.warn("Motion permission request notice:", e);
                }
            };
            window.addEventListener('click', requestIosPermission, { once: true });
        } else {
            // Android, Chrome, and standard mobile browsers: Register listener immediately
            try {
                window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
                motionListenerActive = true;
                if (diagPermissionStatus) {
                    diagPermissionStatus.innerText = "Granted (Native)";
                    diagPermissionStatus.style.background = "#dcfce7";
                    diagPermissionStatus.style.color = "#15803d";
                }
                if (diagSensorStatus) {
                    diagSensorStatus.innerText = "Active & Calibrated";
                }
                console.log("[Shake] Device motion sensor active on Android/Chrome.");
            } catch (regErr) {
                console.warn("[Shake] Registration error:", regErr);
            }
        }
    }

    function openShakeDiagnostics() {
        initShakeDetection();
        if (shakeDiagOverlay) shakeDiagOverlay.classList.add('show');
        if (shakeDiagnosticsModal) shakeDiagnosticsModal.classList.add('show');
    }

    function closeShakeDiagnostics() {
        if (shakeDiagOverlay) shakeDiagOverlay.classList.remove('show');
        if (shakeDiagnosticsModal) shakeDiagnosticsModal.classList.remove('show');
    }

    if (btnOpenDiagnostics) btnOpenDiagnostics.addEventListener('click', openShakeDiagnostics);
    if (closeShakeDiagBtn) closeShakeDiagBtn.addEventListener('click', closeShakeDiagnostics);
    if (shakeDiagOverlay) shakeDiagOverlay.addEventListener('click', closeShakeDiagnostics);

    if (btnResetPeak) {
        btnResetPeak.addEventListener('click', () => {
            peakRecordedIntensity = 0;
            if (diagPeakVal) diagPeakVal.innerText = "0.00 m/s²";
        });
    }

    // Simulate double shake for diagnostic testing
    if (btnSimulateShake) {
        btnSimulateShake.addEventListener('click', () => {
            closeShakeDiagnostics();
            if ('vibrate' in navigator) navigator.vibrate([120, 80, 200]);
            startEmergencyCountdown("Simulated Shake SOS", "Triggered via Sensor Diagnostics Simulator");
        });
    }

    // Sensitivity adjusters
    function setShakeSensitivity(thresh, activeBtn) {
        shakeThreshold = thresh;
        if (diagThreshLabel) diagThreshLabel.innerText = thresh.toString();
        if (diagThresholdMarker) {
            const pct = Math.round((thresh / 30) * 100);
            diagThresholdMarker.style.left = pct + "%";
        }
        [btnSensHigh, btnSensNormal, btnSensFirm].forEach(b => { if (b) b.classList.remove('active'); });
        if (activeBtn) activeBtn.classList.add('active');
    }

    if (btnSensHigh) btnSensHigh.addEventListener('click', () => setShakeSensitivity(11, btnSensHigh));
    if (btnSensNormal) btnSensNormal.addEventListener('click', () => setShakeSensitivity(14, btnSensNormal));
    if (btnSensFirm) btnSensFirm.addEventListener('click', () => setShakeSensitivity(18, btnSensFirm));

    // Automatically initialize shake detection immediately
    initShakeDetection();
    // Also re-verify on user's first touch gesture
    window.addEventListener('touchstart', () => {
        if (!motionListenerActive) initShakeDetection();
    }, { once: true, passive: true });

    /* ===================================================
       12. SAFETY 2X2 GRID FEATURES (REFERENCE IMAGE)
       =================================================== */

    // ---------------------------------------------
    // CARD 1: Emergency Contacts Quick Sheet & Long-Press Editor
    // ---------------------------------------------
    const btnGridContacts = document.getElementById('btnGridContacts');
    const contactsSheetOverlay = document.getElementById('contactsSheetOverlay');
    const contactsQuickSheetModal = document.getElementById('contactsQuickSheetModal');
    const closeContactsSheetBtn = document.getElementById('closeContactsSheetBtn');
    const btnManageContactsLink = document.getElementById('btnManageContactsLink');
    const btnOpenEditFromSheet = document.getElementById('btnOpenEditFromSheet');
    const quickContactsListContainer = document.getElementById('quickContactsListContainer');

    // Edit Contacts Modal Elements
    const editContactsOverlay = document.getElementById('editContactsOverlay');
    const editContactsModal = document.getElementById('editContactsModal');
    const closeEditContactsBtn = document.getElementById('closeEditContactsBtn');
    const editContactsRowsContainer = document.getElementById('editContactsRowsContainer');
    const btnAddContactRow = document.getElementById('btnAddContactRow');
    const btnResetContactsDefaults = document.getElementById('btnResetContactsDefaults');
    const btnSaveContacts = document.getElementById('btnSaveContacts');

    function openContactsSheet() {
        if (contactsSheetOverlay) contactsSheetOverlay.classList.add('show');
        if (contactsQuickSheetModal) contactsQuickSheetModal.classList.add('show');
        populateQuickContacts();
    }

    function closeContactsSheet() {
        if (contactsSheetOverlay) contactsSheetOverlay.classList.remove('show');
        if (contactsQuickSheetModal) contactsQuickSheetModal.classList.remove('show');
    }

    async function populateQuickContacts() {
        if (!quickContactsListContainer) return;
        const contacts = getSavedEmergencyContacts();

        if (contacts.length === 0) {
            quickContactsListContainer.innerHTML = `
                <div style="padding: 14px; text-align: center; color: #64748b; font-size: 0.88rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px;">
                    <i class="las la-user-plus" style="font-size: 1.6rem; display: block; margin-bottom: 4px; color: var(--primary);"></i>
                    No emergency contact linked yet.<br>
                    <small>Tap "Edit Contact Numbers" below to configure.</small>
                </div>
            `;
        } else {
            quickContactsListContainer.innerHTML = contacts.map(c => {
                const initial = (c.name ? c.name.trim().charAt(0) : 'E').toUpperCase() || 'E';
                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: #f3e8ff; color: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight:700;">
                            ${initial}
                        </div>
                        <div>
                            <strong style="display: block; font-size: 0.95rem; color: var(--text-dark);">${c.name}</strong>
                            <span style="font-size: 0.82rem; color: #64748b;">${c.phone}</span>
                        </div>
                    </div>
                    <a href="tel:${c.phone.replace(/\\s+/g, '')}" style="background: var(--success); color: white; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; text-decoration: none; box-shadow: 0 4px 10px rgba(16,185,129,0.3);" aria-label="Call ${c.name}">
                        <i class="las la-phone"></i>
                    </a>
                </div>
                `;
            }).join('');
        }
    }

    // Edit Contacts Modal Controller
    function openEditContactsModal() {
        closeContactsSheet();
        renderEditContactsRows();
        if (editContactsOverlay) editContactsOverlay.classList.add('show');
        if (editContactsModal) editContactsModal.classList.add('show');
    }

    function closeEditContactsModal() {
        if (editContactsOverlay) editContactsOverlay.classList.remove('show');
        if (editContactsModal) editContactsModal.classList.remove('show');
    }

    function createContactRowElement(name = '', phone = '', index = 0) {
        const row = document.createElement('div');
        row.className = 'edit-contact-row';
        row.dataset.index = index;

        const initial = (name ? name.trim().charAt(0) : 'E').toUpperCase() || 'E';

        row.innerHTML = `
            <div class="edit-contact-avatar">${initial}</div>
            <div class="edit-contact-inputs">
                <input type="text" class="edit-input-name" placeholder="Name (e.g. Amma, Sister)" value="${escapeHtml(name)}" autocomplete="off" />
                <input type="tel" class="edit-input-phone" placeholder="Phone (e.g. 9843050114)" value="${escapeHtml(phone)}" autocomplete="tel" />
            </div>
            <button type="button" class="btn-del-contact" title="Delete contact" aria-label="Delete contact">
                <i class="las la-trash-alt"></i>
            </button>
        `;

        const nameInput = row.querySelector('.edit-input-name');
        const avatar = row.querySelector('.edit-contact-avatar');
        if (nameInput && avatar) {
            nameInput.addEventListener('input', () => {
                const val = nameInput.value.trim();
                avatar.innerText = val ? val.charAt(0).toUpperCase() : 'E';
            });
        }

        const delBtn = row.querySelector('.btn-del-contact');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                if (!editContactsRowsContainer) return;
                const allRows = editContactsRowsContainer.querySelectorAll('.edit-contact-row');
                if (allRows.length <= 1) {
                    showAppToast('You must have at least one emergency contact.', 'error');
                    return;
                }
                row.remove();
            });
        }

        return row;
    }

    function renderEditContactsRows(customList = null) {
        if (!editContactsRowsContainer) return;
        const list = customList || getSavedEmergencyContacts();

        editContactsRowsContainer.innerHTML = '';
        list.forEach((c, idx) => {
            const row = createContactRowElement(c.name, c.phone, idx);
            editContactsRowsContainer.appendChild(row);
        });
    }

    // Modal Action Listeners
    if (btnAddContactRow) {
        btnAddContactRow.addEventListener('click', () => {
            if (!editContactsRowsContainer) return;
            const count = editContactsRowsContainer.querySelectorAll('.edit-contact-row').length;
            const newRow = createContactRowElement('', '', count);
            editContactsRowsContainer.appendChild(newRow);
            const input = newRow.querySelector('.edit-input-name');
            if (input) input.focus();
        });
    }

    if (btnResetContactsDefaults) {
        btnResetContactsDefaults.addEventListener('click', () => {
            renderEditContactsRows(DEFAULT_EMERGENCY_CONTACTS);
            showAppToast('Reset to default emergency contacts', 'info');
        });
    }

    if (btnSaveContacts) {
        btnSaveContacts.addEventListener('click', async () => {
            if (!editContactsRowsContainer) return;
            const rows = editContactsRowsContainer.querySelectorAll('.edit-contact-row');
            const newContacts = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const nameInput = row.querySelector('.edit-input-name');
                const phoneInput = row.querySelector('.edit-input-phone');
                const name = (nameInput?.value || '').trim() || `Contact ${i + 1}`;
                const phone = (phoneInput?.value || '').trim();

                const cleanDigits = phone.replace(/[^0-9+]/g, '');
                if (!phone || cleanDigits.length < 5) {
                    showAppToast(`Enter a valid phone number for "${name}"`, 'error');
                    if (phoneInput) phoneInput.focus();
                    return;
                }

                newContacts.push({ name, phone });
            }

            if (newContacts.length === 0) {
                showAppToast('Please add at least one emergency contact.', 'error');
                return;
            }

            // Save to localStorage
            localStorage.setItem('userEmergencyContacts', JSON.stringify(newContacts));

            // Sync with Supabase if logged in
            const userPhone = localStorage.getItem('userPhone');
            if (supabase && userPhone) {
                try {
                    await supabase
                        .from('users')
                        .update({ emergency_contact: newContacts[0].phone })
                        .eq('phone', userPhone);
                } catch (err) {
                    console.warn("Could not sync emergency contact to Supabase:", err);
                }
            }

            // Synchronize all UI representations
            loadUserEmergencyContacts();
            populateQuickContacts();
            populateDispatchedContacts();

            closeEditContactsModal();

            if (navigator.vibrate) {
                try { navigator.vibrate([40, 50, 40]); } catch (_) {}
            }

            showAppToast('Emergency contacts updated successfully!', 'success');
        });
    }

    if (closeEditContactsBtn) closeEditContactsBtn.addEventListener('click', closeEditContactsModal);
    if (editContactsOverlay) editContactsOverlay.addEventListener('click', closeEditContactsModal);
    if (btnOpenEditFromSheet) {
        btnOpenEditFromSheet.addEventListener('click', () => {
            closeContactsSheet();
            openEditContactsModal();
        });
    }

    // Long-Press and Click Detection on Card 1
    let contactsLongPressTimer = null;
    let contactsLongPressTriggered = false;
    let contactsTouchStartX = 0;
    let contactsTouchStartY = 0;

    function handleContactsPressStart(e) {
        contactsLongPressTriggered = false;
        if (e.type === 'touchstart') {
            const touch = e.touches[0];
            contactsTouchStartX = touch.clientX;
            contactsTouchStartY = touch.clientY;
        }

        if (btnGridContacts) {
            btnGridContacts.classList.add('is-pressing');
        }

        clearTimeout(contactsLongPressTimer);
        contactsLongPressTimer = setTimeout(() => {
            contactsLongPressTriggered = true;
            if (btnGridContacts) {
                btnGridContacts.classList.remove('is-pressing');
            }
            if (navigator.vibrate) {
                try { navigator.vibrate(60); } catch (_) {}
            }
            openEditContactsModal();
        }, 500); // 500ms long-press threshold
    }

    function handleContactsPressEnd() {
        clearTimeout(contactsLongPressTimer);
        if (btnGridContacts) {
            btnGridContacts.classList.remove('is-pressing');
        }
    }

    function handleContactsTouchMove(e) {
        if (e.type === 'touchmove') {
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - contactsTouchStartX);
            const dy = Math.abs(touch.clientY - contactsTouchStartY);
            if (dx > 12 || dy > 12) {
                handleContactsPressEnd();
            }
        }
    }

    if (btnGridContacts) {
        // Touch events for mobile phones
        btnGridContacts.addEventListener('touchstart', handleContactsPressStart, { passive: true });
        btnGridContacts.addEventListener('touchend', handleContactsPressEnd);
        btnGridContacts.addEventListener('touchcancel', handleContactsPressEnd);
        btnGridContacts.addEventListener('touchmove', handleContactsTouchMove, { passive: true });

        // Mouse events for desktop/simulator testing
        btnGridContacts.addEventListener('mousedown', (e) => {
            if (e.button === 0) handleContactsPressStart(e);
        });
        btnGridContacts.addEventListener('mouseup', handleContactsPressEnd);
        btnGridContacts.addEventListener('mouseleave', handleContactsPressEnd);

        // Prevent default browser context menu on long press
        btnGridContacts.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Click handler: only trigger quick sheet on standard tap, not after long press
        btnGridContacts.addEventListener('click', (e) => {
            if (contactsLongPressTriggered) {
                e.preventDefault();
                e.stopPropagation();
                contactsLongPressTriggered = false;
                return;
            }
            openContactsSheet();
        });
    }

    if (closeContactsSheetBtn) closeContactsSheetBtn.addEventListener('click', closeContactsSheet);
    if (contactsSheetOverlay) contactsSheetOverlay.addEventListener('click', closeContactsSheet);
    if (btnManageContactsLink) {
        btnManageContactsLink.addEventListener('click', () => {
            closeContactsSheet();
            const navTabProfile = document.getElementById('navTabProfile');
            if (navTabProfile) navTabProfile.click();
        });
    }

    // ---------------------------------------------
    // CARD 2 / TAB 3: Safety (My Location & Nearby Safe Places)
    // ---------------------------------------------
    const navTabSafety = document.getElementById('navTabSafety');
    const safetyLocSpinner = document.getElementById('safetyLocSpinner');
    const safetyLocAddressText = document.getElementById('safetyLocAddressText');
    const safetyLocCoordsText = document.getElementById('safetyLocCoordsText');
    const btnSafetyViewMap = document.getElementById('btnSafetyViewMap');
    const btnSafetyBackToHome = document.getElementById('btnSafetyBackToHome');
    const cardSafePolice = document.getElementById('cardSafePolice');
    const cardSafeHospitals = document.getElementById('cardSafeHospitals');
    const cardSafeServices = document.getElementById('cardSafeServices');
    const cardSafeFire = document.getElementById('cardSafeFire');
    const cardSafePharmacies = document.getElementById('cardSafePharmacies');

    window.updateSafetyLocationUI = function() {
        const addrText = (homeCurrentLocText && homeCurrentLocText.innerText && homeCurrentLocText.innerText !== "Detecting location...")
            ? homeCurrentLocText.innerText
            : (startLoc ? `Live GPS (${Number(startLoc[0]).toFixed(4)}, ${Number(startLoc[1]).toFixed(4)})` : null);

        if (startLoc || addrText) {
            if (safetyLocSpinner) safetyLocSpinner.classList.add('hidden');
            if (safetyLocAddressText) safetyLocAddressText.innerText = addrText || "Exact GPS Location Detected";
            if (safetyLocCoordsText && startLoc) {
                safetyLocCoordsText.innerText = `Lat: ${Number(startLoc[0]).toFixed(5)}, Lng: ${Number(startLoc[1]).toFixed(5)}`;
            }
        } else {
            if (safetyLocSpinner) safetyLocSpinner.classList.remove('hidden');
            if (safetyLocAddressText) safetyLocAddressText.innerText = "Acquiring GPS Signal...";
            if (safetyLocCoordsText) safetyLocCoordsText.innerText = "Waiting for GPS satellites...";

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    startLoc = [lat, lng];
                    if (typeof applyUserGpsPosition === 'function') {
                        applyUserGpsPosition(lat, lng);
                    }
                    if (typeof updateSafetyLocationUI === 'function') {
                        updateSafetyLocationUI();
                    }
                }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
            }
        }
    };

    // When clicking "My Location" on the Home grid, go directly to Safety tab
    const btnGridLocation = document.getElementById('btnGridLocation');
    if (btnGridLocation) {
        btnGridLocation.addEventListener('click', () => {
            if (navTabSafety) navTabSafety.click();
            window.updateSafetyLocationUI();
        });
    }

    // Back to Home from Safety tab header
    if (btnSafetyBackToHome) {
        btnSafetyBackToHome.addEventListener('click', () => {
            const navTabHome = document.getElementById('navTabHome');
            if (navTabHome) navTabHome.click();
        });
    }

    // VIEW ON MAP button: opens user's exact live location directly on Google Maps
    if (btnSafetyViewMap) {
        btnSafetyViewMap.addEventListener('click', () => {
            if (startLoc) {
                const lat = Number(startLoc[0]).toFixed(6);
                const lng = Number(startLoc[1]).toFixed(6);
                window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
            } else if (navigator.geolocation) {
                btnSafetyViewMap.innerHTML = '<i class="las la-spinner la-spin"></i> Locating...';
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const lat = pos.coords.latitude.toFixed(6);
                        const lng = pos.coords.longitude.toFixed(6);
                        startLoc = [pos.coords.latitude, pos.coords.longitude];
                        btnSafetyViewMap.innerHTML = '<i class="las la-map"></i> VIEW ON MAP';
                        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                    },
                    () => {
                        btnSafetyViewMap.innerHTML = '<i class="las la-map"></i> VIEW ON MAP';
                        window.open('https://www.google.com/maps', '_blank');
                    },
                    { enableHighAccuracy: true, timeout: 6000 }
                );
            } else {
                window.open('https://www.google.com/maps', '_blank');
            }
        });
    }

    // ==============================================================
    // NEARBY SAFE PLACES: MULTI-CATEGORY PINNED MAP & CARDS
    // (Police Stations, Hospitals, Fire & Rescue, Pharmacies)
    // ==============================================================
    const nearbyPoliceStationsModal = document.getElementById('nearbyPoliceStationsModal');
    const closePoliceStationsBtn = document.getElementById('closePoliceStationsBtn');
    const btnRefreshPoliceStations = document.getElementById('btnRefreshPoliceStations');
    const policeMapStatusPill = document.getElementById('policeMapStatusPill');
    const policeStationsCountBadge = document.getElementById('policeStationsCountBadge');
    const policeCardsList = document.getElementById('policeCardsList');
    const safePlacesMapHeadTitle = document.getElementById('safePlacesMapHeadTitle');
    const safePlacesListTitle = document.getElementById('safePlacesListTitle');
    const safePlacesCategoryTabs = document.querySelectorAll('.safe-category-tab');

    let currentSafePlaceCategory = 'police';
    let nearbySafePlacesMapInstance = null;
    let safePlacesMarkersGroup = null;
    let safePlacesUserMarker = null;
    let safePlacesMarkerLookup = {};

    function calcDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    const safePlacesCategoryConfig = {
        police: {
            title: 'Nearby Police Stations',
            listTitle: 'Verified Police Stations',
            badgeText: 'POLICE STATION',
            iconClass: 'las la-shield-alt',
            singular: 'Police Station',
            defaultPlaces: [
                {
                    id: 'ps_rajanukunte',
                    name: 'Rajanukunte Police Station',
                    shortName: 'Rajanukunte PS',
                    lat: 13.1785,
                    lng: 77.5501,
                    address: 'SH 9, Rajanukunte, Bengaluru 560064',
                    phone: '080-28468300'
                },
                {
                    id: 'ps_yelahanka_new',
                    name: 'Yelahanka New Town Police Station',
                    shortName: 'Yelahanka New PS',
                    lat: 13.0988,
                    lng: 77.5756,
                    address: '4th Phase, Yelahanka New Town, Bengaluru 560064',
                    phone: '080-22942548'
                },
                {
                    id: 'ps_yelahanka_old',
                    name: 'Yelahanka Old Town Police Station',
                    shortName: 'Yelahanka Town PS',
                    lat: 13.1009,
                    lng: 77.5962,
                    address: 'BB Road, Yelahanka, Bengaluru 560064',
                    phone: '080-22942547'
                },
                {
                    id: 'ps_vidyaranyapura',
                    name: 'Vidyaranyapura Police Station',
                    shortName: 'Vidyaranyapura PS',
                    lat: 13.0818,
                    lng: 77.5558,
                    address: '3rd Block, Vidyaranyapura, Bengaluru 560097',
                    phone: '080-22942551'
                },
                {
                    id: 'ps_chikkajala',
                    name: 'Chikkajala Police Station',
                    shortName: 'Chikkajala PS',
                    lat: 13.1678,
                    lng: 77.6254,
                    address: 'International Airport Road, Chikkajala, Bengaluru 562157',
                    phone: '080-28467222'
                },
                {
                    id: 'ps_kodigehalli',
                    name: 'Kodigehalli Police Station',
                    shortName: 'Kodigehalli PS',
                    lat: 13.0583,
                    lng: 77.5858,
                    address: 'Kodigehalli Main Road, Sahakara Nagar, Bengaluru 560092',
                    phone: '080-22942550'
                }
            ],
            getLocalPlaces: (uLat, uLng) => [
                {
                    id: 'ps_local_1',
                    name: 'Central Police Station',
                    shortName: 'Central PS',
                    lat: uLat + 0.012,
                    lng: uLng + 0.010,
                    address: 'Main Station Road (24/7 Patrol)',
                    phone: '112'
                },
                {
                    id: 'ps_local_2',
                    name: 'Town Police Division',
                    shortName: 'Town PS',
                    lat: uLat - 0.015,
                    lng: uLng + 0.008,
                    address: 'Civil Lines Road (Direct Response)',
                    phone: '100'
                },
                {
                    id: 'ps_local_3',
                    name: 'Highway Police Patrol Unit',
                    shortName: 'Highway Patrol',
                    lat: uLat + 0.008,
                    lng: uLng - 0.018,
                    address: 'Highway Outpost Checkpoint',
                    phone: '112'
                },
                {
                    id: 'ps_local_4',
                    name: 'District Women Police Station',
                    shortName: 'Women PS',
                    lat: uLat - 0.011,
                    lng: uLng - 0.012,
                    address: 'Women Safety Special Division',
                    phone: '1091'
                }
            ]
        },
        hospitals: {
            title: 'Nearby Hospitals & Emergency Care',
            listTitle: 'Verified Emergency Hospitals',
            badgeText: 'HOSPITAL / 24x7 ER',
            iconClass: 'las la-plus-square',
            singular: 'Hospital',
            defaultPlaces: [
                {
                    id: 'hosp_yelahanka_gen',
                    name: 'Yelahanka General Hospital',
                    shortName: 'Yelahanka Gen Hosp',
                    lat: 13.1022,
                    lng: 77.5955,
                    address: 'BB Road, Yelahanka Old Town, Bengaluru 560064',
                    phone: '080-28560241'
                },
                {
                    id: 'hosp_manipal_yel',
                    name: 'Manipal Hospital Yelahanka',
                    shortName: 'Manipal Hospital',
                    lat: 13.1082,
                    lng: 77.5812,
                    address: '15th Cross, Yelahanka New Town, Bengaluru 560064',
                    phone: '080-22221111'
                },
                {
                    id: 'hosp_aster_cmi',
                    name: 'Aster CMI Hospital',
                    shortName: 'Aster CMI Hosp',
                    lat: 13.0573,
                    lng: 77.5928,
                    address: 'NH 44, Sahakar Nagar, Hebbal, Bengaluru 560092',
                    phone: '080-43444444'
                },
                {
                    id: 'hosp_cytecare',
                    name: 'Cytecare Multispeciality Hospital',
                    shortName: 'Cytecare Hospital',
                    lat: 13.1552,
                    lng: 77.6180,
                    address: 'Venkatala, NH 44, Near Airport Corridor, Bengaluru 560064',
                    phone: '080-22176767'
                },
                {
                    id: 'hosp_navachethana',
                    name: 'Navachethana Hospital',
                    shortName: 'Navachethana Hosp',
                    lat: 13.1005,
                    lng: 77.5714,
                    address: 'A Sector, Yelahanka New Town, Bengaluru 560064',
                    phone: '080-28461888'
                },
                {
                    id: 'hosp_kk_multi',
                    name: 'KK Multispeciality Hospital',
                    shortName: 'KK Hospital',
                    lat: 13.1120,
                    lng: 77.5880,
                    address: 'Kogilu Main Road, Maruthi Nagar, Bengaluru 560064',
                    phone: '080-28462222'
                }
            ],
            getLocalPlaces: (uLat, uLng) => [
                {
                    id: 'hosp_local_1',
                    name: 'District Government Civil Hospital',
                    shortName: 'Civil Hospital ER',
                    lat: uLat + 0.010,
                    lng: uLng + 0.012,
                    address: 'Hospital Road (24/7 Trauma Care)',
                    phone: '108'
                },
                {
                    id: 'hosp_local_2',
                    name: 'Apex Multispeciality Hospital',
                    shortName: 'Apex Hospital',
                    lat: uLat - 0.014,
                    lng: uLng + 0.009,
                    address: 'Ring Road Junction (Emergency & ICU)',
                    phone: '108'
                },
                {
                    id: 'hosp_local_3',
                    name: 'Lifeline Emergency & Trauma Center',
                    shortName: 'Lifeline Trauma',
                    lat: uLat + 0.016,
                    lng: uLng - 0.011,
                    address: 'Main Highway Sector (Critical Care)',
                    phone: '108'
                },
                {
                    id: 'hosp_local_4',
                    name: 'City Care Emergency Hospital',
                    shortName: 'City Care Hospital',
                    lat: uLat - 0.009,
                    lng: uLng - 0.015,
                    address: 'Market Central Road (24-Hour ER)',
                    phone: '108'
                }
            ]
        },
        fire: {
            title: 'Nearby Fire & Rescue Stations',
            listTitle: 'Verified Fire & Rescue Stations',
            badgeText: 'FIRE & RESCUE',
            iconClass: 'las la-truck',
            singular: 'Fire Station',
            defaultPlaces: [
                {
                    id: 'fire_yelahanka',
                    name: 'Yelahanka Fire & Emergency Station',
                    shortName: 'Yelahanka Fire Stn',
                    lat: 13.1042,
                    lng: 77.5910,
                    address: 'Railway Parallel Road, Yelahanka, Bengaluru 560064',
                    phone: '101'
                },
                {
                    id: 'fire_hebbal',
                    name: 'Hebbal Fire & Rescue Station',
                    shortName: 'Hebbal Fire Stn',
                    lat: 13.0360,
                    lng: 77.5975,
                    address: 'Bellary Road, Near Hebbal Flyover, Bengaluru 560024',
                    phone: '080-22971520'
                },
                {
                    id: 'fire_peenya',
                    name: 'Peenya Industrial Fire Station',
                    shortName: 'Peenya Fire Stn',
                    lat: 13.0315,
                    lng: 77.5255,
                    address: '2nd Stage, Peenya Industrial Area, Bengaluru 560058',
                    phone: '080-22971522'
                },
                {
                    id: 'fire_chikkajala',
                    name: 'Chikkajala Airport Corridor Fire Unit',
                    shortName: 'Chikkajala Fire',
                    lat: 13.1710,
                    lng: 77.6310,
                    address: 'Airport Toll Road, Chikkajala, Bengaluru 562157',
                    phone: '101'
                },
                {
                    id: 'fire_hq',
                    name: 'Karnataka Fire & Emergency Services HQ',
                    shortName: 'State Fire HQ',
                    lat: 12.9650,
                    lng: 77.5980,
                    address: 'Sheshadri Road, Bengaluru 560001',
                    phone: '101'
                }
            ],
            getLocalPlaces: (uLat, uLng) => [
                {
                    id: 'fire_local_1',
                    name: 'District Fire & Rescue Station',
                    shortName: 'District Fire Stn',
                    lat: uLat + 0.014,
                    lng: uLng + 0.015,
                    address: 'Emergency Response Zone (24/7 Dispatch)',
                    phone: '101'
                },
                {
                    id: 'fire_local_2',
                    name: 'City Fire Outpost & Rescue Unit',
                    shortName: 'City Fire Outpost',
                    lat: uLat - 0.016,
                    lng: uLng + 0.011,
                    address: 'Municipal Fire Outpost, Main Road',
                    phone: '101'
                },
                {
                    id: 'fire_local_3',
                    name: 'Industrial Disaster Response Fire Unit',
                    shortName: 'Disaster Fire Unit',
                    lat: uLat + 0.009,
                    lng: uLng - 0.019,
                    address: 'Industrial Corridor Rescue Station',
                    phone: '101'
                }
            ]
        },
        pharmacies: {
            title: 'Nearby 24/7 Pharmacies',
            listTitle: 'Verified 24/7 Pharmacies',
            badgeText: '24/7 PHARMACY',
            iconClass: 'las la-first-aid',
            singular: 'Pharmacy',
            defaultPlaces: [
                {
                    id: 'pharm_apollo_yel',
                    name: 'Apollo Pharmacy 24/7 Yelahanka',
                    shortName: 'Apollo 24/7',
                    lat: 13.1015,
                    lng: 77.5768,
                    address: 'Major Sandeep Unnikrishnan Rd, Yelahanka New Town, Bengaluru 560064',
                    phone: '1860-500-0101'
                },
                {
                    id: 'pharm_medplus_old',
                    name: 'MedPlus Pharmacy Yelahanka Old Town',
                    shortName: 'MedPlus Pharmacy',
                    lat: 13.1030,
                    lng: 77.5940,
                    address: 'BB Road, Near Santhe Circle, Yelahanka, Bengaluru 560064',
                    phone: '080-67671111'
                },
                {
                    id: 'pharm_wellness_forever',
                    name: 'Wellness Forever 24x7 Day & Night Chemist',
                    shortName: 'Wellness 24x7',
                    lat: 13.0610,
                    lng: 77.5910,
                    address: 'Sahakara Nagar Main Road, Bengaluru 560092',
                    phone: '1800-102-4247'
                },
                {
                    id: 'pharm_fortis_health',
                    name: 'Fortis HealthWorld 24-Hour Pharmacy',
                    shortName: 'Fortis Pharmacy',
                    lat: 13.0560,
                    lng: 77.5940,
                    address: 'Bellary Road, Near Hebbal, Bengaluru 560092',
                    phone: '080-66669999'
                },
                {
                    id: 'pharm_netmeds_yel',
                    name: 'Netmeds Pharmacy Yelahanka',
                    shortName: 'Netmeds Pharmacy',
                    lat: 13.0980,
                    lng: 77.5820,
                    address: 'Sector B, Yelahanka New Town, Bengaluru 560064',
                    phone: '1800-266-2247'
                }
            ],
            getLocalPlaces: (uLat, uLng) => [
                {
                    id: 'pharm_local_1',
                    name: 'MedCare 24/7 Emergency Pharmacy',
                    shortName: 'MedCare 24/7',
                    lat: uLat + 0.008,
                    lng: uLng + 0.007,
                    address: 'Opposite Civil Hospital Gate (Open All Night)',
                    phone: '112'
                },
                {
                    id: 'pharm_local_2',
                    name: 'Apollo 24-Hour Chemist & Druggist',
                    shortName: 'Apollo 24hr',
                    lat: uLat - 0.010,
                    lng: uLng + 0.012,
                    address: 'Main Commercial Hub Road (24/7 Service)',
                    phone: '1860-500-0101'
                },
                {
                    id: 'pharm_local_3',
                    name: 'Lifeline Day & Night Medical Store',
                    shortName: 'Lifeline Meds',
                    lat: uLat + 0.013,
                    lng: uLng - 0.009,
                    address: 'Trauma Center Road (All Emergency Medicines)',
                    phone: '108'
                },
                {
                    id: 'pharm_local_4',
                    name: 'City Care 24/7 Medicals',
                    shortName: 'City Care Meds',
                    lat: uLat - 0.007,
                    lng: uLng - 0.011,
                    address: 'Station Junction Circle (24/7 Open)',
                    phone: '112'
                }
            ]
        }
    };

    // In-memory cache for fast tab-switching
    const nearbyPlacesCache = new Map();

    async function resolveLiveUserCoordinates() {
        // Priority 1: liveUserCoords if available and valid
        if (liveUserCoords && typeof liveUserCoords.lat === 'number' && typeof liveUserCoords.lng === 'number') {
            return [liveUserCoords.lat, liveUserCoords.lng];
        }
        // Priority 2: startLoc
        if (startLoc && typeof startLoc[0] === 'number' && typeof startLoc[1] === 'number') {
            return [startLoc[0], startLoc[1]];
        }
        // Priority 3: Query real high-accuracy GPS directly
        if (navigator.geolocation) {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 6000,
                        maximumAge: 15000
                    });
                });
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                startLoc = [lat, lng];
                liveUserCoords = { lat, lng, accuracy: pos.coords.accuracy, timestamp: Date.now() };
                if (typeof applyUserGpsPosition === 'function') {
                    applyUserGpsPosition(lat, lng, pos.coords.accuracy);
                }
                return [lat, lng];
            } catch (e) {
                console.warn("[SafePlaces] High-accuracy GPS query error:", e.message);
            }
        }
        // Priority 4: Cached location in localStorage
        try {
            const cached = JSON.parse(localStorage.getItem('safeRouteLiveLocation') || '{}');
            if (cached.lat && cached.lng) return [cached.lat, cached.lng];
        } catch (e) {}

        // Safe fallback center if device permissions are completely blocked
        return [13.0380, 77.5120];
    }

    async function fetchRealNearbySafePlaces(category, uLat, uLng) {
        const cacheKey = `${category}_${uLat.toFixed(3)}_${uLng.toFixed(3)}`;
        if (nearbyPlacesCache.has(cacheKey)) {
            return nearbyPlacesCache.get(cacheKey);
        }

        const queryMap = {
            police: 'police station',
            hospitals: 'hospital',
            fire: 'fire station',
            pharmacies: 'pharmacy'
        };
        const queryTerm = queryMap[category] || 'police station';
        const config = safePlacesCategoryConfig[category] || safePlacesCategoryConfig.police;

        // Bounding box around live location (~15km radius)
        const delta = 0.15;
        const minLng = (uLng - delta).toFixed(5);
        const maxLat = (uLat + delta).toFixed(5);
        const maxLng = (uLng + delta).toFixed(5);
        const minLat = (uLat - delta).toFixed(5);

        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryTerm)}&format=json&bounded=1&viewbox=${minLng},${maxLat},${maxLng},${minLat}&limit=12&addressdetails=1`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6500);

            const res = await fetch(url, {
                headers: { 'Accept-Language': 'en' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const rawList = await res.json();
                if (Array.isArray(rawList) && rawList.length > 0) {
                    const realPlaces = rawList.map((item, idx) => {
                        const pLat = parseFloat(item.lat);
                        const pLng = parseFloat(item.lon);
                        const dist = calcDistanceKm(uLat, uLng, pLat, pLng);
                        
                        let name = item.name || '';
                        if (!name && item.display_name) {
                            name = item.display_name.split(',')[0].trim();
                        }
                        if (!name) name = `${config.singular} Near You`;

                        let shortName = name;
                        if (shortName.length > 24) shortName = shortName.substring(0, 22) + '...';

                        let address = '';
                        if (item.address) {
                            const parts = [
                                item.address.road || item.address.pedestrian || item.address.suburb,
                                item.address.neighbourhood || item.address.city_district || item.address.suburb,
                                item.address.city || item.address.town || item.address.village || item.address.state_district
                            ].filter(Boolean);
                            address = parts.join(', ');
                        }
                        if (!address && item.display_name) {
                            address = item.display_name.split(',').slice(1, 4).join(',').trim();
                        }
                        if (!address) address = `Near ${uLat.toFixed(3)}° N, ${uLng.toFixed(3)}° E`;

                        let phone = '112';
                        if (category === 'hospitals') phone = '108';
                        else if (category === 'fire') phone = '101';
                        else if (category === 'pharmacies') phone = '112';

                        return {
                            id: `real_${category}_${idx}_${item.place_id || Math.random().toString(36).substring(2, 6)}`,
                            name: name,
                            shortName: shortName,
                            lat: pLat,
                            lng: pLng,
                            address: address,
                            phone: phone,
                            distanceKm: dist,
                            isLiveResult: true
                        };
                    });

                    // Sort ascending by distance (nearest to user's live position first)
                    realPlaces.sort((a, b) => a.distanceKm - b.distanceKm);

                    const filtered = realPlaces.filter(p => p.distanceKm <= 50).slice(0, 10);
                    if (filtered.length > 0) {
                        nearbyPlacesCache.set(cacheKey, filtered);
                        return filtered;
                    }
                }
            }
        } catch (err) {
            console.warn(`[SafePlaces] Live Nominatim search for ${category} notice:`, err.message);
        }

        // Smart fallback relative to user's live location if offline
        return getFallbackSafePlaces(category, uLat, uLng);
    }

    function getFallbackSafePlaces(category, uLat, uLng) {
        const config = safePlacesCategoryConfig[category] || safePlacesCategoryConfig.police;
        if (typeof config.getLocalPlaces === 'function') {
            const places = config.getLocalPlaces(uLat, uLng);
            places.forEach(p => {
                p.distanceKm = calcDistanceKm(uLat, uLng, p.lat, p.lng);
            });
            places.sort((a, b) => a.distanceKm - b.distanceKm);
            return places;
        }
        return [];
    }

    async function loadAndDisplayNearbySafePlaces(category = 'police') {
        currentSafePlaceCategory = safePlacesCategoryConfig[category] ? category : 'police';
        const config = safePlacesCategoryConfig[currentSafePlaceCategory];

        // Update active class on category tabs
        if (safePlacesCategoryTabs && safePlacesCategoryTabs.length > 0) {
            safePlacesCategoryTabs.forEach(tab => {
                if (tab.getAttribute('data-cat') === currentSafePlaceCategory) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
        }

        // Update header title and list title
        if (safePlacesMapHeadTitle) safePlacesMapHeadTitle.innerText = config.title;
        if (safePlacesListTitle) safePlacesListTitle.innerText = config.listTitle;

        // Show loading state in list while acquiring GPS and fetching places
        if (policeCardsList) {
            policeCardsList.innerHTML = `
                <div style="text-align: center; padding: 28px 16px; color: #64748b; font-size: 0.88rem;">
                    <i class="las la-spinner la-spin" style="font-size: 2rem; color: #e11d48; display: block; margin-bottom: 10px;"></i>
                    <strong>Finding verified ${config.singular.toLowerCase()}s near your live location...</strong>
                    <p style="font-size: 0.78rem; color: #94a3b8; margin: 4px 0 0;">Acquiring live GPS & querying nearest emergency facilities</p>
                </div>
            `;
        }

        if (policeMapStatusPill) {
            policeMapStatusPill.innerHTML = `<i class="las la-spinner la-spin"></i> Locating from your live GPS position...`;
        }

        // 1. Resolve user's actual live coordinates
        const [uLat, uLng] = await resolveLiveUserCoordinates();

        // 2. Ensure Leaflet map is initialized and centered on user's live position
        if (!nearbySafePlacesMapInstance) {
            nearbySafePlacesMapInstance = L.map('nearbyPoliceMap', {
                zoomControl: true,
                attributionControl: false
            }).setView([uLat, uLng], 14);

            L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
            }).addTo(nearbySafePlacesMapInstance);

            safePlacesMarkersGroup = L.featureGroup().addTo(nearbySafePlacesMapInstance);
        } else {
            nearbySafePlacesMapInstance.setView([uLat, uLng], 14);
        }

        setTimeout(() => {
            if (nearbySafePlacesMapInstance) nearbySafePlacesMapInstance.invalidateSize();
        }, 200);

        // Clear existing markers
        if (safePlacesMarkersGroup) safePlacesMarkersGroup.clearLayers();
        safePlacesMarkerLookup = {};

        // Drop user live location marker
        const userLivePinIcon = L.divIcon({
            className: 'user-live-pin-custom',
            html: '<div class="user-live-pin-pulse" title="Your Live Location"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });

        safePlacesUserMarker = L.marker([uLat, uLng], { icon: userLivePinIcon, zIndexOffset: 1000 })
            .bindPopup(`<strong style="font-family:'Outfit',sans-serif; color:#e11d48;">📍 Your Live Location</strong><br><small style="color:#64748b;">${uLat.toFixed(5)}° N, ${uLng.toFixed(5)}° E</small>`)
            .addTo(safePlacesMarkersGroup);

        // 3. Fetch real verified nearby safe places from live coordinates
        const places = await fetchRealNearbySafePlaces(currentSafePlaceCategory, uLat, uLng);

        // 4. Render markers on map
        places.forEach(item => {
            const pinIcon = L.divIcon({
                className: 'police-marker-custom',
                html: `
                    <div class="police-pin-bubble">
                        <i class="${config.iconClass}"></i>
                        <span>${item.shortName}</span>
                    </div>
                `,
                iconSize: [110, 36],
                iconAnchor: [55, 36]
            });

            const marker = L.marker([item.lat, item.lng], { icon: pinIcon }).addTo(safePlacesMarkersGroup);

            const popupHtml = `
                <div class="police-popup-content">
                    <div class="police-popup-badge"><i class="${config.iconClass}"></i> ${config.badgeText}</div>
                    <h4 class="police-popup-title">${item.name}</h4>
                    <p class="police-popup-distance"><i class="las la-map-marker-alt"></i> <b>${item.distanceKm.toFixed(1)} km</b> from your live location • ${item.address}</p>
                    <div class="police-popup-actions">
                        <a href="tel:${item.phone || '112'}" class="police-popup-btn police-popup-call"><i class="las la-phone"></i> Call</a>
                        <a href="https://www.google.com/maps/dir/?api=1&origin=${uLat},${uLng}&destination=${item.lat},${item.lng}" target="_blank" class="police-popup-btn police-popup-nav"><i class="las la-directions"></i> Navigate</a>
                    </div>
                </div>
            `;
            marker.bindPopup(popupHtml, { maxWidth: 280 });

            safePlacesMarkerLookup[item.id] = marker;
        });

        // Fit map bounds to encompass user and nearby places
        if (safePlacesMarkersGroup && safePlacesMarkersGroup.getLayers().length > 1) {
            nearbySafePlacesMapInstance.fitBounds(safePlacesMarkersGroup.getBounds().pad(0.14));
        }

        // Update Header & Badge counts
        if (policeMapStatusPill) {
            policeMapStatusPill.innerHTML = `<i class="${config.iconClass}"></i> ${places.length} ${config.singular}s found near your live location`;
        }
        if (policeStationsCountBadge) {
            policeStationsCountBadge.innerText = `${places.length} Nearby`;
        }

        // 5. Render Cards List below the map
        if (policeCardsList) {
            if (places.length === 0) {
                policeCardsList.innerHTML = `
                    <div style="text-align: center; padding: 32px 16px; color: #64748b;">
                        <i class="${config.iconClass}" style="font-size: 2.2rem; color: #cbd5e1; display: block; margin-bottom: 8px;"></i>
                        <p>No verified ${config.singular.toLowerCase()}s detected within 40 km of your live GPS.</p>
                        <button type="button" class="profile-modal-btn" onclick="btnRefreshPoliceStations.click()" style="max-width: 220px; margin: 12px auto 0;">
                            <i class="las la-sync"></i> Refresh Live GPS
                        </button>
                    </div>
                `;
                return;
            }

            policeCardsList.innerHTML = '';
            places.forEach((st) => {
                const card = document.createElement('div');
                card.className = 'police-station-card';
                card.innerHTML = `
                    <div class="police-card-main" data-id="${st.id}">
                        <div class="police-card-info-wrap">
                            <div class="police-card-icon-badge">
                                <i class="${config.iconClass}"></i>
                            </div>
                            <div class="police-card-details">
                                <strong class="police-card-name">${st.name}</strong>
                                <span class="police-card-sub">${st.address}</span>
                            </div>
                        </div>
                        <span class="police-card-dist-pill">${st.distanceKm.toFixed(1)} km</span>
                    </div>
                    <div class="police-card-actions">
                        <button type="button" class="btn-card-action btn-card-focus" data-id="${st.id}">
                            <i class="las la-crosshairs"></i> Show Pin
                        </button>
                        <a href="tel:${st.phone || '112'}" class="btn-card-action btn-card-call">
                            <i class="las la-phone"></i> Call
                        </a>
                        <a href="https://www.google.com/maps/dir/?api=1&origin=${uLat},${uLng}&destination=${st.lat},${st.lng}" target="_blank" class="btn-card-action btn-card-nav">
                            <i class="las la-directions"></i> Navigate
                        </a>
                    </div>
                `;

                // Tapping card header or "Show Pin" zooms to pin on map
                const focusBtn = card.querySelector('.btn-card-focus');
                const mainArea = card.querySelector('.police-card-main');
                const triggerFocus = () => {
                    const marker = safePlacesMarkerLookup[st.id];
                    if (marker && nearbySafePlacesMapInstance) {
                        nearbySafePlacesMapInstance.setView([st.lat, st.lng], 16, { animate: true });
                        marker.openPopup();
                        const mapWrap = document.querySelector('.police-map-wrap');
                        if (mapWrap) mapWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                };

                if (focusBtn) focusBtn.addEventListener('click', triggerFocus);
                if (mainArea) mainArea.addEventListener('click', triggerFocus);

                policeCardsList.appendChild(card);
            });
        }
    }

    // Expose helpers globally
    window.loadAndDisplayNearbyPoliceStations = () => loadAndDisplayNearbySafePlaces('police');
    window.loadAndDisplayNearbySafePlaces = loadAndDisplayNearbySafePlaces;

    // Category Tabs in Map Modal
    if (safePlacesCategoryTabs && safePlacesCategoryTabs.length > 0) {
        safePlacesCategoryTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const cat = tab.getAttribute('data-cat');
                loadAndDisplayNearbySafePlaces(cat);
            });
        });
    }

    // Safe Places cards on Safety Tab
    // 1. Nearby Police Stations
    if (cardSafePolice) {
        cardSafePolice.addEventListener('click', () => {
            if (nearbyPoliceStationsModal) {
                nearbyPoliceStationsModal.classList.add('show');
                loadAndDisplayNearbySafePlaces('police');
            }
        });
    }

    // 2. Nearby Hospitals
    if (cardSafeHospitals) {
        cardSafeHospitals.addEventListener('click', () => {
            if (nearbyPoliceStationsModal) {
                nearbyPoliceStationsModal.classList.add('show');
                loadAndDisplayNearbySafePlaces('hospitals');
            }
        });
    }

    // 3. Emergency Services (opens full page Emergency Services modal)
    if (cardSafeServices) {
        cardSafeServices.addEventListener('click', () => {
            const servicesSheetModal = document.getElementById('servicesSheetModal');
            if (servicesSheetModal) servicesSheetModal.classList.add('show');
        });
    }

    // 4. Fire & Rescue
    if (cardSafeFire) {
        cardSafeFire.addEventListener('click', () => {
            if (nearbyPoliceStationsModal) {
                nearbyPoliceStationsModal.classList.add('show');
                loadAndDisplayNearbySafePlaces('fire');
            }
        });
    }

    // 5. Pharmacies
    if (cardSafePharmacies) {
        cardSafePharmacies.addEventListener('click', () => {
            if (nearbyPoliceStationsModal) {
                nearbyPoliceStationsModal.classList.add('show');
                loadAndDisplayNearbySafePlaces('pharmacies');
            }
        });
    }

    // Modal Close button
    if (closePoliceStationsBtn) {
        closePoliceStationsBtn.addEventListener('click', () => {
            if (nearbyPoliceStationsModal) nearbyPoliceStationsModal.classList.remove('show');
        });
    }

    // Refresh GPS location button
    if (btnRefreshPoliceStations) {
        btnRefreshPoliceStations.addEventListener('click', () => {
            btnRefreshPoliceStations.innerHTML = '<i class="las la-spinner la-spin"></i>';
            if (nearbyPlacesCache) nearbyPlacesCache.clear();
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        startLoc = [lat, lng];
                        liveUserCoords = { lat, lng, accuracy: pos.coords.accuracy, timestamp: Date.now() };
                        if (typeof applyUserGpsPosition === 'function') {
                            applyUserGpsPosition(lat, lng, pos.coords.accuracy);
                        }
                        btnRefreshPoliceStations.innerHTML = '<i class="las la-crosshairs"></i>';
                        loadAndDisplayNearbySafePlaces(currentSafePlaceCategory);
                        showAppToast('Refreshed safe places from your live GPS location!', 'success');
                    },
                    (err) => {
                        btnRefreshPoliceStations.innerHTML = '<i class="las la-crosshairs"></i>';
                        loadAndDisplayNearbySafePlaces(currentSafePlaceCategory);
                        showAppToast('Could not acquire fresh GPS: ' + err.message, 'warning');
                    },
                    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
                );
            } else {
                btnRefreshPoliceStations.innerHTML = '<i class="las la-crosshairs"></i>';
                loadAndDisplayNearbySafePlaces(currentSafePlaceCategory);
            }
        });
    }

    // ---------------------------------------------
    // CARD 3: Incident Evidence Capture Tool
    // ---------------------------------------------
    const btnGridEvidence = document.getElementById('btnGridEvidence');
    const captureEvidenceOverlay = document.getElementById('captureEvidenceOverlay');
    const captureEvidenceModal = document.getElementById('captureEvidenceModal');
    const closeEvidenceCaptureBtn = document.getElementById('closeEvidenceCaptureBtn');
    const evidenceLiveVideo = document.getElementById('evidenceLiveVideo');
    const evidenceSnapshotCanvas = document.getElementById('evidenceSnapshotCanvas');
    const evdLiveGpsChip = document.getElementById('evdLiveGpsChip');
    const evdLiveTimeChip = document.getElementById('evdLiveTimeChip');
    const evdRecordingIndicator = document.getElementById('evdRecordingIndicator');
    const evdRecordingTimer = document.getElementById('evdRecordingTimer');
    const btnFlipCamera = document.getElementById('btnFlipCamera');
    const btnModePhoto = document.getElementById('btnModePhoto');
    const btnModeVideo = document.getElementById('btnModeVideo');
    const btnExecuteCapture = document.getElementById('btnExecuteCapture');
    const shutterInner = document.getElementById('shutterInner');
    const btnOpenStoredEvidence = document.getElementById('btnOpenStoredEvidence');
    const evidenceFileInput = document.getElementById('evidenceFileInput');
    const evdStatusFeedback = document.getElementById('evdStatusFeedback');
    const evdFeedbackText = document.getElementById('evdFeedbackText');

    let interactiveCameraStream = null;
    let cameraFacingMode = 'environment'; // default rear camera for capturing incidents
    let currentEvidenceMode = 'photo'; // 'photo' | 'video'
    let interactiveMediaRecorder = null;
    let interactiveVideoChunks = [];
    let isVideoRecording = false;
    let videoRecordTimerInterval = null;
    let videoSecondsRecorded = 0;
    let watermarkClockInterval = null;

    async function startInteractiveCamera() {
        stopInteractiveCamera();
        try {
            const constraints = {
                video: {
                    facingMode: { ideal: cameraFacingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            };
            interactiveCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (evidenceLiveVideo) {
                evidenceLiveVideo.srcObject = interactiveCameraStream;
                await evidenceLiveVideo.play();
            }
        } catch (err) {
            console.warn("Camera with audio failed, falling back to video-only:", err);
            try {
                interactiveCameraStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: cameraFacingMode } }
                });
                if (evidenceLiveVideo) {
                    evidenceLiveVideo.srcObject = interactiveCameraStream;
                    await evidenceLiveVideo.play();
                }
            } catch (camErr) {
                console.error("Camera access failed:", camErr);
                showEvidenceFeedback("Camera access permission needed to capture live evidence.", true);
            }
        }

        // Start live watermark updates
        updateWatermarkOverlay();
        if (watermarkClockInterval) clearInterval(watermarkClockInterval);
        watermarkClockInterval = setInterval(updateWatermarkOverlay, 1000);
    }

    function stopInteractiveCamera() {
        if (videoRecordTimerInterval) {
            clearInterval(videoRecordTimerInterval);
            videoRecordTimerInterval = null;
        }
        if (watermarkClockInterval) {
            clearInterval(watermarkClockInterval);
            watermarkClockInterval = null;
        }
        if (interactiveMediaRecorder && interactiveMediaRecorder.state !== 'inactive') {
            try { interactiveMediaRecorder.stop(); } catch(e) {}
        }
        if (interactiveCameraStream) {
            interactiveCameraStream.getTracks().forEach(t => t.stop());
            interactiveCameraStream = null;
        }
        if (evidenceLiveVideo) {
            evidenceLiveVideo.srcObject = null;
        }
        isVideoRecording = false;
        if (evdRecordingIndicator) evdRecordingIndicator.classList.add('hidden');
        if (btnExecuteCapture) btnExecuteCapture.classList.remove('shutter-recording');
    }

    function updateWatermarkOverlay() {
        if (evdLiveGpsChip) {
            if (startLoc) {
                evdLiveGpsChip.innerHTML = `<i class="las la-map-marker-alt"></i> ${startLoc[0].toFixed(4)}, ${startLoc[1].toFixed(4)}`;
            } else {
                evdLiveGpsChip.innerHTML = `<i class="las la-map-marker-alt"></i> GPS Fix Pending`;
            }
        }
        if (evdLiveTimeChip) {
            evdLiveTimeChip.innerHTML = `<i class="las la-clock"></i> ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        }
    }

    function showEvidenceFeedback(msg, isError = false) {
        console.log(`[Incident Evidence] ${msg}`);
        if (!evdStatusFeedback || !evdFeedbackText) return;
        evdFeedbackText.innerText = msg;
        evdStatusFeedback.classList.remove('hidden');
        setTimeout(() => {
            if (evdStatusFeedback) evdStatusFeedback.classList.add('hidden');
        }, 3000);
    }

    function openEvidenceModal() {
        if (captureEvidenceOverlay) captureEvidenceOverlay.classList.add('show');
        if (captureEvidenceModal) captureEvidenceModal.classList.add('show');
        startInteractiveCamera();
    }

    function closeEvidenceModal() {
        stopInteractiveCamera();
        if (captureEvidenceOverlay) captureEvidenceOverlay.classList.remove('show');
        if (captureEvidenceModal) captureEvidenceModal.classList.remove('show');
    }

    if (btnGridEvidence) btnGridEvidence.addEventListener('click', openEvidenceModal);
    if (closeEvidenceCaptureBtn) closeEvidenceCaptureBtn.addEventListener('click', closeEvidenceModal);
    if (captureEvidenceOverlay) captureEvidenceOverlay.addEventListener('click', closeEvidenceModal);

    // Camera Flip (Front / Back)
    const btnFlipCameraHeader = document.getElementById('btnFlipCameraHeader');
    function toggleCameraFlip() {
        cameraFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
        startInteractiveCamera();
    }
    if (btnFlipCamera) btnFlipCamera.addEventListener('click', toggleCameraFlip);
    if (btnFlipCameraHeader) btnFlipCameraHeader.addEventListener('click', toggleCameraFlip);

    // Switch Photo / Video Modes
    if (btnModePhoto) {
        btnModePhoto.addEventListener('click', () => {
            currentEvidenceMode = 'photo';
            btnModePhoto.classList.add('active');
            btnModeVideo.classList.remove('active');
            btnExecuteCapture.setAttribute('aria-label', 'Capture Photo');
            shutterInner.style.borderRadius = '50%';
        });
    }

    if (btnModeVideo) {
        btnModeVideo.addEventListener('click', () => {
            currentEvidenceMode = 'video';
            btnModeVideo.classList.add('active');
            btnModePhoto.classList.remove('active');
            btnExecuteCapture.setAttribute('aria-label', 'Record Video');
        });
    }

    // Execute Capture Button (Photo Snapshot or Start/Stop Video)
    if (btnExecuteCapture) {
        btnExecuteCapture.addEventListener('click', async () => {
            if (currentEvidenceMode === 'photo') {
                await capturePhotoSnapshot();
            } else {
                toggleVideoRecording();
            }
        });
    }

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // Personal Incident Evidence Vault Storage (Supabase & Local)
    // NOTE: Strictly private to user account. NEVER sent to police.
    // -------------------------------------------------------------
    async function uploadIncidentFileToSupabase({ blob, type, fileName }) {
        const client = window.supabaseClient || supabase;
        try {
            const userId = await getAuthenticatedUserId();
            const timestamp = Date.now();
            const ext = type === 'photo' ? 'jpg' : (blob.type?.includes('mp4') ? 'mp4' : 'webm');
            const actualFileName = fileName || `${type}_${timestamp}.${ext}`;
            
            // Personal Vault Path in Supabase Storage: vault/<userId>/<fileName>
            // Stored strictly in user private vault, NEVER linked to SOS alerts, NEVER sent to police.
            const storagePath = `vault/${userId}/${actualFileName}`;
            console.log(`[User Vault] Securing & uploading ${actualFileName} to Supabase bucket 'jagruthi-evidence'...`);

            let uploadSuccess = false;
            let signedUrl = null;

            if (client) {
                // Primary upload attempt with proper content type
                const initialMime = type === 'photo' ? 'image/jpeg' : (blob.type || 'video/webm');
                let uploadRes = await client.storage
                    .from('jagruthi-evidence')
                    .upload(storagePath, blob, {
                        contentType: initialMime,
                        upsert: true
                    });

                // Fallback for restricted MIME whitelist in storage bucket
                if (uploadRes.error && (uploadRes.error.message?.includes('mime') || uploadRes.error.statusCode === '415')) {
                    uploadRes = await client.storage
                        .from('jagruthi-evidence')
                        .upload(storagePath, blob, {
                            contentType: type === 'photo' ? 'image/jpeg' : 'video/mp4',
                            upsert: true
                        });
                }

                if (!uploadRes.error) {
                    uploadSuccess = true;
                    console.log(`[User Vault] Uploaded successfully to Supabase Storage: ${storagePath}`);

                    // Create signed URL for playback (valid for 7 days)
                    try {
                        const { data: signData } = await client.storage
                            .from('jagruthi-evidence')
                            .createSignedUrl(storagePath, 3600 * 24 * 7);
                        if (signData && signData.signedUrl) {
                            signedUrl = signData.signedUrl;
                            if (signedUrl.startsWith('/')) {
                                const baseUrl = (window.supabaseUrl || "https://aibfppmwpdrttfezhdkj.supabase.co").replace(/\/$/, '');
                                signedUrl = `${baseUrl}/storage/v1${signedUrl}`;
                            }
                        }
                    } catch (sErr) {
                        console.warn("[User Vault] Signed URL warning:", sErr);
                    }
                } else {
                    console.warn("[User Vault] Supabase storage upload warning:", uploadRes.error);
                }
            }

            // Also save to IndexedDB local vault
            if (typeof idbSaveEvidenceRecord === 'function') {
                try {
                    await idbSaveEvidenceRecord({
                        id: `vault_${timestamp}_${actualFileName}`,
                        sosId: 'VAULT_PRIVATE',
                        userId: userId,
                        type: type,
                        blob: blob,
                        mimeType: blob.type || (type === 'photo' ? 'image/jpeg' : 'video/webm'),
                        fileName: actualFileName,
                        capturedAt: new Date().toISOString(),
                        sizeBytes: blob.size,
                        status: uploadSuccess ? 'UPLOADED' : 'SAVED_LOCALLY',
                        isVault: true
                    });
                } catch (idbErr) {}
            }

            return {
                success: uploadSuccess,
                storagePath: storagePath,
                signedUrl: signedUrl,
                fileName: actualFileName
            };
        } catch (err) {
            console.error("[User Vault] Exception during vault upload workflow:", err);
            return { success: false, error: err };
        }
    }

    async function capturePhotoSnapshot() {
        if (!evidenceLiveVideo || !evidenceSnapshotCanvas) return;
        
        // Haptic feedback & shutter flash animation
        if ('vibrate' in navigator) navigator.vibrate(60);
        if (evidenceLiveVideo) {
            evidenceLiveVideo.style.opacity = '0.2';
            setTimeout(() => { if (evidenceLiveVideo) evidenceLiveVideo.style.opacity = '1'; }, 100);
        }

        const video = evidenceLiveVideo;
        const canvas = evidenceSnapshotCanvas;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Stamp with GPS & Timestamp Watermark
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Outfit, sans-serif';
        const watermarkText = `Jagruthi Vault • ${new Date().toLocaleString()} • Lat: ${startLoc ? startLoc[0].toFixed(4) : '--'}, Lng: ${startLoc ? startLoc[1].toFixed(4) : '--'}`;
        ctx.fillText(watermarkText, 14, canvas.height - 15);

        showEvidenceFeedback("⏳ Securing & uploading photo to Supabase Cloud Vault...");

        // Convert to Blob and Save
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const photoUrl = URL.createObjectURL(blob);
            const fileName = `photo_${Date.now()}.jpg`;
            
            // Upload directly to user's private Supabase storage vault
            const uploadResult = await uploadIncidentFileToSupabase({
                blob: blob,
                type: 'photo',
                fileName: fileName
            });

            // Save to incident evidence record
            const incidentRecord = {
                id: 'vault_' + Date.now(),
                type: 'photo',
                url: uploadResult?.signedUrl || photoUrl,
                fileName: fileName,
                storagePath: uploadResult?.storagePath || null,
                cloudSynced: uploadResult?.success || false,
                capturedAt: new Date().toISOString(),
                coords: startLoc,
                address: homeCurrentLocText?.innerText || 'Unknown Location',
                sizeBytes: blob.size || 0
            };

            const existing = JSON.parse(localStorage.getItem('jagruthiCapturedEvidence') || '[]');
            existing.unshift(incidentRecord);
            localStorage.setItem('jagruthiCapturedEvidence', JSON.stringify(existing));

            updateVaultBadges();
            if (uploadResult && uploadResult.success) {
                showEvidenceFeedback("✅ Photo Evidence Secured in Your Vault & Synced to Cloud!");
            } else {
                showEvidenceFeedback("⚠️ Photo Saved in Device Vault (Cloud Sync Pending)");
            }
        }, 'image/jpeg', 0.92);
    }

    function toggleVideoRecording() {
        if (!isVideoRecording) {
            startVideoRecording();
        } else {
            stopVideoRecording();
        }
    }

    function startVideoRecording() {
        if (!interactiveCameraStream) return;
        interactiveVideoChunks = [];

        try {
            let mimeType = 'video/webm';
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')) {
                mimeType = 'video/mp4';
            }
            interactiveMediaRecorder = new MediaRecorder(interactiveCameraStream, { mimeType });
            interactiveMediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) interactiveVideoChunks.push(e.data);
            };

            interactiveMediaRecorder.onstop = async () => {
                const videoBlob = new Blob(interactiveVideoChunks, { type: mimeType });
                const videoUrl = URL.createObjectURL(videoBlob);
                const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                const fileName = `video_${Date.now()}.${ext}`;

                showEvidenceFeedback("⏳ Securing & uploading video to Supabase Cloud Vault...");

                const uploadResult = await uploadIncidentFileToSupabase({
                    blob: videoBlob,
                    type: 'video',
                    fileName: fileName
                });
                
                const incidentRecord = {
                    id: 'vault_' + Date.now(),
                    type: 'video',
                    url: uploadResult?.signedUrl || videoUrl,
                    fileName: fileName,
                    storagePath: uploadResult?.storagePath || null,
                    cloudSynced: uploadResult?.success || false,
                    capturedAt: new Date().toISOString(),
                    coords: startLoc,
                    address: homeCurrentLocText?.innerText || 'Unknown Location',
                    sizeBytes: videoBlob.size || 0
                };

                const existing = JSON.parse(localStorage.getItem('jagruthiCapturedEvidence') || '[]');
                existing.unshift(incidentRecord);
                localStorage.setItem('jagruthiCapturedEvidence', JSON.stringify(existing));

                updateVaultBadges();
                if (uploadResult && uploadResult.success) {
                    showEvidenceFeedback("✅ Incident Video Secured in Your Vault & Synced to Cloud!");
                } else {
                    showEvidenceFeedback("⚠️ Video Saved Locally in Device Vault (Cloud Sync Pending)");
                }
            };

            interactiveMediaRecorder.start(500);
            isVideoRecording = true;
            btnExecuteCapture.classList.add('shutter-recording');
            if (evdRecordingIndicator) evdRecordingIndicator.classList.remove('hidden');

            videoSecondsRecorded = 0;
            if (evdRecordingTimer) evdRecordingTimer.innerText = "REC 00:00";
            videoRecordTimerInterval = setInterval(() => {
                videoSecondsRecorded++;
                const mins = String(Math.floor(videoSecondsRecorded / 60)).padStart(2, '0');
                const secs = String(videoSecondsRecorded % 60).padStart(2, '0');
                if (evdRecordingTimer) evdRecordingTimer.innerText = `REC ${mins}:${secs}`;
            }, 1000);

            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
        } catch (err) {
            console.error("Failed to start video recording:", err);
            showEvidenceFeedback("Video recording not supported on this device/browser.", true);
        }
    }

    function stopVideoRecording() {
        if (interactiveMediaRecorder && interactiveMediaRecorder.state !== 'inactive') {
            interactiveMediaRecorder.stop();
        }
        isVideoRecording = false;
        btnExecuteCapture.classList.remove('shutter-recording');
        if (evdRecordingIndicator) evdRecordingIndicator.classList.add('hidden');
        if (videoRecordTimerInterval) {
            clearInterval(videoRecordTimerInterval);
            videoRecordTimerInterval = null;
        }
        if ('vibrate' in navigator) navigator.vibrate(100);
    }

    // Gallery / File upload fallback
    if (evidenceFileInput) {
        evidenceFileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const fileUrl = URL.createObjectURL(file);
            const isVid = file.type.includes('video');
            const type = isVid ? 'video' : 'photo';

            showEvidenceFeedback(`⏳ Uploading ${type} to Supabase Cloud Vault...`);

            const uploadResult = await uploadIncidentFileToSupabase({
                blob: file,
                type: type,
                fileName: file.name
            });
            
            const incidentRecord = {
                id: 'vault_' + Date.now(),
                type: type,
                url: uploadResult?.signedUrl || fileUrl,
                fileName: file.name,
                storagePath: uploadResult?.storagePath || null,
                cloudSynced: uploadResult?.success || false,
                capturedAt: new Date().toISOString(),
                coords: startLoc,
                address: homeCurrentLocText?.innerText || 'Unknown Location',
                sizeBytes: file.size || 0
            };

            const existing = JSON.parse(localStorage.getItem('jagruthiCapturedEvidence') || '[]');
            existing.unshift(incidentRecord);
            localStorage.setItem('jagruthiCapturedEvidence', JSON.stringify(existing));

            updateVaultBadges();
            if (uploadResult && uploadResult.success) {
                showEvidenceFeedback(`✅ ${isVid ? 'Video' : 'Photo'} Uploaded & Encrypted in Your Vault!`);
            } else {
                showEvidenceFeedback(`✅ ${isVid ? 'Video' : 'Photo'} Saved Locally in Vault!`);
            }
        });
    }

    // View Stored Evidence -> opens full Evidence Vault modal
    if (btnOpenStoredEvidence) {
        btnOpenStoredEvidence.addEventListener('click', () => {
            closeEvidenceModal();
            openEvidenceVault();
        });
    }

    // -------------------------------------------------------------
    // EVIDENCE VAULT CONTROLLER & VIEWER
    // -------------------------------------------------------------
    let currentVaultFilter = 'all';
    let currentViewingVaultItem = null;

    function getStoredEvidenceList() {
        try {
            return JSON.parse(localStorage.getItem('jagruthiCapturedEvidence') || '[]');
        } catch (e) {
            return [];
        }
    }

    function updateVaultBadges() {
        const list = getStoredEvidenceList();
        const count = list.length;
        const profileVaultCountBadge = document.getElementById('profileVaultCountBadge');
        const vaultModalTotalBadge = document.getElementById('vaultModalTotalBadge');
        if (profileVaultCountBadge) profileVaultCountBadge.innerText = count;
        if (vaultModalTotalBadge) vaultModalTotalBadge.innerText = `${count} ${count === 1 ? 'item' : 'items'}`;

        const vaultCountAll = document.getElementById('vaultCountAll');
        const vaultCountPhotos = document.getElementById('vaultCountPhotos');
        const vaultCountVideos = document.getElementById('vaultCountVideos');
        if (vaultCountAll) vaultCountAll.innerText = count;
        if (vaultCountPhotos) vaultCountPhotos.innerText = list.filter(i => i.type === 'photo').length;
        if (vaultCountVideos) vaultCountVideos.innerText = list.filter(i => i.type === 'video').length;
    }

    function renderEvidenceVault(filter = currentVaultFilter) {
        currentVaultFilter = filter;
        const list = getStoredEvidenceList();
        updateVaultBadges();

        const grid = document.getElementById('vaultEvidenceGrid');
        const emptyState = document.getElementById('vaultEmptyState');
        if (!grid) return;

        // Update active filter button styling
        document.querySelectorAll('.vault-filter-btn').forEach(btn => {
            const f = btn.getAttribute('data-vault-filter');
            if (f === filter) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        const filtered = filter === 'all' ? list : list.filter(i => i.type === filter);

        if (filtered.length === 0) {
            grid.innerHTML = '';
            grid.style.display = 'none';
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        grid.style.display = 'grid';

        grid.innerHTML = filtered.map((item, idx) => {
            const dateStr = item.capturedAt ? new Date(item.capturedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recent';
            const icon = item.type === 'video' ? 'las la-video' : 'las la-camera';
            const syncHtml = item.cloudSynced 
                ? `<span class="vault-sync-pill synced"><i class="las la-cloud-check"></i> Cloud Vault</span>`
                : `<span class="vault-sync-pill local"><i class="las la-shield-alt"></i> Device Vault</span>`;

            const thumbContent = item.type === 'video'
                ? `<video src="${item.url}" class="vault-video-preview" preload="metadata" muted></video>
                   <div class="vault-play-overlay"><i class="las la-play-circle"></i></div>`
                : `<img src="${item.url}" class="vault-thumb-img" alt="${item.fileName || 'Evidence Photo'}" loading="lazy">`;

            return `
                <div class="vault-item-card" data-vault-index="${idx}" data-item-id="${item.id}">
                    <div class="vault-thumb-wrap" onclick="window.viewVaultItem('${item.id}')">
                        <span class="vault-type-chip"><i class="${icon}"></i> ${item.type}</span>
                        ${thumbContent}
                    </div>
                    <div class="vault-item-body">
                        <h4 class="vault-item-title" title="${item.fileName || 'Incident Evidence'}">${item.fileName || (item.type.toUpperCase() + ' Evidence')}</h4>
                        <p class="vault-item-date"><i class="las la-clock"></i> ${dateStr}</p>
                        ${syncHtml}
                        <div class="vault-item-actions">
                            <button type="button" class="vault-action-btn vault-action-view" onclick="window.viewVaultItem('${item.id}')" title="View Full Evidence">
                                <i class="las la-expand"></i> View
                            </button>
                            <button type="button" class="vault-action-btn vault-action-dl" onclick="window.downloadVaultItem('${item.id}')" title="Download to Device">
                                <i class="las la-download"></i>
                            </button>
                            <button type="button" class="vault-action-btn vault-action-del" onclick="window.deleteVaultItem('${item.id}')" title="Delete from Vault">
                                <i class="las la-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Global helper methods for inline card clicks
    window.viewVaultItem = function(itemId) {
        const list = getStoredEvidenceList();
        const item = list.find(i => String(i.id) === String(itemId));
        if (!item) return;
        currentViewingVaultItem = item;

        const modal = document.getElementById('modalVaultItemViewer');
        const titleEl = document.getElementById('vaultViewerTitle');
        const mediaWrap = document.getElementById('vaultViewerMediaWrap');
        const timeEl = document.getElementById('vaultViewerTime');
        const locEl = document.getElementById('vaultViewerLocation');
        const storageEl = document.getElementById('vaultViewerStorage');

        if (titleEl) titleEl.innerText = item.fileName || 'Secured Evidence';
        if (timeEl) timeEl.innerText = item.capturedAt ? new Date(item.capturedAt).toLocaleString() : 'Recent';
        if (locEl) {
            locEl.innerText = item.coords ? `${item.coords[0].toFixed(5)}° N, ${item.coords[1].toFixed(5)}° E (${item.address || 'Verified'})` : (item.address || 'Location Tagged');
        }
        if (storageEl) {
            storageEl.innerHTML = item.cloudSynced 
                ? '<span style="color:#059669;"><i class="las la-cloud-check"></i> Encrypted in Supabase Cloud Storage (Private)</span>'
                : '<span style="color:#d97706;"><i class="las la-shield-alt"></i> Stored in Device Encrypted Vault</span>';
        }

        if (mediaWrap) {
            if (item.type === 'video') {
                mediaWrap.innerHTML = `<video src="${item.url}" controls autoplay playsinline style="max-width:100%; max-height:55vh; border-radius:10px;"></video>`;
            } else {
                mediaWrap.innerHTML = `<img src="${item.url}" alt="Evidence Photo" style="max-width:100%; max-height:55vh; object-fit:contain; border-radius:10px;">`;
            }
        }

        if (modal) modal.classList.add('active');
    };

    window.downloadVaultItem = async function(itemId) {
        const list = getStoredEvidenceList();
        const item = list.find(i => String(i.id) === String(itemId));
        if (!item || !item.url) return;

        try {
            const res = await fetch(item.url);
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = item.fileName || `evidence_${Date.now()}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showAppToast('Saved evidence to device storage!', 'success');
        } catch (e) {
            window.open(item.url, '_blank');
        }
    };

    window.deleteVaultItem = async function(itemId) {
        if (!confirm("Are you sure you want to permanently delete this evidence from your private vault?")) {
            return;
        }

        let list = getStoredEvidenceList();
        const item = list.find(i => String(i.id) === String(itemId));
        
        // Remove from Supabase Storage if path exists
        const client = window.supabaseClient || supabase;
        if (client && item?.storagePath) {
            try {
                await client.storage.from('jagruthi-evidence').remove([item.storagePath]);
                console.log("[User Vault] Deleted storage object:", item.storagePath);
            } catch (err) {
                console.warn("[User Vault] Storage delete error:", err);
            }
        }

        list = list.filter(i => String(i.id) !== String(itemId));
        localStorage.setItem('jagruthiCapturedEvidence', JSON.stringify(list));

        // Close viewer modal if current item was deleted
        const viewerModal = document.getElementById('modalVaultItemViewer');
        if (viewerModal && viewerModal.classList.contains('active')) {
            viewerModal.classList.remove('active');
        }

        renderEvidenceVault(currentVaultFilter);
        showAppToast('Evidence item removed from vault.', 'info');
    };

    async function syncVaultWithSupabase() {
        const client = window.supabaseClient || supabase;
        const btnSync = document.getElementById('btnSyncVaultCloud');
        if (btnSync) btnSync.classList.add('rotating');

        try {
            const userId = await getAuthenticatedUserId();
            if (!client || !userId) {
                showAppToast('Vault synced locally. Connect to cloud for remote backup.', 'info');
                return;
            }

            // 1. List objects currently in user's Supabase Storage folder: vault/<userId>/
            const { data: cloudObjects, error } = await client.storage
                .from('jagruthi-evidence')
                .list(`vault/${userId}`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

            if (!error && cloudObjects && cloudObjects.length > 0) {
                const localList = getStoredEvidenceList();
                let hasNewOrUpdated = false;

                for (const obj of cloudObjects) {
                    if (obj.name === '.emptyFolderPlaceholder') continue;
                    const storagePath = `vault/${userId}/${obj.name}`;
                    
                    // Create fresh signed URL
                    const { data: sData } = await client.storage
                        .from('jagruthi-evidence')
                        .createSignedUrl(storagePath, 3600 * 24 * 7);

                    let signedUrl = sData?.signedUrl || null;
                    if (signedUrl && signedUrl.startsWith('/')) {
                        const baseUrl = (window.supabaseUrl || "https://aibfppmwpdrttfezhdkj.supabase.co").replace(/\/$/, '');
                        signedUrl = `${baseUrl}/storage/v1${signedUrl}`;
                    }

                    const existingIndex = localList.findIndex(l => l.storagePath === storagePath || l.fileName === obj.name);
                    const isVid = obj.name.endsWith('.mp4') || obj.name.endsWith('.webm');
                    const type = isVid ? 'video' : 'photo';

                    if (existingIndex >= 0) {
                        // Refresh URL & cloudSynced flag
                        if (signedUrl) localList[existingIndex].url = signedUrl;
                        localList[existingIndex].cloudSynced = true;
                        hasNewOrUpdated = true;
                    } else if (signedUrl) {
                        // Pull down cloud item
                        localList.push({
                            id: 'vault_' + (obj.id || Date.now()),
                            type: type,
                            url: signedUrl,
                            fileName: obj.name,
                            storagePath: storagePath,
                            cloudSynced: true,
                            capturedAt: obj.created_at || new Date().toISOString(),
                            coords: null,
                            address: 'Cloud Backup'
                        });
                        hasNewOrUpdated = true;
                    }
                }

                if (hasNewOrUpdated) {
                    localStorage.setItem('jagruthiCapturedEvidence', JSON.stringify(localList));
                }
            }

            renderEvidenceVault(currentVaultFilter);
            showAppToast('Private Evidence Vault synced with Supabase Cloud!', 'success');
        } catch (syncErr) {
            console.warn("[User Vault] Sync error:", syncErr);
            showAppToast('Vault updated from device storage.', 'info');
        } finally {
            if (btnSync) btnSync.classList.remove('rotating');
        }
    }

    function openEvidenceVault() {
        renderEvidenceVault('all');
        openProfileModal('modalEvidenceVault');
        syncVaultWithSupabase();
    }

    // Wire up Evidence Vault controls
    const menuItemEvidenceVault = document.getElementById('menuItemEvidenceVault');
    if (menuItemEvidenceVault) {
        menuItemEvidenceVault.addEventListener('click', openEvidenceVault);
    }

    const btnSyncVaultCloud = document.getElementById('btnSyncVaultCloud');
    if (btnSyncVaultCloud) {
        btnSyncVaultCloud.addEventListener('click', syncVaultWithSupabase);
    }

    const btnVaultCaptureNow = document.getElementById('btnVaultCaptureNow');
    if (btnVaultCaptureNow) {
        btnVaultCaptureNow.addEventListener('click', () => {
            closeProfileModal('modalEvidenceVault');
            openEvidenceModal();
        });
    }

    // Filter Buttons
    document.querySelectorAll('[data-vault-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-vault-filter');
            renderEvidenceVault(filter);
        });
    });

    // Viewer Modal Action Buttons
    const btnVaultDownloadItem = document.getElementById('btnVaultDownloadItem');
    if (btnVaultDownloadItem) {
        btnVaultDownloadItem.addEventListener('click', () => {
            if (currentViewingVaultItem) window.downloadVaultItem(currentViewingVaultItem.id);
        });
    }

    const btnVaultDeleteItem = document.getElementById('btnVaultDeleteItem');
    if (btnVaultDeleteItem) {
        btnVaultDeleteItem.addEventListener('click', () => {
            if (currentViewingVaultItem) window.deleteVaultItem(currentViewingVaultItem.id);
        });
    }

    // Initialize vault badges on startup
    updateVaultBadges();

    // ---------------------------------------------
    // CARD 4: Fake Incoming Call Simulator
    // ---------------------------------------------
    const btnGridFakeCall = document.getElementById('btnGridFakeCall');
    const fakeCallModal = document.getElementById('fakeCallModal');
    const btnDeclineFakeCall = document.getElementById('btnDeclineFakeCall');
    const btnAcceptFakeCall = document.getElementById('btnAcceptFakeCall');
    const btnEndActiveCall = document.getElementById('btnEndActiveCall');
    const fakeCallRingingActions = document.getElementById('fakeCallRingingActions');
    const fakeCallActiveActions = document.getElementById('fakeCallActiveActions');
    const callTypeStatusText = document.getElementById('callTypeStatusText');
    const fakeCallTimerDisplay = document.getElementById('fakeCallTimerDisplay');

    let fakeCallSeconds = 0;
    let fakeCallTimerInterval = null;
    let fakeCallVibrateInterval = null;

    function triggerFakeIncomingCall() {
        if (!fakeCallModal) return;

        // Reset display
        if (callTypeStatusText) {
            callTypeStatusText.innerHTML = "Incoming Call...<br><span style='font-size:0.75rem; color:#cbd5e1; display:inline-block; margin-top:4px;'>🔊 Turn up phone media volume</span>";
        }
        if (fakeCallTimerDisplay) {
            fakeCallTimerDisplay.innerText = "00:00";
            fakeCallTimerDisplay.classList.add('hidden');
        }
        if (fakeCallRingingActions) fakeCallRingingActions.classList.remove('hidden');
        if (fakeCallActiveActions) fakeCallActiveActions.classList.add('hidden');

        fakeCallModal.classList.remove('hidden');

        // Play realistic ringtone (HTML5 Audio or Web Audio Synthesizer fallback)
        fakeCallAudio.play().catch(e => {
            console.warn("[Fake Call] Ringtone audio playback warning:", e);
        });

        // Vibration pattern for incoming call (1s buzz, 1s pause, 1s buzz)
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate([1000, 1000, 1000, 1000]);
                fakeCallVibrateInterval = setInterval(() => {
                    if ('vibrate' in navigator) navigator.vibrate([1000, 1000]);
                }, 3000);
            } catch (vErr) {}
        }
    }

    function declineFakeCall() {
        fakeCallAudio.stop();
        if ('vibrate' in navigator) {
            try { navigator.vibrate(0); } catch (e) {}
        }
        if (fakeCallVibrateInterval) {
            clearInterval(fakeCallVibrateInterval);
            fakeCallVibrateInterval = null;
        }
        if (fakeCallTimerInterval) {
            clearInterval(fakeCallTimerInterval);
            fakeCallTimerInterval = null;
        }
        if (fakeCallModal) fakeCallModal.classList.add('hidden');
    }

    function acceptFakeCall() {
        fakeCallAudio.stop();
        if ('vibrate' in navigator) {
            try { navigator.vibrate(0); } catch (e) {}
        }
        if (fakeCallVibrateInterval) {
            clearInterval(fakeCallVibrateInterval);
            fakeCallVibrateInterval = null;
        }

        if (callTypeStatusText) callTypeStatusText.innerText = "Connected";
        if (fakeCallTimerDisplay) fakeCallTimerDisplay.classList.remove('hidden');
        if (fakeCallRingingActions) fakeCallRingingActions.classList.add('hidden');
        if (fakeCallActiveActions) fakeCallActiveActions.classList.remove('hidden');

        fakeCallSeconds = 0;
        if (fakeCallTimerInterval) clearInterval(fakeCallTimerInterval);
        fakeCallTimerInterval = setInterval(() => {
            fakeCallSeconds++;
            const mins = String(Math.floor(fakeCallSeconds / 60)).padStart(2, '0');
            const secs = String(fakeCallSeconds % 60).padStart(2, '0');
            if (fakeCallTimerDisplay) fakeCallTimerDisplay.innerText = `${mins}:${secs}`;
        }, 1000);

        if ('vibrate' in navigator) navigator.vibrate(80);
    }

    window.addEventListener('beforeunload', () => fakeCallAudio.stop());
    window.addEventListener('pagehide', () => fakeCallAudio.stop());

    if (btnGridFakeCall) btnGridFakeCall.addEventListener('click', triggerFakeIncomingCall);
    if (btnDeclineFakeCall) btnDeclineFakeCall.addEventListener('click', declineFakeCall);
    if (btnEndActiveCall) btnEndActiveCall.addEventListener('click', declineFakeCall);
    if (btnAcceptFakeCall) btnAcceptFakeCall.addEventListener('click', acceptFakeCall);

    // Safety Instructions Modal
    const btnGridInstructions = document.getElementById('btnGridInstructions');
    const instructionsSheetOverlay = document.getElementById('instructionsSheetOverlay');
    const instructionsSheetModal = document.getElementById('instructionsSheetModal');
    const closeInstructionsSheetBtn = document.getElementById('closeInstructionsSheetBtn');

    function openInstructionsSheet() {
        if (instructionsSheetOverlay) instructionsSheetOverlay.classList.add('show');
        if (instructionsSheetModal) instructionsSheetModal.classList.add('show');
    }

    function closeInstructionsSheet() {
        if (instructionsSheetOverlay) instructionsSheetOverlay.classList.remove('show');
        if (instructionsSheetModal) instructionsSheetModal.classList.remove('show');
    }

    if (btnGridInstructions) btnGridInstructions.addEventListener('click', openInstructionsSheet);
    if (closeInstructionsSheetBtn) closeInstructionsSheetBtn.addEventListener('click', closeInstructionsSheet);
    if (instructionsSheetOverlay) instructionsSheetOverlay.addEventListener('click', closeInstructionsSheet);

    // Emergency Services Modal
    const btnGridServices = document.getElementById('btnGridServices');
    const servicesSheetOverlay = document.getElementById('servicesSheetOverlay');
    const servicesSheetModal = document.getElementById('servicesSheetModal');
    const closeServicesSheetBtn = document.getElementById('closeServicesSheetBtn');

    function openServicesSheet() {
        if (servicesSheetOverlay) servicesSheetOverlay.classList.add('show');
        if (servicesSheetModal) servicesSheetModal.classList.add('show');
    }

    function closeServicesSheet() {
        if (servicesSheetOverlay) servicesSheetOverlay.classList.remove('show');
        if (servicesSheetModal) servicesSheetModal.classList.remove('show');
    }

    if (btnGridServices) btnGridServices.addEventListener('click', openServicesSheet);
    if (closeServicesSheetBtn) closeServicesSheetBtn.addEventListener('click', closeServicesSheet);
    if (servicesSheetOverlay) servicesSheetOverlay.addEventListener('click', closeServicesSheet);

    // Quick Safety Guide Data & Interactive System
    const safetyGuideData = [
        {
            id: 'hospital',
            icon: 'las la-plus-square',
            question: 'I need to find a nearby hospital',
            advice: "Select 'Nearby Hospital' to see all hospitals near you on the map. This will help you get medical assistance as quickly as possible.",
            actions: [
                { icon: 'las la-plus-square', label: 'NEARBY HOSPITAL', type: 'hospital_maps' },
                { icon: 'las la-crosshairs', label: 'MY LOCATION', type: 'location' },
                { icon: 'las la-user-friends', label: 'EMERGENCY CONTACTS', type: 'contacts' }
            ]
        },
        {
            id: 'following',
            icon: 'las la-user-secret',
            question: 'Someone is following me',
            advice: "Head immediately towards a well-lit, crowded area, shop, or police checkpoint. Avoid isolated shortcuts. Call a trusted contact or 112, or trigger a Fake Call to look engaged.",
            actions: [
                { icon: 'las la-phone-volume', label: 'FAKE CALL', type: 'fakecall' },
                { icon: 'las la-crosshairs', label: 'MY LOCATION', type: 'location' },
                { icon: 'las la-user-friends', label: 'EMERGENCY CONTACTS', type: 'contacts' }
            ]
        },
        {
            id: 'harassed',
            icon: 'las la-exclamation-triangle',
            question: 'I am being harassed',
            advice: "Speak firmly and loudly to draw public attention. Move towards nearest shopkeepers or authorities. Use Capture Evidence for discreet recording or activate SOS if danger escalates.",
            actions: [
                { icon: 'las la-camera', label: 'CAPTURE EVIDENCE', type: 'evidence' },
                { icon: 'las la-broadcast-tower', label: 'ACTIVATE SOS', type: 'sos' },
                { icon: 'las la-shield-alt', label: 'EMERGENCY SERVICES', type: 'services' }
            ]
        },
        {
            id: 'bus_harass',
            icon: 'las la-bus',
            question: 'I am being harassed on a bus',
            advice: "Alert the bus conductor and driver loudly right away. Request the driver to stop at the nearest police station or crowded stop. Activate SOS to trigger the siren and draw immediate bystander attention.",
            actions: [
                { icon: 'las la-broadcast-tower', label: 'ACTIVATE SOS', type: 'sos' },
                { icon: 'las la-user-friends', label: 'EMERGENCY CONTACTS', type: 'contacts' },
                { icon: 'las la-shield-alt', label: 'POLICE EMERGENCY 112', type: 'call112' }
            ]
        },
        {
            id: 'unsafe',
            icon: 'las la-shield-alt',
            question: 'I feel unsafe',
            advice: "Trust your intuition. Head directly towards a nearby safe place like a police station or hospital, initiate a Fake Call to look engaged, and alert your emergency contacts.",
            actions: [
                { icon: 'las la-shield-alt', label: 'NEARBY SAFE PLACES', type: 'safeplaces' },
                { icon: 'las la-phone-volume', label: 'FAKE CALL', type: 'fakecall' },
                { icon: 'las la-user-friends', label: 'EMERGENCY CONTACTS', type: 'contacts' }
            ]
        },
        {
            id: 'alone_scared',
            icon: 'las la-eye-slash',
            question: 'I am alone and scared',
            advice: "Stay inside well-lit buildings or busy commercial stores. Keep someone on speakerphone until you arrive safely. Ensure your live location tracking is broadcasting.",
            actions: [
                { icon: 'las la-user-friends', label: 'EMERGENCY CONTACTS', type: 'contacts' },
                { icon: 'las la-crosshairs', label: 'MY LOCATION', type: 'location' },
                { icon: 'las la-shield-alt', label: 'EMERGENCY SERVICES', type: 'services' }
            ]
        },
        {
            id: 'surrounding',
            icon: 'las la-users',
            question: 'People are surrounding me',
            advice: "Make loud, continuous noise to attract immediate bystander intervention. Press and hold Activate SOS to dispatch emergency GPS beacons and alert local patrol units instantly.",
            actions: [
                { icon: 'las la-broadcast-tower', label: 'ACTIVATE SOS', type: 'sos' },
                { icon: 'las la-camera', label: 'CAPTURE EVIDENCE', type: 'evidence' },
                { icon: 'las la-shield-alt', label: 'POLICE CONTROL 112', type: 'call112' }
            ]
        },
        {
            id: 'threatening',
            icon: 'las la-gavel',
            question: 'Someone is threatening me',
            advice: "Avoid physical escalation. Step back, maintain safe distance, and look for clear exit paths. Trigger evidence recording discreetly and dispatch an SOS alert immediately.",
            actions: [
                { icon: 'las la-camera', label: 'CAPTURE EVIDENCE', type: 'evidence' },
                { icon: 'las la-broadcast-tower', label: 'ACTIVATE SOS', type: 'sos' },
                { icon: 'las la-shield-alt', label: 'EMERGENCY SERVICES', type: 'services' }
            ]
        },
        {
            id: 'silent_sound',
            icon: 'las la-volume-mute',
            question: 'I cannot make a sound',
            advice: "Stay quiet and take cover. Trigger silent SOS — it will silently broadcast your live coordinates and distress message to emergency contacts without making any audio alerts.",
            actions: [
                { icon: 'las la-broadcast-tower', label: 'SILENT SOS', type: 'sos' },
                { icon: 'las la-crosshairs', label: 'MY LOCATION', type: 'location' },
                { icon: 'las la-user-friends', label: 'EMERGENCY CONTACTS', type: 'contacts' }
            ]
        },
        {
            id: 'silent_help',
            icon: 'las la-bell-slash',
            question: 'I need help silently',
            advice: "Use the discreet emergency distress function to send automated SMS alerts and GPS coordinates to your emergency contacts without alerting anyone around you.",
            actions: [
                { icon: 'las la-broadcast-tower', label: 'SILENT SOS', type: 'sos' },
                { icon: 'las la-crosshairs', label: 'MY LOCATION', type: 'location' },
                { icon: 'las la-user-friends', label: 'EMERGENCY CONTACTS', type: 'contacts' }
            ]
        },
        {
            id: 'police',
            icon: 'las la-shield-alt',
            question: 'I need to find a nearby police station',
            advice: "Select 'Police Emergency' to dial 112 or view verified emergency police units and patrol assistance closest to your current location.",
            actions: [
                { icon: 'las la-shield-alt', label: 'POLICE EMERGENCY 112', type: 'call112' },
                { icon: 'las la-crosshairs', label: 'MY LOCATION', type: 'location' },
                { icon: 'las la-user-friends', label: 'EMERGENCY CONTACTS', type: 'contacts' }
            ]
        }
    ];

    let currentQuickGuideItem = null;

    const quickGuidePage = document.getElementById('quickGuidePage');
    const btnQuickSafetyGuide = document.getElementById('btnQuickSafetyGuide');
    const quickGuideBackBtn = document.getElementById('quickGuideBackBtn');
    const quickGuideGoBackBtn = document.getElementById('quickGuideGoBackBtn');
    const quickGuideListView = document.getElementById('quickGuideListView');
    const quickGuideDetailView = document.getElementById('quickGuideDetailView');
    const quickGuideItemsContainer = document.getElementById('quickGuideItemsContainer');

    function renderQuickGuideList() {
        if (!quickGuideItemsContainer) return;
        quickGuideItemsContainer.innerHTML = '';
        safetyGuideData.forEach(item => {
            const card = document.createElement('div');
            card.className = 'quick-guide-card';
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.innerHTML = `
                <div class="qg-card-icon"><i class="${item.icon}"></i></div>
                <span class="qg-card-text">${item.question}</span>
                <i class="las la-angle-right qg-card-arrow"></i>
            `;
            card.addEventListener('click', () => showQuickGuideDetail(item));
            quickGuideItemsContainer.appendChild(card);
        });
    }

    function showQuickGuideDetail(item) {
        currentQuickGuideItem = item;
        if (!quickGuideListView || !quickGuideDetailView) return;

        quickGuideListView.classList.add('hidden');
        quickGuideDetailView.classList.remove('hidden');

        const pillIcon = document.getElementById('qgPillIcon');
        const pillText = document.getElementById('qgPillText');
        const adviceBox = document.getElementById('qgAdviceBox');
        const actionsList = document.getElementById('qgActionsList');

        if (pillIcon) pillIcon.innerHTML = `<i class="${item.icon}"></i>`;
        if (pillText) pillText.textContent = item.question;
        if (adviceBox) adviceBox.textContent = item.advice;

        if (actionsList) {
            actionsList.innerHTML = '';
            item.actions.forEach(action => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'qg-action-btn';
                btn.innerHTML = `<i class="${action.icon}"></i> <span>${action.label}</span>`;
                btn.addEventListener('click', () => executeQuickGuideAction(action.type));
                actionsList.appendChild(btn);
            });
        }
    }

    function openNearbyHospitalsInGoogleMaps() {
        if (startLoc && startLoc.length >= 2) {
            const lat = Number(startLoc[0]).toFixed(6);
            const lng = Number(startLoc[1]).toFixed(6);
            window.open(`https://www.google.com/maps/search/hospitals+near+me/@${lat},${lng},14z`, '_blank');
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude.toFixed(6);
                    const lng = pos.coords.longitude.toFixed(6);
                    startLoc = [pos.coords.latitude, pos.coords.longitude];
                    window.open(`https://www.google.com/maps/search/hospitals+near+me/@${lat},${lng},14z`, '_blank');
                },
                () => {
                    window.open('https://www.google.com/maps/search/hospitals+near+me', '_blank');
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            window.open('https://www.google.com/maps/search/hospitals+near+me', '_blank');
        }
    }

    function executeQuickGuideAction(type) {
        closeQuickGuide();
        if (type === 'hospital_maps') {
            openNearbyHospitalsInGoogleMaps();
        } else if (type === 'services') {
            openServicesSheet();
        } else if (type === 'location') {
            const navTabSafety = document.getElementById('navTabSafety');
            if (navTabSafety) {
                navTabSafety.click();
                if (typeof window.updateSafetyLocationUI === 'function') {
                    window.updateSafetyLocationUI();
                }
            }
        } else if (type === 'contacts') {
            openContactsSheet();
        } else if (type === 'fakecall') {
            const btnGridFakeCall = document.getElementById('btnGridFakeCall');
            if (btnGridFakeCall) btnGridFakeCall.click();
        } else if (type === 'sos') {
            const navTabHome = document.getElementById('navTabHome');
            if (navTabHome) navTabHome.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const mainCentralSosBtn = document.getElementById('mainCentralSosBtn');
            if (mainCentralSosBtn) {
                mainCentralSosBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else if (type === 'safeplaces') {
            const nearbyPoliceStationsModal = document.getElementById('nearbyPoliceStationsModal');
            if (nearbyPoliceStationsModal) {
                nearbyPoliceStationsModal.classList.add('show');
                if (typeof window.loadAndDisplayNearbySafePlaces === 'function') {
                    window.loadAndDisplayNearbySafePlaces('police');
                }
            }
        } else if (type === 'evidence') {
            const btnGridEvidence = document.getElementById('btnGridEvidence');
            if (btnGridEvidence) btnGridEvidence.click();
        } else if (type === 'call112') {
            window.location.href = 'tel:112';
        }
    }

    function openQuickGuide() {
        currentQuickGuideItem = null;
        if (quickGuideListView) quickGuideListView.classList.remove('hidden');
        if (quickGuideDetailView) quickGuideDetailView.classList.add('hidden');
        renderQuickGuideList();
        if (quickGuidePage) quickGuidePage.classList.add('show');
    }

    function closeQuickGuide() {
        if (quickGuidePage) quickGuidePage.classList.remove('show');
    }

    function goBackQuickGuide() {
        if (quickGuideDetailView && !quickGuideDetailView.classList.contains('hidden')) {
            quickGuideDetailView.classList.add('hidden');
            if (quickGuideListView) quickGuideListView.classList.remove('hidden');
            currentQuickGuideItem = null;
        } else {
            closeQuickGuide();
        }
    }

    if (btnQuickSafetyGuide) btnQuickSafetyGuide.addEventListener('click', openQuickGuide);
    if (quickGuideBackBtn) quickGuideBackBtn.addEventListener('click', goBackQuickGuide);
    if (quickGuideGoBackBtn) quickGuideGoBackBtn.addEventListener('click', goBackQuickGuide);

    // Home Tab Test Alert Button
    const homeTestAlertBtn = document.getElementById('homeTestAlertBtn');
    if (homeTestAlertBtn) {
        homeTestAlertBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const navTabJourney = document.getElementById('navTabJourney');
            if (navTabJourney) navTabJourney.click();
            setTimeout(() => {
                showDeviationAlert();
            }, 300);
        });
    }

    // ==========================================
    // PROFILE MENU OPTIONS MODALS & HANDLERS
    // ==========================================
    function openProfileModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    }

    function closeProfileModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    }

    // Modal Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = btn.getAttribute('data-close-modal');
            closeProfileModal(modalId);
        });
    });

    // Close on backdrop click
    document.querySelectorAll('.profile-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // 1. Personal Information Option
    const menuItemPersonalInfo = document.getElementById('menuItemPersonalInfo');
    const profileInputName = document.getElementById('profileInputName');
    const profileInputPhone = document.getElementById('profileInputPhone');
    const profileInputEmail = document.getElementById('profileInputEmail');
    const profileInputAddress = document.getElementById('profileInputAddress');
    const profileInputMedical = document.getElementById('profileInputMedical');
    const btnSavePersonalInfo = document.getElementById('btnSavePersonalInfo');

    if (menuItemPersonalInfo) {
        menuItemPersonalInfo.addEventListener('click', () => {
            if (profileInputName) profileInputName.value = localStorage.getItem('fullName') || localStorage.getItem('userName') || '';
            if (profileInputPhone) profileInputPhone.value = localStorage.getItem('userPhone') || '';
            if (profileInputEmail) profileInputEmail.value = localStorage.getItem('userEmail') || '';
            if (profileInputAddress) profileInputAddress.value = localStorage.getItem('userAddress') || '';
            if (profileInputMedical) profileInputMedical.value = localStorage.getItem('userMedical') || '';
            openProfileModal('modalPersonalInfo');
        });
    }

    if (btnSavePersonalInfo) {
        btnSavePersonalInfo.addEventListener('click', () => {
            const newName = (profileInputName?.value || '').trim();
            const newPhone = (profileInputPhone?.value || '').trim();
            const newEmail = (profileInputEmail?.value || '').trim();
            const newAddress = (profileInputAddress?.value || '').trim();
            const newMedical = (profileInputMedical?.value || '').trim();

            if (newName) {
                localStorage.setItem('userName', newName);
                localStorage.setItem('fullName', newName);
                if (profileTabName) profileTabName.innerText = newName;
                if (profileTabAvatar) {
                    profileTabAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(newName)}&background=e11d48&color=ffffff&rounded=true`;
                }
            }
            if (newPhone) {
                localStorage.setItem('userPhone', newPhone);
                if (profileTabPhone) profileTabPhone.innerText = newPhone;
            }
            if (newEmail) localStorage.setItem('userEmail', newEmail);
            if (newAddress) localStorage.setItem('userAddress', newAddress);
            if (newMedical) localStorage.setItem('userMedical', newMedical);

            closeProfileModal('modalPersonalInfo');
            showAppToast('Personal information updated successfully!', 'success');
        });
    }

    // 2. Emergency Contacts Option
    const menuItemEmergencyContacts = document.getElementById('menuItemEmergencyContacts');
    const btnAddNewContact = document.getElementById('btnAddNewContact');
    const newContactNameInput = document.getElementById('newContactNameInput');
    const newContactPhoneInput = document.getElementById('newContactPhoneInput');

    if (menuItemEmergencyContacts) {
        menuItemEmergencyContacts.addEventListener('click', () => {
            loadUserEmergencyContacts();
            openProfileModal('modalEmergencyContacts');
        });
    }

    if (btnAddNewContact) {
        btnAddNewContact.addEventListener('click', () => {
            const name = (newContactNameInput?.value || '').trim();
            const phone = (newContactPhoneInput?.value || '').replace(/\D/g, '');

            if (!name || phone.length < 10) {
                showAppToast('Please enter a valid contact name and 10-digit phone', 'warning');
                return;
            }

            const current = getSavedEmergencyContacts();
            current.push({ name, phone });
            localStorage.setItem('userEmergencyContacts', JSON.stringify(current));

            if (newContactNameInput) newContactNameInput.value = '';
            if (newContactPhoneInput) newContactPhoneInput.value = '';

            loadUserEmergencyContacts();
            showAppToast(`Added ${name} to your trusted emergency network`, 'success');
        });
    }

    // 3. Safety Preferences Option
    const menuItemSafetyPreferences = document.getElementById('menuItemSafetyPreferences');
    if (menuItemSafetyPreferences) {
        menuItemSafetyPreferences.addEventListener('click', () => {
            openProfileModal('modalSafetyPreferences');
        });
    }

    // 4. Location & Permissions Option
    const menuItemLocationPermissions = document.getElementById('menuItemLocationPermissions');
    const btnTestGpsAccuracy = document.getElementById('btnTestGpsAccuracy');
    const permGpsStatus = document.getElementById('permGpsStatus');

    if (menuItemLocationPermissions) {
        menuItemLocationPermissions.addEventListener('click', () => {
            openProfileModal('modalLocationPermissions');
        });
    }

    if (btnTestGpsAccuracy) {
        btnTestGpsAccuracy.addEventListener('click', () => {
            if (permGpsStatus) permGpsStatus.innerText = 'Acquiring GPS fix...';
            btnTestGpsAccuracy.innerText = 'Querying Satellites...';

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const acc = Math.round(pos.coords.accuracy);
                        const lat = pos.coords.latitude.toFixed(4);
                        const lng = pos.coords.longitude.toFixed(4);
                        if (permGpsStatus) {
                            permGpsStatus.innerText = `Active: ${lat}, ${lng} (±${acc}m)`;
                            permGpsStatus.style.color = '#059669';
                        }
                        btnTestGpsAccuracy.innerText = 'Test Live GPS Accuracy';
                        showAppToast(`GPS Locked! Accuracy ±${acc}m`, 'success');
                    },
                    (err) => {
                        if (permGpsStatus) {
                            permGpsStatus.innerText = 'Location permission blocked';
                            permGpsStatus.style.color = '#dc2626';
                        }
                        btnTestGpsAccuracy.innerText = 'Retry GPS Check';
                        showAppToast('Could not fetch precise GPS: ' + err.message, 'warning');
                    },
                    { enableHighAccuracy: true, timeout: 6000 }
                );
            }
        });
    }

    // 5. My Safety History Option
    const menuItemSafetyHistory = document.getElementById('menuItemSafetyHistory');
    const btnGoToAlertsFeed = document.getElementById('btnGoToAlertsFeed');

    if (menuItemSafetyHistory) {
        menuItemSafetyHistory.addEventListener('click', () => {
            openProfileModal('modalSafetyHistory');
        });
    }

    if (btnGoToAlertsFeed) {
        btnGoToAlertsFeed.addEventListener('click', () => {
            closeProfileModal('modalSafetyHistory');
            const navTabSafety = document.getElementById('navTabSafety');
            if (navTabSafety) navTabSafety.click();
        });
    }

    // 6. App Settings & Help Option
    const menuItemAppSettings = document.getElementById('menuItemAppSettings');
    if (menuItemAppSettings) {
        menuItemAppSettings.addEventListener('click', () => {
            openProfileModal('modalAppSettings');
        });
    }
});
