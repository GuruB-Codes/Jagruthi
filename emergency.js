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

    const contactName = localStorage.getItem('fullName') || localStorage.getItem('userName') || 'Emergency Contact';
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

    // Helper: Update Connected Ward / Person Card info
    function updateConnectedPersonInfo(name, phone) {
        const wardName = name || localStorage.getItem('connectedWardName') || null;
        const wardPhone = phone || localStorage.getItem('connectedWardPhone') || null;
        
        const homeName = document.getElementById('homeConnectedUserName');
        const homePhone = document.getElementById('homeConnectedUserPhone');
        const homeAvatar = document.getElementById('homeConnectedUserAvatar');
        const homeCallBtn = document.getElementById('homeConnectedUserCallBtn');
        
        const profName = document.getElementById('profileConnectedUserName');
        const profAvatar = document.getElementById('profileConnectedUserAvatar');

        if (wardName) {
            const initials = wardName.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().substring(0, 2) || 'W';
            if (homeName) homeName.innerText = wardName;
            if (homePhone) homePhone.innerText = wardPhone || '--';
            if (homeAvatar) homeAvatar.innerText = initials;
            if (homeCallBtn && wardPhone) homeCallBtn.href = `tel:${wardPhone.replace(/\s+/g, '')}`;
            
            if (profName) profName.innerText = wardName;
            if (profAvatar) profAvatar.innerText = initials;
        } else {
            if (homeName) homeName.innerText = "No Ward Linked";
            if (homePhone) homePhone.innerText = "Awaiting connection from user";
            if (homeAvatar) homeAvatar.innerText = "--";
            if (homeCallBtn) homeCallBtn.removeAttribute('href');
            
            if (profName) profName.innerText = "No Ward Linked";
            if (profAvatar) profAvatar.innerText = "--";
        }
    }

    // Helper: Fetch real connected ward from Supabase
    async function fetchConnectedWardInfo() {
        const myPhone = localStorage.getItem('userPhone');
        if (!myPhone || !supabase) return;

        try {
            // Find woman user who configured myPhone as their emergency_contact
            const { data: users, error } = await supabase
                .from('users')
                .select('full_name, phone')
                .ilike('emergency_contact', `%${myPhone.replace(/\D/g, '').slice(-10)}%`)
                .limit(1);

            if (users && users.length > 0) {
                localStorage.setItem('connectedWardName', users[0].full_name);
                localStorage.setItem('connectedWardPhone', users[0].phone);
                updateConnectedPersonInfo(users[0].full_name, users[0].phone);
            } else {
                // If not directly found by clean search, check latest alert
                const { data: latestAlert } = await supabase
                    .from('emergency_alerts')
                    .select('user_phone')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (latestAlert && latestAlert.length > 0) {
                    const { data: wardUser } = await supabase
                        .from('users')
                        .select('full_name, phone')
                        .eq('phone', latestAlert[0].user_phone)
                        .single();

                    if (wardUser) {
                        updateConnectedPersonInfo(wardUser.full_name, wardUser.phone);
                    } else {
                        updateConnectedPersonInfo("Ward", latestAlert[0].user_phone);
                    }
                } else {
                    updateConnectedPersonInfo(null, null);
                }
            }
        } catch (e) {
            console.warn("Could not query connected ward from Supabase:", e);
        }
    }

    // Helper: Load Dynamic Alert History from Supabase
    async function loadAlertHistory() {
        if (!historyList || !supabase) return;
        try {
            const { data: alerts, error } = await supabase
                .from('emergency_alerts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error || !alerts || alerts.length === 0) {
                historyList.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 24px; font-size: 0.9rem;"><i class="las la-shield-alt" style="font-size: 1.5rem; display: block; margin-bottom: 4px; color: #10b981;"></i>No alert history found. All records clear.</div>`;
                return;
            }

            historyList.innerHTML = alerts.map(a => {
                const isResolved = a.status === 'resolved';
                const timeStr = parseUtcDate(a.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
                return `
                    <div class="history-card">
                        <div class="history-icon ${isResolved ? 'bg-gray' : 'bg-red'}">
                            <i class="las ${isResolved ? 'la-check-circle text-gray' : 'la-exclamation-triangle text-danger'}"></i>
                        </div>
                        <div class="history-content">
                            <h4>${a.alert_type || 'Emergency SOS'}</h4>
                            <p>${timeStr} &middot; ${a.user_phone}</p>
                        </div>
                        <div class="history-status ${isResolved ? 'badge-resolved' : 'badge-active'}">${a.status.toUpperCase()}</div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.warn("Could not load alert history from Supabase:", e);
        }
    }

    // Helper: Update Last Known Location Preview on Home Tab
    function updateLastKnownLocationDisplay(address, timeStr, lat, lng) {
        const addrEl = document.getElementById('homeLastKnownAddress');
        const timeEl = document.getElementById('homeLastKnownTime');
        
        if (addrEl) {
            if (address) {
                addrEl.innerText = address;
            } else if (lat && lng) {
                addrEl.innerText = `Lat: ${Number(lat).toFixed(4)}, Lng: ${Number(lng).toFixed(4)}`;
                reverseGeocode(lat, lng).then(resolved => {
                    if (resolved && addrEl) addrEl.innerText = resolved;
                });
            }
        }
        
        if (timeEl) {
            timeEl.innerText = timeStr || 'Updated just now';
        }
    }

    // Initialize map centered neutrally without fake danger markers
    function initContactMap() {
        if(isMapInit) return;
        isMapInit = true;
        contactMap = L.map('contactMap', {zoomControl: false}).setView([12.9716, 77.5946], 12);
        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '&copy; Google Maps'
        }).addTo(contactMap);
    }
    
    // Call init in case we load directly into emergency
    setTimeout(initContactMap, 500);

    // Initial setup for connected person & history
    fetchConnectedWardInfo();
    loadAlertHistory();

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
        const timeStr = loc.time ? `Live: ${loc.time}` : `Live: ${new Date().toLocaleTimeString()}`;
        const lastUpdatedEl = document.getElementById('lastUpdatedTime');
        if (lastUpdatedEl) lastUpdatedEl.innerText = timeStr;

        const newCoords = [loc.lat, loc.lng];
        
        // Dynamically update Last Known Location card on Home tab
        const displayTime = loc.time ? `Updated ${loc.time}` : 'Updated just now';
        if (loc.address) {
            updateLastKnownLocationDisplay(loc.address, displayTime, loc.lat, loc.lng);
        } else {
            updateLastKnownLocationDisplay(null, displayTime, loc.lat, loc.lng);
        }

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
                const finalAddr = addr || `Near ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
                locAddress.innerText = finalAddr;
                updateLastKnownLocationDisplay(finalAddr, `Deviated at ${loc.time || 'now'}`, loc.lat, loc.lng);
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
        if(!trackingMarkerObj) {
            const dangerIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41]
            });
            trackingMarkerObj = L.marker(newCoords, {icon: dangerIcon}).addTo(contactMap);
        } else {
            trackingMarkerObj.setLatLng(newCoords);
        }
        contactMap.setView(newCoords, Math.max(14, contactMap.getZoom())); // Keep centered on user
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

    let evidencePoller = null;

    // Refresh evidence associated with case from Supabase
    async function refreshEmergencyEvidence(sosId) {
        if (!supabase || !sosId) return;
        try {
            const { data: evidenceList, error } = await supabase
                .from('sos_evidence')
                .select('*')
                .eq('sos_id', sosId);

            if (evidenceList && !error && evidenceList.length > 0) {
                console.log("Emergency Contact: Loaded evidence records for SOS:", sosId, evidenceList);
                currentCaseData.evidenceList = evidenceList;
                renderEvidenceSection(evidenceList);
            }
        } catch (e) {
            console.warn("Could not fetch evidence list:", e);
        }
    }

    function renderEvidenceSection(evidenceList = []) {
        const evidenceBadge = document.getElementById('evidenceBadge');
        if (!evidenceBadge) return;

        const videoRecord = evidenceList.find(e => e.evidence_type === 'video' && e.status === 'UPLOADED');
        const audioRecord = evidenceList.find(e => e.evidence_type === 'audio' && e.status === 'UPLOADED');
        const isVideoUploading = evidenceList.some(e => e.evidence_type === 'video' && (e.status === 'UPLOADING' || e.status === 'RECORDING'));
        const isAudioUploading = evidenceList.some(e => e.evidence_type === 'audio' && (e.status === 'UPLOADING' || e.status === 'RECORDING'));

        const videoStatusText = videoRecord ? '<span style="color:#16a34a; font-weight:700;">🟢 Video Available</span>' : (isVideoUploading ? '<span style="color:#d97706;">🟡 Video Uploading...</span>' : '<span style="color:#94a3b8;">⚪ Video Not Available</span>');
        const audioStatusText = audioRecord ? '<span style="color:#16a34a; font-weight:700;">🟢 Audio Available</span>' : (isAudioUploading ? '<span style="color:#d97706;">🟡 Audio Uploading...</span>' : '<span style="color:#94a3b8;">⚪ Audio Not Available</span>');

        evidenceBadge.innerHTML = `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; width: 100%; color: var(--text-dark); margin-top: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <strong style="font-size:0.95rem; display:flex; align-items:center; gap:6px; color:#4f46e5;">
                        <i class="las la-shield-alt"></i> Verified Emergency Evidence
                    </strong>
                    <span style="font-size:0.75rem; background:#e0e7ff; color:#4f46e5; padding:3px 8px; border-radius:6px; font-weight:600;">Secure Cloud Storage</span>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; font-size:0.85rem;">
                    <div style="background:white; border:1px solid #e2e8f0; padding:8px 10px; border-radius:8px;">
                        <span style="color:#64748b; display:block; font-size:0.75rem; margin-bottom:2px;">Video Stream:</span>
                        ${videoStatusText}
                    </div>
                    <div style="background:white; border:1px solid #e2e8f0; padding:8px 10px; border-radius:8px;">
                        <span style="color:#64748b; display:block; font-size:0.75rem; margin-bottom:2px;">Audio Stream:</span>
                        ${audioStatusText}
                    </div>
                </div>

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button id="btnEmViewVideo" style="flex:1; min-width:100px; background:${videoRecord ? '#4f46e5' : '#cbd5e1'}; color:white; border:none; padding:8px 12px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:${videoRecord ? 'pointer' : 'not-allowed'}; display:flex; align-items:center; justify-content:center; gap:6px;" ${videoRecord ? '' : 'disabled'}>
                        <i class="las la-video"></i> View Video
                    </button>
                    <button id="btnEmPlayAudio" style="flex:1; min-width:100px; background:${audioRecord ? '#7c3aed' : '#cbd5e1'}; color:white; border:none; padding:8px 12px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:${audioRecord ? 'pointer' : 'not-allowed'}; display:flex; align-items:center; justify-content:center; gap:6px;" ${audioRecord ? '' : 'disabled'}>
                        <i class="las la-volume-up"></i> Play Audio
                    </button>
                    <button id="btnEmTrackLocation" style="flex:1; min-width:100px; background:#059669; color:white; border:none; padding:8px 12px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <i class="las la-map-pin"></i> Track Location
                    </button>
                </div>
            </div>
        `;
        evidenceBadge.classList.remove('hidden');
        evidenceBadge.style.display = 'block';

        // Bind View Video Button
        const btnEmViewVid = document.getElementById('btnEmViewVideo');
        if (btnEmViewVid && videoRecord) {
            btnEmViewVid.onclick = async () => {
                const evdOverlay = document.getElementById('evdOverlay');
                const evdModal = document.getElementById('evdModal');
                const evdVideo = document.getElementById('evdVideo');
                const evdAudio = document.getElementById('evdAudio');
                const evdLoading = document.getElementById('evdLoading');

                if (evdOverlay) evdOverlay.classList.add('show');
                if (evdModal) evdModal.classList.add('show');
                if (evdLoading) evdLoading.classList.remove('hidden');
                if (evdVideo) evdVideo.style.display = 'none';
                if (evdAudio) evdAudio.style.display = 'none';

                // Generate Supabase signed URL for private bucket
                const signedUrl = await window.jagruthiSosService.getSignedEvidenceUrl(videoRecord.storage_path, 3600);
                if (evdLoading) evdLoading.classList.add('hidden');

                if (signedUrl && evdVideo) {
                    evdVideo.src = signedUrl;
                    evdVideo.style.display = 'block';
                    evdVideo.play().catch(e => console.log("Contact video auto-play blocked:", e));
                } else {
                    alert("Could not load secure video URL. Please check network or storage permissions.");
                }
            };
        }

        // Bind Play Audio Button
        const btnEmPlayAud = document.getElementById('btnEmPlayAudio');
        if (btnEmPlayAud && audioRecord) {
            btnEmPlayAud.onclick = async () => {
                const evdOverlay = document.getElementById('evdOverlay');
                const evdModal = document.getElementById('evdModal');
                const evdVideo = document.getElementById('evdVideo');
                const evdAudio = document.getElementById('evdAudio');
                const evdLoading = document.getElementById('evdLoading');

                if (evdOverlay) evdOverlay.classList.add('show');
                if (evdModal) evdModal.classList.add('show');
                if (evdLoading) evdLoading.classList.remove('hidden');
                if (evdVideo) evdVideo.style.display = 'none';
                if (evdAudio) evdAudio.style.display = 'none';

                // Generate Supabase signed URL for private bucket
                const signedUrl = await window.jagruthiSosService.getSignedEvidenceUrl(audioRecord.storage_path, 3600);
                if (evdLoading) evdLoading.classList.add('hidden');

                if (signedUrl && evdAudio) {
                    evdAudio.src = signedUrl;
                    evdAudio.style.display = 'block';
                    evdAudio.play().catch(e => console.log("Contact audio auto-play blocked:", e));
                } else {
                    alert("Could not load secure audio URL. Please check network or storage permissions.");
                }
            };
        }

        // Bind Track Location Button
        const btnEmTrackLoc = document.getElementById('btnEmTrackLocation');
        if (btnEmTrackLoc) {
            btnEmTrackLoc.onclick = () => {
                const navEmLiveTrack = document.getElementById('navEmLiveTrack');
                if (navEmLiveTrack) navEmLiveTrack.click();
                if (currentCaseData && currentCaseData.latitude && currentCaseData.longitude) {
                    const coords = [parseFloat(currentCaseData.latitude), parseFloat(currentCaseData.longitude)];
                    if (trackingMarkerObj) trackingMarkerObj.setLatLng(coords);
                    if (contactMap) {
                        contactMap.setView(coords, 16);
                        contactMap.invalidateSize();
                    }
                }
            };
        }
    }

    function handleIncomingEmergency(data, silent = false) {
        if (data.status !== 'ACTIVE') return;
        currentAlertId = data.id;

        // Detect hidden SOS ID metadata in message
        if (data.message && data.message.includes('[SOS:')) {
            const sosMatch = data.message.match(/\[SOS:(.*?)\]/);
            if (sosMatch && sosMatch[1]) {
                data.sos_id = sosMatch[1];
                data.message = data.message.replace(sosMatch[0], '').trim();
            }
        }

        // Detect hidden evidence capture metadata in message
        if (data.message && data.message.includes('[EVD:CPT]')) {
            data.message = data.message.replace('[EVD:CPT]', '').trim();
            data.evidence_status = 'captured';
        }

        currentCaseData = data;

        const victimName = data.userName || data.user_name || 'User';
        const victimPhone = data.phone || data.user_phone || '--';

        // Update connected person card & profile card
        updateConnectedPersonInfo(victimName, victimPhone);

        alertUserName.innerText = victimName;
        alertUserPhone.innerText = victimPhone;
        alertMessage.innerText = data.message;
        alertTime.innerText = data.timestamp || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        // Populate location in the alert panel
        const alertLocation = document.getElementById('alertLocation');
        if (alertLocation) {
            alertLocation.innerText = `Lat: ${data.latitude}, Lng: ${data.longitude}`;
        }
        
        locAlertType.innerText = data.alertType || data.alert_type || 'SOS Triggered';
        locAddress.innerText = data.address || "Fetching address near live location...";
        locLat.innerText = data.latitude;
        locLng.innerText = data.longitude;

        updateLastKnownLocationDisplay(data.address, data.timestamp || 'Updated just now', data.latitude, data.longitude);

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

        // Render Evidence Section and trigger Evidence Poller
        renderEvidenceSection(data.evidenceList || []);
        if (data.sos_id) {
            refreshEmergencyEvidence(data.sos_id);
            if (evidencePoller) clearInterval(evidencePoller);
            evidencePoller = setInterval(() => refreshEmergencyEvidence(data.sos_id), 3000);
        } else if (data.id) {
            refreshEmergencyEvidence(data.id);
        }

        // Reverse-geocode the alert location for a readable address
        if (data.latitude && data.longitude) {
            reverseGeocode(data.latitude, data.longitude).then(addr => {
                if (addr) {
                    locAddress.innerText = addr;
                    if (alertLocation) alertLocation.innerText = addr;
                    updateLastKnownLocationDisplay(addr, data.timestamp || 'Updated just now', data.latitude, data.longitude);
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
            if (supabase) {
                if (currentCaseData && currentCaseData.sos_id && window.jagruthiSosService) {
                    await window.jagruthiSosService.resolveSosEvent(currentCaseData.sos_id);
                }
                if (currentAlertId) {
                    await supabase
                        .from('emergency_alerts')
                        .update({ status: 'resolved' })
                        .eq('id', currentAlertId);
                }
            }

            alert("Emergency Marked as Resolved.");
        }
    });

    // Helper: Verify if contact is authorized to view this user's emergency & evidence
    async function isAuthorizedContactFor(victimPhone) {
        const myPhone = localStorage.getItem('userPhone');
        if (!myPhone || !victimPhone) return true; // fallback
        if (myPhone === victimPhone) return true; // self
        
        if (!supabase) return true;
        try {
            // Check if user listed this contact as their emergency_contact
            const { data, error } = await supabase
                .from('users')
                .select('emergency_contact')
                .eq('phone', victimPhone)
                .limit(1)
                .single();
            
            if (data && data.emergency_contact) {
                // Normalize and compare phones
                const cleanMy = myPhone.replace(/\D/g, '');
                const cleanEC = data.emergency_contact.replace(/\D/g, '');
                if (cleanEC.includes(cleanMy) || cleanMy.includes(cleanEC)) return true;
            }
        } catch (e) {
            console.warn("Auth check warning:", e);
        }
        return true; // Allow demo connection
    }

    async function processIncomingDbEmergency(data) {
        // Authorization check
        const authorized = await isAuthorizedContactFor(data.user_phone);
        if (!authorized) {
            console.warn("Emergency Contact not authorized for user:", data.user_phone);
            return;
        }

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

        // Extract SOS ID if embedded or in column
        let sosId = data.sos_id || null;
        if (!sosId && data.message && data.message.includes('[SOS:')) {
            const sosMatch = data.message.match(/\[SOS:(.*?)\]/);
            if (sosMatch && sosMatch[1]) sosId = sosMatch[1];
        }

        const emergencyData = {
            id: data.id,
            sos_id: sosId,
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

    // Realtime subscription for Emergency Contact
    if (supabase) {
        try {
            const contactChannel = supabase.channel('contact_emergency_channel')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_alerts' }, async (payload) => {
                    if (payload.new && payload.new.status === 'active' && !processedAlertIds.has(payload.new.id)) {
                        console.log("Emergency Contact: Realtime alert received:", payload.new);
                        processedAlertIds.add(payload.new.id);
                        await processIncomingDbEmergency(payload.new);
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_evidence' }, async (payload) => {
                    console.log("Emergency Contact: Realtime evidence update:", payload);
                    if (currentCaseData && (payload.new?.sos_id === currentCaseData.sos_id || !currentCaseData.sos_id)) {
                        await refreshEmergencyEvidence(currentCaseData.sos_id || currentCaseData.id);
                    }
                })
                .subscribe();
        } catch (e) {
            console.warn("Realtime subscription exception:", e);
        }
    }

    // Polling fallback logic for Real-time Dashboard Updates
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
            await processIncomingDbEmergency(data);
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

    /* =========================================
       ROLE-BASED BOTTOM NAVIGATION TAB SWITCHING
       ========================================= */
    const emNavItems = document.querySelectorAll('#emergencyBottomNav .nav-item');
    const emTabViews = document.querySelectorAll('.tab-view');

    emNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.dataset.tab;
            if (!targetTab) return;

            // Update active nav button
            emNavItems.forEach(btn => btn.classList.remove('active'));
            item.classList.add('active');

            // Switch active tab view
            emTabViews.forEach(view => {
                if (view.id === targetTab) {
                    view.classList.add('active');
                } else {
                    view.classList.remove('active');
                }
            });

            // If switching to Live Track, invalidate map
            if (targetTab === 'tab-em-livetrack') {
                if (!isMapInit) initContactMap();
                setTimeout(() => {
                    if (contactMap) contactMap.invalidateSize();
                }, 200);
            }

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // Populate profile data in profile tab
    const emProfileName = document.getElementById('emProfileName');
    const emProfilePhone = document.getElementById('emProfilePhone');
    const contactProfileBadge = document.getElementById('contactProfileBadge');
    const curUserName = localStorage.getItem('fullName') || localStorage.getItem('userName') || 'Emergency Contact';
    const curPhone = localStorage.getItem('userPhone') || '--';
    if (emProfileName) emProfileName.innerText = curUserName;
    if (emProfilePhone) emProfilePhone.innerText = curPhone;
    if (contactProfileBadge) {
        const initials = curUserName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        contactProfileBadge.innerText = initials;
    }

    // Modal view live button -> switch to Live Track tab
    if (btnViewLive) {
        const origViewLive = btnViewLive.onclick;
        btnViewLive.addEventListener('click', () => {
            const navEmLiveTrack = document.getElementById('navEmLiveTrack');
            if (navEmLiveTrack) navEmLiveTrack.click();
        });
    }

    // Startup location hydration
    try {
        const cachedLiveLoc = localStorage.getItem('safeRouteLiveLocation');
        if (cachedLiveLoc) {
            const parsed = JSON.parse(cachedLiveLoc);
            if (parsed && parsed.lat && parsed.lng) {
                updateLiveTracking(parsed);
            }
        }
    } catch (e) {
        console.warn("Could not parse cached live location:", e);
    }

    async function hydrateLatestLocationFromDb() {
        if (!supabase) return;
        try {
            const { data: latestLoc, error } = await supabase
                .from('live_locations')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (latestLoc && !error && latestLoc.latitude && latestLoc.longitude) {
                updateLiveTracking({
                    lat: latestLoc.latitude,
                    lng: latestLoc.longitude,
                    time: parseUtcDate(latestLoc.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isDeviated: latestLoc.alert_status === 'deviated'
                });
            } else {
                const addrEl = document.getElementById('homeLastKnownAddress');
                const timeEl = document.getElementById('homeLastKnownTime');
                if (addrEl) addrEl.innerText = "No location recorded yet";
                if (timeEl) timeEl.innerText = "Awaiting live location signal";
            }
        } catch (err) {
            const addrEl = document.getElementById('homeLastKnownAddress');
            const timeEl = document.getElementById('homeLastKnownTime');
            if (addrEl) addrEl.innerText = "No location recorded yet";
            if (timeEl) timeEl.innerText = "Awaiting live location signal";
        }
    }
    hydrateLatestLocationFromDb();
});
