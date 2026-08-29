document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;
    
    // Auth Check
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');
    if (isLoggedIn !== 'true' || userRole !== 'emergency') {
        window.location.href = 'login.html';
        return;
    }

    // Populate Initials Badge
    const contactName = localStorage.getItem('fullName') || 'Parent User';
    const badge = document.getElementById('contactInitialsBadge');
    if (badge) {
        const initials = contactName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        badge.innerText = initials;
    }

    const activeAlertPanel = document.getElementById('activeAlertPanel');
    const emergencyDetailsPanel = document.getElementById('emergencyDetailsPanel');
    const emergencyActionsSection = document.getElementById('emergencyActionsSection');
    const alertUserName = document.getElementById('alertUserName');
    const alertUserPhone = document.getElementById('alertUserPhone');
    const alertMessage = document.getElementById('alertMessage');
    const alertTime = document.getElementById('alertTime');
    
    const locAlertType = document.getElementById('locAlertType');
    const locAddress = document.getElementById('locAddress');
    const locLat = document.getElementById('locLat');
    const locLng = document.getElementById('locLng');

    const popupUserName = document.getElementById('popupUserName');
    const popupAlertType = document.getElementById('popupAlertType');
    const incidentOverlay = document.getElementById('incidentOverlay');
    const incidentModal = document.getElementById('incidentModal');
    const btnViewLive = document.getElementById('btnViewLive');
    const alertSound = document.getElementById('alertSound');
    
    const mainStatusText = document.getElementById('mainStatusText');
    const mainStatusBadge = document.getElementById('mainStatusBadge');
    const widgetStatus = document.querySelector('.widget-status');
    const statusPulse = document.querySelector('.status-pulse');

    const btnResolveAlert = document.getElementById('btnResolveAlert');
    const historyList = document.getElementById('historyList');

    let currentAlertId = null;
    let currentCaseData = null;
    let contactMap, trackingMarkerObj;
    let isMapInit = false;
    let sourceMarkerObj, destMarkerObj, routeLineObj, deviationLineObj;
    // Track which Supabase alert IDs we've already processed so we don't re-trigger
    let processedAlertIds = new Set();

    // Wait until map is visible to init properly
    function initContactMap() {
        if(isMapInit) return;
        isMapInit = true;
        contactMap = L.map('contactMap', {zoomControl: false}).setView([12.9716, 77.5946], 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(contactMap);
        
        const dangerIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41]
        });
        
        trackingMarkerObj = L.marker([12.9716, 77.5946], {icon: dangerIcon}).addTo(contactMap);
    }
    
    // Call init anyway in case we load directly into emergency
    setTimeout(initContactMap, 500);

    // Listen for cross-tab communication from User Dashboard via localStorage
    // ONLY react to genuine NEW alerts sent by the user dashboard
    window.addEventListener('storage', (e) => {
        if (e.key === 'safeRouteEmergency' && e.newValue) {
            const emergencyData = JSON.parse(e.newValue);
            if (emergencyData.status === 'ACTIVE' && emergencyData.id) {
                if (!processedAlertIds.has(emergencyData.id)) {
                    processedAlertIds.add(emergencyData.id);
                    handleIncomingEmergency(emergencyData);
                } else if (currentCaseData && currentCaseData.id === emergencyData.id) {
                    currentCaseData.imageEvidence = emergencyData.imageEvidence || currentCaseData.imageEvidence;
                    currentCaseData.audioEvidence = emergencyData.audioEvidence || currentCaseData.audioEvidence;
                }
            }
        }
        
        if (e.key === 'safeRouteLiveLocation' && e.newValue) {
            const liveLoc = JSON.parse(e.newValue);
            updateLiveTracking(liveLoc);
        }
    });

    function updateLiveTracking(loc) {
        if(!isMapInit) initContactMap();
        document.getElementById('lastUpdatedTime').innerText = `Live: ${loc.time}`;
        const newCoords = [loc.lat, loc.lng];
        
        // 1. Draw Safe Route Path
        if (loc.routePath && loc.routePath.length > 0) {
            if (routeLineObj) contactMap.removeLayer(routeLineObj);
            routeLineObj = L.polyline(loc.routePath, {color: '#10b981', weight: 6, opacity: 0.8}).addTo(contactMap);
        }

        // 2. Draw Source
        if (loc.sourceLoc) {
            if (sourceMarkerObj) sourceMarkerObj.setLatLng(loc.sourceLoc);
            else {
                const srcIcon = L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', iconSize: [25, 41], iconAnchor: [12, 41]});
                sourceMarkerObj = L.marker(loc.sourceLoc, {icon: srcIcon}).addTo(contactMap).bindPopup("Source").openPopup();
            }
        }

        // 3. Draw Destination
        if (loc.destinationLoc) {
            if (destMarkerObj) destMarkerObj.setLatLng(loc.destinationLoc);
            else {
                const dstIcon = L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', iconSize: [25, 41], iconAnchor: [12, 41]});
                destMarkerObj = L.marker(loc.destinationLoc, {icon: dstIcon}).addTo(contactMap).bindPopup("Destination");
            }
        }

        // 4. Draw Deviation Line if applicable — and update deviation info on UI
        if (loc.isDeviated && loc.deviationPoint) {
            if (deviationLineObj) contactMap.removeLayer(deviationLineObj);
            deviationLineObj = L.polyline([loc.deviationPoint, newCoords], {color: '#ef4444', weight: 6, dashArray: '6,6'}).addTo(contactMap);
            
            // Show deviation details in the emergency details panel
            locAlertType.innerText = '⚠️ Route Deviation Detected';
            locLat.innerText = loc.lat.toFixed(4);
            locLng.innerText = loc.lng.toFixed(4);
            
            // Reverse geocode the deviated location to show address
            reverseGeocode(loc.lat, loc.lng).then(addr => {
                locAddress.innerText = addr || `Near ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
            });

            // Update the distance info to show deviation distance
            const distEl = document.querySelector('.distance-info');
            if (distEl && loc.deviationPoint) {
                const devDist = getDistanceKm(loc.deviationPoint[0], loc.deviationPoint[1], loc.lat, loc.lng);
                distEl.innerHTML = `<i class="las la-ruler"></i> User deviated approximately <strong style="color:#ef4444;">${devDist} km</strong> from safe route`;
            }

            emergencyDetailsPanel.classList.remove('hidden');
        } else {
            if (deviationLineObj) { contactMap.removeLayer(deviationLineObj); deviationLineObj = null; }
        }

        // 5. Update Live Victim Marker
        if(trackingMarkerObj) {
            trackingMarkerObj.setLatLng(newCoords);
            contactMap.setView(newCoords, Math.max(14, contactMap.getZoom())); // Keep centered on user
        }
    }

    // Helper: Calculate distance between two lat/lng points in km
    function getDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return (R * c).toFixed(2);
    }

    // Helper: Reverse geocode coordinates to a human-readable address
    async function reverseGeocode(lat, lng) {
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

    // FIX: Do NOT auto-trigger alerts on page load.
    // Step 1: Ignore stale localStorage data completely
    const existingEmerg = localStorage.getItem('safeRouteEmergency');
    if (existingEmerg) {
        const data = JSON.parse(existingEmerg);
        // Always mark the localStorage alert ID as processed so it never re-triggers
        if (data.id) processedAlertIds.add(data.id);
    }

    // Step 2: Pre-load ALL existing active alert IDs from Supabase
    // so the poller never treats old DB alerts as new
    async function preloadExistingAlerts() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('emergency_alerts')
                .select('id')
                .eq('status', 'active');
            
            if (data && !error) {
                data.forEach(alert => processedAlertIds.add(alert.id));
                console.log('Emergency: Pre-loaded', data.length, 'existing alert IDs. Will ignore these.');
            }
        } catch (e) {
            console.error('Failed to pre-load existing alerts:', e);
        }
    }

    // Run pre-load BEFORE starting the poller
    preloadExistingAlerts();

    function handleIncomingEmergency(data, silent = false) {
        if (data.status !== 'ACTIVE') return;
        currentAlertId = data.id;
        currentCaseData = data;

        // Detect hidden evidence capture metadata in message
        if (data.message && data.message.includes('[EVD:CPT]')) {
            data.message = data.message.replace('[EVD:CPT]', '').trim();
            data.evidence_status = 'captured';
        }

        alertUserName.innerText = data.userName || data.user_name || 'Unknown User';
        alertUserPhone.innerText = data.phone || data.user_phone || '--';
        alertMessage.innerText = data.message;
        alertTime.innerText = data.timestamp;

        // Populate location in the alert panel
        const alertLocation = document.getElementById('alertLocation');
        if (alertLocation) {
            alertLocation.innerText = `Lat: ${data.latitude}, Lng: ${data.longitude}`;
        }
        
        locAlertType.innerText = data.alertType || data.alert_type || 'SOS Triggered';
        locAddress.innerText = data.address || "Fetching address near live location...";
        locLat.innerText = data.latitude;
        locLng.innerText = data.longitude;

        // Populate Driver Details
        const emergencyDriverBox = document.getElementById('emergencyDriverBox');
        if (data.driverDetails) {
            if(emergencyDriverBox) emergencyDriverBox.style.display = 'block';
            const emName = document.getElementById('emDriverName');
            const emPhone = document.getElementById('emDriverPhone');
            const emCarNum = document.getElementById('emDriverCarNum');
            const emModel = document.getElementById('emDriverModel');
            if(emName) emName.innerText = data.driverDetails.driverName || '--';
            if(emPhone) emPhone.innerText = data.driverDetails.driverPhone || '--';
            if(emCarNum) emCarNum.innerText = data.driverDetails.driverCarNumber || '--';
            if(emModel) emModel.innerText = data.driverDetails.driverCarModel || '--';
        } else {
            if(emergencyDriverBox) emergencyDriverBox.style.display = 'none';
        }

        // Populate Evidence Status
        const evidenceBadge = document.getElementById('evidenceBadge');
        if (data.evidence_status === 'captured') {
            if(evidenceBadge) {
                evidenceBadge.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                        <div><i class="las la-shield-alt"></i> Evidence Shield Active</div>
                        <button id="btnViewEvidence" style="background:#15803d; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><i class="las la-eye"></i> View</button>
                    </div>
                `;
                evidenceBadge.classList.remove('hidden');
                evidenceBadge.style.display = 'flex';
                evidenceBadge.style.alignItems = 'center';
                evidenceBadge.style.gap = '8px';
                evidenceBadge.style.background = 'linear-gradient(135deg, #f0fdf4, #dcfce7)';
                evidenceBadge.style.color = '#15803d';
                evidenceBadge.style.padding = '10px 16px';
                evidenceBadge.style.border = '1px solid #bbf7d0';
                evidenceBadge.style.borderRadius = '30px';
                evidenceBadge.style.fontWeight = '700';
                evidenceBadge.style.marginTop = '20px';
                evidenceBadge.style.fontSize = '0.85rem';
                evidenceBadge.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.1)';

                setTimeout(() => {
                    const btn = document.getElementById('btnViewEvidence');
                    if (btn) {
                        btn.onclick = () => {
                            const evdOverlay = document.getElementById('evdOverlay');
                            const evdModal = document.getElementById('evdModal');
                            const evdImg = document.getElementById('evdImage');
                            const evdAudio = document.getElementById('evdAudio');
                            if (currentCaseData.imageEvidence) { evdImg.src = currentCaseData.imageEvidence; evdImg.style.display = 'block'; }
                            else { evdImg.style.display = 'none'; }
                            if (currentCaseData.audioEvidence) { evdAudio.src = currentCaseData.audioEvidence; evdAudio.style.display = 'block'; }
                            else { evdAudio.style.display = 'none'; }
                            if (evdOverlay) evdOverlay.classList.add('show');
                            if (evdModal) evdModal.classList.add('show');
                        };
                    }
                }, 50);
            }
        } else if (evidenceBadge) {
            evidenceBadge.classList.add('hidden');
            evidenceBadge.style.display = 'none';
        }

        // Reverse-geocode the alert location for a readable address
        if (data.latitude && data.longitude) {
            reverseGeocode(data.latitude, data.longitude).then(addr => {
                if (addr) {
                    locAddress.innerText = addr;
                    if (alertLocation) alertLocation.innerText = addr;
                }
            });
        }

        // Change Status Widget
        widgetStatus.classList.add('status-active-red');
        statusPulse.classList.remove('green-pulse');
        statusPulse.classList.add('red-pulse');
        mainStatusText.innerText = 'Active Emergency!';
        mainStatusText.classList.add('text-danger');
        mainStatusBadge.innerText = 'DANGER';
        mainStatusBadge.className = 'status-badge status-red';

        // Set global current alert reference for resolving later
        currentAlertId = data.id || null;

        // Update coordinates
        if(trackingMarkerObj) {
            trackingMarkerObj.setLatLng([data.latitude, data.longitude]);
            contactMap.panTo([data.latitude, data.longitude]);
        }
        
        // Unhide elements
        activeAlertPanel.classList.remove('hidden');
        emergencyDetailsPanel.classList.remove('hidden');
        emergencyActionsSection.classList.remove('hidden');

        // Show Popup & Sound if not a silent load
        if (!silent) {
            popupUserName.innerText = data.userName || data.user_name || 'User';
            popupAlertType.innerText = data.alertType || data.alert_type || 'SOS';
            incidentOverlay.classList.add('show');
            incidentModal.classList.add('show');
            
            // Try to play sound (browser security might block text-to-speech or autoplay)
            try {
                alertSound.play().catch(e => console.log("Audio autoplay prevented by permission policy."));
                if('vibrate' in navigator) {
                    // Continuous SOS vibration pattern
                    navigator.vibrate([500, 200, 500, 200, 500, 500, 1000, 500, 1000, 500, 1000, 500, 500, 200, 500, 200, 500]);
                }
            } catch (err) {
                console.error("Audio block:", err);
            }
        }
    }

    btnViewLive.addEventListener('click', async () => {
        // Dismiss Modal, Stop sound
        incidentOverlay.classList.remove('show');
        incidentModal.classList.remove('show');
        alertSound.pause();
        alertSound.currentTime = 0;
        
        // Broadcast Acknowledgment
        const dataStr = localStorage.getItem('safeRouteEmergency');
        if(dataStr) {
            const d = JSON.parse(dataStr);
            d.contactResponded = "YES";
            localStorage.setItem('safeRouteEmergency', JSON.stringify(d));
            window.dispatchEvent(new StorageEvent('storage', { key: 'safeRouteEmergency', newValue: JSON.stringify(d) }));
        }

        if (supabase && currentAlertId) {
            await supabase.from('emergency_alerts').update({ contact_responded: 'YES' }).eq('id', currentAlertId);
        }

        // Scroll to map
        document.querySelector('.map-preview-section').scrollIntoView({ behavior: 'smooth' });
    });

    // Resolve logic
    btnResolveAlert.addEventListener('click', async () => {
        if (confirm("Are you sure you want to resolve this emergency? Only do this if the user is confirmed safe.")) {
            // Revert UI to monitoring state
            activeAlertPanel.classList.add('hidden');
            emergencyDetailsPanel.classList.add('hidden');
            emergencyActionsSection.classList.add('hidden');

            widgetStatus.classList.remove('status-active-red');
            statusPulse.classList.remove('red-pulse');
            statusPulse.classList.add('green-pulse');
            mainStatusText.innerText = 'Monitoring Safety';
            mainStatusText.classList.remove('text-danger');
            mainStatusBadge.innerText = 'Safe';
            mainStatusBadge.className = 'status-badge status-green';
            
            // Disable map tracking lock
            document.getElementById('lastUpdatedTime').innerText = "Last Updated: Offline";

            // Add to history
            const dataStr = localStorage.getItem('safeRouteEmergency');
            if (dataStr) {
                const data = JSON.parse(dataStr);
                const historyHtml = `
                    <div class="history-card">
                        <div class="history-icon bg-gray">
                            <i class="las la-check-circle text-gray" style="color: #10b981;"></i>
                        </div>
                        <div class="history-content">
                            <h4>${data.alertType || data.alert_type}</h4>
                            <p>${data.userName || data.user_name || data.user_phone} • ${data.timestamp || new Date().toLocaleTimeString()} (Resolved)</p>
                        </div>
                        <div class="history-status badge-resolved" style="background:#d1fae5; color:#059669;">Resolved</div>
                    </div>
                `;
                historyList.insertAdjacentHTML('afterbegin', historyHtml);

                // Update status in local storage 
                data.status = 'RESOLVED';
                localStorage.setItem('safeRouteEmergency', JSON.stringify(data));
            }
            
            // Update Supabase DB
            if (supabase && currentAlertId) {
                await supabase
                    .from('emergency_alerts')
                    .update({ status: 'resolved' })
                    .eq('id', currentAlertId);
            }

            alert("Emergency Marked as Resolved.");
        }
    });

    // Supabase Poller for Real-time Dashboard Updates
    // FIX: Track ALL processed alert IDs to prevent re-triggering old alerts
    let locationPoller = null;

    setInterval(async () => {
        if (!supabase) return;
        
        const { data, error } = await supabase
            .from('emergency_alerts')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (data && !error && !processedAlertIds.has(data.id)) {
            processedAlertIds.add(data.id);
            
            // FIX: Fetch the actual user name from the 'users' table
            let actualUserName = data.user_phone; // fallback
            try {
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('full_name')
                    .eq('phone', data.user_phone)
                    .limit(1)
                    .single();
                
                if (userData && !userError && userData.full_name) {
                    actualUserName = userData.full_name;
                }
            } catch (e) {
                console.error('Failed to fetch user name:', e);
            }

            // Format to match expected handler structure
            const emergencyData = {
                id: data.id,
                userName: actualUserName,
                phone: data.user_phone,
                message: data.message,
                timestamp: new Date().toLocaleTimeString(),
                alertType: data.alert_type,
                latitude: data.latitude,
                longitude: data.longitude,
                status: 'ACTIVE'
            };
            
            handleIncomingEmergency(emergencyData);
            startLocationPoller(data.user_phone);
        }
    }, 3000);

    function startLocationPoller(phone) {
        if (locationPoller) clearInterval(locationPoller);
        locationPoller = setInterval(async () => {
            const { data, error } = await supabase
                .from('live_locations')
                .select('*')
                .eq('user_phone', phone)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (data && !error) {
                updateLiveTracking({
                    lat: data.latitude,
                    lng: data.longitude,
                    time: new Date().toLocaleTimeString(),
                    isDeviated: data.alert_status === 'deviated'
                    // Note: full routePath/source/dest still rely on local storage or could be added to DB later
                });
            }
        }, 3000);
    }

    // Buttons logic for direct calling
    document.getElementById('btnCall').addEventListener('click', function() {
        const phone = document.getElementById('alertUserPhone').innerText;
        if (phone && phone !== '--') {
            console.log(`Initiating call to user: ${phone}`);
            window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
        } else {
            alert("User phone number not available.");
        }
    });

    document.getElementById('btnEmergencyNumbers').addEventListener('click', function() {
        console.log("Initiating call to Emergency Services: 112");
        window.location.href = "tel:112";
        
        // Also trigger the internal escalation logic
        const dataStr = localStorage.getItem('safeRouteEmergency');
        if (dataStr) {
            const data = JSON.parse(dataStr);
            data.alertType = "Escalated to Emergency Services";
            data.message = "Emergency Contact is calling 112 for immediate help!";
            data.policeEscalation = "ACTIVE";
            data.contactResponded = "YES";
            data.timestamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            
            localStorage.setItem('safeRouteEmergency', JSON.stringify(data));
        }
    });

    const closeEvdBtn = document.getElementById('closeEvdBtn');
    if (closeEvdBtn) {
        closeEvdBtn.addEventListener('click', () => {
            const evdOverlay = document.getElementById('evdOverlay');
            const evdModal = document.getElementById('evdModal');
            const evdAudio = document.getElementById('evdAudio');
            if (evdOverlay) evdOverlay.classList.remove('show');
            if (evdModal) evdModal.classList.remove('show');
            if (evdAudio) evdAudio.pause();
        });
    }

});
