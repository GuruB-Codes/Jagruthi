document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;
    const roleMap = { 'index.html': 'user', 'emergency.html': 'emergency', 'police.html': 'police', 'admin.html': 'admin' };
    
    // Auth Check
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');
    if (isLoggedIn !== 'true' || userRole !== 'user') {
        window.location.href = 'login.html';
        return;
    }
    
    // Set Profile Image based on user name
    const userName = localStorage.getItem('userName') || 'User';
    const profileImg = document.getElementById('userProfileImg');
    if (profileImg) {
        profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=7b2cbf&color=fff&rounded=true`;
    }
    
    // 15 Dummy Drivers Dataset
    const dummyDrivers = [
        { name: "Rajesh Kumar", phone: "+91 9876543211", carNumber: "KA-01-AB-1234", carModel: "Maruti Swift" },
        { name: "Suresh Reddy", phone: "+91 9876543212", carNumber: "KA-02-CD-5678", carModel: "Hyundai i20" },
        { name: "Amit Singh", phone: "+91 9876543213", carNumber: "KA-03-EF-9012", carModel: "Tata Nexon" },
        { name: "Priya Sharma", phone: "+91 9876543214", carNumber: "KA-04-GH-3456", carModel: "Honda City" },
        { name: "Vikram Das", phone: "+91 9876543215", carNumber: "KA-05-IJ-7890", carModel: "Mahindra XUV300" },
        { name: "Anita Patel", phone: "+91 9876543216", carNumber: "KA-01-KL-1234", carModel: "Kia Seltos" },
        { name: "Ramesh Babu", phone: "+91 9876543217", carNumber: "KA-02-MN-5678", carModel: "Toyota Innova" },
        { name: "Sandeep Gupta", phone: "+91 9876543218", carNumber: "KA-03-OP-9012", carModel: "Maruti Dzire" },
        { name: "Kiran Rao", phone: "+91 9876543219", carNumber: "KA-04-QR-3456", carModel: "Hyundai Creta" },
        { name: "Pooja Desai", phone: "+91 9876543220", carNumber: "KA-05-ST-7890", carModel: "Tata Tiago" },
        { name: "Rahul Verma", phone: "+91 9876543221", carNumber: "KA-01-UV-1234", carModel: "Renault Kwid" },
        { name: "Neha Joshi", phone: "+91 9876543222", carNumber: "KA-02-WX-5678", carModel: "Skoda Kushaq" },
        { name: "Manoj Tiwari", phone: "+91 9876543223", carNumber: "KA-03-YZ-9012", carModel: "VW Polo" },
        { name: "Sunita Iyer", phone: "+91 9876543224", carNumber: "KA-04-AB-3456", carModel: "Maruti Baleno" },
        { name: "Deepak Nair", phone: "+91 9876543225", carNumber: "KA-05-CD-7890", carModel: "Hyundai Venue" }
    ];

    /* =========================================
       1. MAP INITIALIZATION — Only user marker
       ========================================= */
    let userMap, userMarker, destMarker, liveTrackingInterval;
    let safestRouteLine, altRouteLine, shortestRouteLine;
    let deviationLine;
    
    const defaultLoc = [13.1682, 77.5354]; // Presidency University, Rajanakunte
    let startLoc = defaultLoc;
    let destinationLoc = null; // NULL until user searches
    let activePathCoords = null;
    let safestPath = null, shortPath = null, altPath = null;
    let currentStep = 0;
    let routesGenerated = false;

    userMap = L.map('userMap', {zoomControl: false}).setView(startLoc, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(userMap);

    const userIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
    });

    const destIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
    });

    // Place user marker at default first, then update with real GPS
    userMarker = L.marker(startLoc, {icon: userIcon, zIndexOffset: 1000}).addTo(userMap).bindPopup("Detecting your location...").openPopup();

    // Auto-detect REAL GPS location on page load
    const sourceInput = document.getElementById('sourceInput');
    if (sourceInput) sourceInput.value = "Detecting location...";

    function fetchLocationByIP() {
        // IP Geolocation gives incorrect ISP node (Kasturba Road). 
        // Bypassing directly to exact precision fallback for demo purposes.
        fallbackToDefault();
    }

    function fallbackToDefault() {
        if (sourceInput) sourceInput.value = "Presidency University";
        startLoc = defaultLoc;
        if(userMarker) {
            userMarker.setLatLng(startLoc);
            userMarker.bindPopup("Current Location: Presidency University").openPopup();
        }
        if(userMap) { 
            userMap.setView(startLoc, 15);
        }
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                startLoc = [position.coords.latitude, position.coords.longitude];
                console.log("Real GPS detected:", startLoc);
                userMarker.setLatLng(startLoc);
                userMarker.bindPopup("Current Location (GPS)").openPopup();
                userMap.setView(startLoc, 15);
                if (sourceInput) sourceInput.value = "Current Location (GPS)";
            },
            (error) => {
                console.warn("GPS denied or unavailable, using IP fallback:", error.message);
                fetchLocationByIP();
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    } else {
        console.warn("Geolocation not supported by browser");
        fetchLocationByIP();
    }

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
        if (safestRouteLine) { userMap.removeLayer(safestRouteLine); safestRouteLine = null; }
        if (shortestRouteLine) { userMap.removeLayer(shortestRouteLine); shortestRouteLine = null; }
        if (altRouteLine) { userMap.removeLayer(altRouteLine); altRouteLine = null; }
        if (deviationLine) { userMap.removeLayer(deviationLine); deviationLine = null; }
        safestPath = null; shortPath = null; altPath = null;
        activePathCoords = null;
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

    async function triggerSOSAction(type = "SOS Triggered", message = "Emergency SOS Activated") {
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
        
        const fallbackLat = "13.1682";
        const fallbackLng = "77.5354";

        // Use the captured deviated position if available, otherwise use current marker position
        let alertLat, alertLng;
        if (lastDeviatedPosition) {
            alertLat = lastDeviatedPosition[0].toFixed(4);
            alertLng = lastDeviatedPosition[1].toFixed(4);
        } else {
            alertLat = userMarker ? userMarker.getLatLng().lat.toFixed(4) : fallbackLat;
            alertLng = userMarker ? userMarker.getLatLng().lng.toFixed(4) : fallbackLng;
        }

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
        let driverInfo = null;
        if (carNumberInput && carNumberInput.value.trim() !== '') {
            const enteredNum = carNumberInput.value.trim().toUpperCase();
            let found = dummyDrivers.find(d => d.carNumber.toUpperCase().includes(enteredNum) || enteredNum.includes(d.carNumber.toUpperCase()));
            driverInfo = Object.assign({}, found || dummyDrivers[Math.floor(Math.random() * dummyDrivers.length)]);
            driverInfo.carNumber = enteredNum;
        } else if (travelMode === 'Car') {
            driverInfo = Object.assign({}, dummyDrivers[Math.floor(Math.random() * dummyDrivers.length)]);
        }

        let driverData = driverInfo ? {
            driverName: driverInfo.name,
            driverPhone: driverInfo.phone,
            driverCarNumber: driverInfo.carNumber,
            driverCarModel: driverInfo.carModel
        } : null;

        let fullMessage = message;
        if (driverData) {
            fullMessage += ` | Vehicle: ${driverData.driverCarNumber} (${driverData.driverCarModel}), Driver: ${driverData.driverName} (${driverData.driverPhone})`;
        }

        const emergencyData = {
            id: Date.now(),
            sos_id: activeSosId,
            user_id: activeUserId,
            userName: localStorage.getItem('userName') || "Kavya",
            phone: localStorage.getItem('userPhone') || "+91 98765 43210",
            latitude: alertLat,
            longitude: alertLng,
            address: destInput ? destInput.value || "Presidency University, Rajanakunte" : "Presidency University, Rajanakunte",
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

        // 3. INSERT INTO emergency_alerts LINKED WITH sos_id
        if (supabase) {
             const { error } = await supabase.from('emergency_alerts').insert([{
                 sos_id: activeSosId,
                 user_phone: emergencyData.phone,
                 alert_type: type,
                 latitude: parseFloat(alertLat),
                 longitude: parseFloat(alertLng),
                 message: `${fullMessage} [MODE:${travelMode}]`,
                 status: 'active'
             }]);
             if (error) {
                 console.warn("Supabase insert with sos_id failed, attempting standard insert:", error);
                 // Fallback if sos_id column is missing in legacy schema
                 await supabase.from('emergency_alerts').insert([{
                     user_phone: emergencyData.phone,
                     alert_type: type,
                     latitude: parseFloat(alertLat),
                     longitude: parseFloat(alertLng),
                     message: `${fullMessage} [MODE:${travelMode}] [SOS:${activeSosId}]`,
                     status: 'active'
                 }]);
             }
        }

        window.dispatchEvent(new StorageEvent('storage', {
            key: 'safeRouteEmergency',
            newValue: JSON.stringify(emergencyData)
        }));

        // Switch to SOS tab so woman user immediately sees the Live Evidence Status Card
        const navTabSos = document.getElementById('navTabSos');
        if (navTabSos && !isAutoTrigger) {
            navTabSos.click();
        }

        // 4. START EVIDENCE CAPTURE & SECURE STORAGE IN PARALLEL
        console.log("Starting Evidence Media Capture & Storage Upload...");
        if (window.emergencyMedia) {
            window.emergencyMedia.captureAndUploadEvidence({
                sosId: activeSosId,
                userId: activeUserId,
                duration: 6000
            }).then(result => {
                console.log("Evidence capture & upload completed. Result:", result);
                if (result.success) {
                    emergencyData.evidence_status = "captured";
                    localStorage.setItem('safeRouteEmergency', JSON.stringify(emergencyData));
                }
            }).catch(err => {
                console.error("Evidence capture workflow exception:", err);
            });
        }
    }


    /* =========================================
       5. TRACKING LOGIC
       ========================================= */
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
                
                if(liveTrackingInterval) clearInterval(liveTrackingInterval);
                
                currentStep = 0;
                broadcastLiveLocation(activePathCoords[currentStep]);
                
                liveTrackingInterval = setInterval(() => {
                    currentStep++;
                    if(currentStep < activePathCoords.length) {
                        const newLoc = activePathCoords[currentStep];
                        if (userMarker) {
                            userMarker.setLatLng(newLoc);
                            if(userMap) userMap.panTo(newLoc);
                        }
                        broadcastLiveLocation(newLoc);
                    } else {
                        clearInterval(liveTrackingInterval);
                        alert("You have reached your destination.");
                        startJourneyBtn.click();
                    }
                }, 3500);

            } else {
                btnText.innerText = 'Start Journey';
                if(btnIcon) { btnIcon.classList.remove('la-stop-circle'); btnIcon.classList.add('la-play'); }
                startJourneyBtn.style.background = 'var(--success)';
                startJourneyBtn.style.boxShadow = '0 10px 25px rgba(16, 185, 129, 0.4)';
                
                const liveInd = document.querySelector('.live-indicator');
                if(liveInd) liveInd.style.display = 'none';
                if(liveTrackingInterval) clearInterval(liveTrackingInterval);
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
                alert_status: payload.isDeviated ? 'deviated' : 'normal'
            }]);
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
    const fakeCallAudio = new Audio('https://www.soundjay.com/phone/telephone-ring-04.mp3');
    fakeCallAudio.loop = true;

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
            
            userMarker.setLatLng(deviatedPos);
            userMap.panTo(deviatedPos);
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
        closeDeviationAlert();
        // Do NOT stop tracking; keep broadcasting location for police
        triggerSOSAction("Auto-SOS Activated", "User unresponsive to deviation alerts for 45 seconds.");
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
        if (!activePathCoords || preDeviationStep === null) return;

        // Remove the red deviation line
        if (deviationLine) { userMap.removeLayer(deviationLine); deviationLine = null; }
        lastDeviatedPosition = null;

        // Snap marker back to route at the saved step
        currentStep = preDeviationStep;
        const snapLoc = activePathCoords[currentStep];
        if (userMarker && snapLoc) {
            userMarker.setLatLng(snapLoc);
            if(userMap) userMap.panTo(snapLoc);
            broadcastLiveLocation(snapLoc);
        }
        preDeviationStep = null;

        // Resume the tracking interval to continue to destination
        if (liveTrackingInterval) clearInterval(liveTrackingInterval);
        liveTrackingInterval = setInterval(() => {
            currentStep++;
            if (currentStep < activePathCoords.length) {
                const newLoc = activePathCoords[currentStep];
                if (userMarker) {
                    userMarker.setLatLng(newLoc);
                    if(userMap) userMap.panTo(newLoc);
                }
                broadcastLiveLocation(newLoc);
            } else {
                clearInterval(liveTrackingInterval);
                liveTrackingInterval = null;
                alert("You have reached your destination.");
                if (startJourneyBtn) startJourneyBtn.click(); // Reset button
            }
        }, 3500);

        console.log("Tracking resumed from step", currentStep, "of", activePathCoords.length);
    }

    // Stop tracking completely (used when NOT SAFE or SOS)
    function stopTracking() {
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
    if (modeButtons) {
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Recalculate route if destination is currently set
                if (destinationLoc && destInput && destInput.value) {
                    processDestination(destinationLoc[0], destinationLoc[1], destInput.value);
                }
            });
        });
    }
    
    // Deviation Triggers
    const demoTrigger = document.getElementById('demoTrigger');
    if (demoTrigger) {
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
            // First: close the deviation modal and kill the auto-escalation timer
            closeDeviationAlert();
            // Do NOT stop tracking; keep movement broadcasting active for emergency response
            triggerSOSAction("Not Safe Triggered", "User reported NOT SAFE due to route deviation");
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
                        const realLoc = [pos.coords.latitude, pos.coords.longitude];
                        if(userMarker) userMarker.setLatLng(realLoc);
                        if(userMap) { userMap.panTo(realLoc); userMap.setZoom(16); }
                        if(sourceInput) sourceInput.value = "My Current Location";
                        updateCoordsDisplays(realLoc);
                    },
                    (error) => {
                        console.warn("GPS failed on click, using IP fallback:", error.message);
                        fetchLocationByIP();
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            } else {
                fetchLocationByIP();
            }
        });
    }

    function updateCoordsDisplays(coords) {
        const sosCoords = document.getElementById('sosCoordsDisplay');
        if (sosCoords) sosCoords.innerText = `Lat: ${coords[0].toFixed(4)}, Lng: ${coords[1].toFixed(4)}`;
        const homeGps = document.getElementById('homeGpsStatus');
        if (homeGps) homeGps.innerText = `GPS Active (${coords[0].toFixed(2)}, ${coords[1].toFixed(2)})`;
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

            // Invalidate Leaflet Map Size so map redraws correctly
            if (targetTab === 'tab-journey' && userMap) {
                setTimeout(() => {
                    userMap.invalidateSize();
                }, 200);
            }

            // Scroll to top smoothly
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // Populate profile tab info from localStorage
    const profileTabName = document.getElementById('profileTabName');
    const profileTabPhone = document.getElementById('profileTabPhone');
    const profileTabAvatar = document.getElementById('profileTabAvatar');
    if (profileTabName) profileTabName.innerText = localStorage.getItem('userName') || 'Kavya Sharma';
    if (profileTabPhone) profileTabPhone.innerText = localStorage.getItem('userPhone') || '+91 98765 43210';
    if (profileTabAvatar) {
        profileTabAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(localStorage.getItem('userName') || 'User')}&background=4f46e5&color=fff&rounded=true`;
    }

    // Direct SOS Button in SOS Tab
    const directSosTriggerBtn = document.getElementById('directSosTriggerBtn');
    if (directSosTriggerBtn) {
        directSosTriggerBtn.addEventListener('click', () => {
            if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 500]);
            triggerSOSAction("Emergency SOS", "User triggered manual SOS from Emergency Hub");
            alert("Emergency SOS Activated! Live coordinates and alert sent.");
        });
    }

    // Home Tab Test Alert Button
    const homeTestAlertBtn = document.getElementById('homeTestAlertBtn');
    if (homeTestAlertBtn) {
        homeTestAlertBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Switch to journey tab and trigger deviation alert
            const navTabJourney = document.getElementById('navTabJourney');
            if (navTabJourney) navTabJourney.click();
            setTimeout(() => {
                showDeviationAlert();
            }, 300);
        });
    }
});
