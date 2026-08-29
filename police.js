document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;
    
    // Auth Check
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');
    if (isLoggedIn !== 'true' || userRole !== 'police') {
        window.location.href = 'login.html';
        return;
    }

    // Populate Officer Initials
    const officerName = localStorage.getItem('fullName') || 'Officer Singh';
    const badge = document.getElementById('officerInitialsBadge');
    if (badge) {
        const initials = officerName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        badge.innerText = initials;
    }

    const policeAlertPanel = document.getElementById('policeAlertPanel');
    const policeInfoPanel = document.getElementById('policeInfoPanel');
    const policeMapPanel = document.getElementById('policeMapPanel');
    const policeContactPanel = document.getElementById('policeContactPanel');
    const policeTimelinePanel = document.getElementById('policeTimelinePanel');
    const policeActionPanel = document.getElementById('policeActionPanel');

    const polUserName = document.getElementById('polUserName');
    const polUserPhone = document.getElementById('polUserPhone');
    const polAlertType = document.getElementById('polAlertType');
    const polMessage = document.getElementById('polMessage');
    const polTime = document.getElementById('polTime');

    const infoName = document.getElementById('infoName');
    const infoPhone = document.getElementById('infoPhone');
    const infoMode = document.getElementById('infoMode');
    const infoAddress = document.getElementById('infoAddress');
    const infoLat = document.getElementById('infoLat');
    const infoLng = document.getElementById('infoLng');
    const infoRouteStatus = document.getElementById('infoRouteStatus');

    const actNotified = document.getElementById('actNotified');
    const actResponded = document.getElementById('actResponded');
    const actEscalation = document.getElementById('actEscalation');

    const policeIncidentOverlay = document.getElementById('policeIncidentOverlay');
    const policeIncidentModal = document.getElementById('policeIncidentModal');
    const popPolUserName = document.getElementById('popPolUserName');
    const popPolAlertType = document.getElementById('popPolAlertType');
    const btnAcknowledgeAlert = document.getElementById('btnAcknowledgeAlert');
    const policeAlertSound = document.getElementById('policeAlertSound');

    const activeCasesList = document.getElementById('activeCasesList');
    const activeCasesCount = document.getElementById('activeCasesCount');

    // Controls
    const btnAccept = document.getElementById('btnAccept');
    const btnDispatch = document.getElementById('btnDispatch');
    const btnNavigate = document.getElementById('btnNavigate');
    const btnMarkResolved = document.getElementById('btnMarkResolved');

    let currentCaseData = null;
    let policeMap, victimMarker, policeMarker, policeNavRoute;
    let sourceMarkerObj, destMarkerObj, routeLineObj, deviationLineObj; // Added context markers
    const policeUnitLocation = [12.9650, 77.5850]; // Mock police starting loc
    let isMapInit = false;
    // Track which Supabase alert IDs we've already processed so we don't re-trigger
    let processedAlertIds = new Set();

    function initPoliceMap() {
        if(isMapInit) return;
        isMapInit = true;
        policeMap = L.map('policeMap', {zoomControl: false}).setView([12.9716, 77.5946], 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(policeMap);
        
        const dangerIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41]
        });
        
        const policeIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
        });

        victimMarker = L.marker([12.9716, 77.5946], {icon: dangerIcon}).addTo(policeMap);
        policeMarker = L.marker(policeUnitLocation, {icon: policeIcon}).addTo(policeMap).bindPopup("Unit 4");
    }

    setTimeout(initPoliceMap, 500);

    // Listen to localStorage for simulated real-time emergency events
    console.log("Police Dashboard: Listening for emergency alerts...");
    
    window.addEventListener('storage', (e) => {
        if (e.key === 'safeRouteEmergency' && e.newValue) {
            const emergencyData = JSON.parse(e.newValue);
            if (emergencyData.status === 'ACTIVE' && emergencyData.id) {
                if (!processedAlertIds.has(emergencyData.id)) {
                    console.log("Police Dashboard: Emergency alert received via storage event!");
                    processedAlertIds.add(emergencyData.id);
                    handleIncomingCase(emergencyData);
                } else if (currentCaseData && currentCaseData.id === emergencyData.id) {
                    // Enrich case with metadata if Supabase won the race
                    currentCaseData.imageEvidence = emergencyData.imageEvidence || currentCaseData.imageEvidence;
                    currentCaseData.audioEvidence = emergencyData.audioEvidence || currentCaseData.audioEvidence;
                    currentCaseData.travelMode = emergencyData.travelMode || currentCaseData.travelMode;
                    currentCaseData.driverDetails = emergencyData.driverDetails || currentCaseData.driverDetails;
                    currentCaseData.address = emergencyData.address || currentCaseData.address;
                    
                    // Update UI if panels are open
                    if (infoMode && currentCaseData.travelMode) infoMode.innerText = currentCaseData.travelMode;
                }
            }
        }
        
        if (e.key === 'safeRouteLiveLocation' && e.newValue) {
            const liveLoc = JSON.parse(e.newValue);
            if(!isMapInit) initPoliceMap();
            const newCoords = [liveLoc.lat, liveLoc.lng];
            
            // 1. Draw Safe Route Path
            if (liveLoc.routePath && liveLoc.routePath.length > 0) {
                if (routeLineObj) policeMap.removeLayer(routeLineObj);
                routeLineObj = L.polyline(liveLoc.routePath, {color: '#10b981', weight: 6, opacity: 0.8}).addTo(policeMap);
            }

            // 2. Draw Source
            if (liveLoc.sourceLoc) {
                if (sourceMarkerObj) sourceMarkerObj.setLatLng(liveLoc.sourceLoc);
                else {
                    const srcIcon = L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', iconSize: [25, 41], iconAnchor: [12, 41]});
                    sourceMarkerObj = L.marker(liveLoc.sourceLoc, {icon: srcIcon}).addTo(policeMap).bindPopup("Victim Source").openPopup();
                }
            }

            // 3. Draw Destination
            if (liveLoc.destinationLoc) {
                if (destMarkerObj) destMarkerObj.setLatLng(liveLoc.destinationLoc);
                else {
                    const dstIcon = L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', iconSize: [25, 41], iconAnchor: [12, 41]});
                    destMarkerObj = L.marker(liveLoc.destinationLoc, {icon: dstIcon}).addTo(policeMap).bindPopup("Victim Destination");
                }
            }

            // 4. Draw Deviation Line if applicable
            if (liveLoc.isDeviated && liveLoc.deviationPoint) {
                if (deviationLineObj) policeMap.removeLayer(deviationLineObj);
                deviationLineObj = L.polyline([liveLoc.deviationPoint, newCoords], {color: '#ef4444', weight: 6, dashArray: '6,6'}).addTo(policeMap);
                
                // Update route status to show deviation
                if(infoRouteStatus) {
                    infoRouteStatus.innerText = "⚠️ Deviated";
                    infoRouteStatus.className = "text-danger";
                }
                if(infoLat) infoLat.innerText = liveLoc.lat.toFixed(4);
                if(infoLng) infoLng.innerText = liveLoc.lng.toFixed(4);
                
                // Reverse geocode the deviated location
                reverseGeocode(liveLoc.lat, liveLoc.lng).then(addr => {
                    if (addr && infoAddress) infoAddress.innerText = addr;
                });
            } else {
                if (deviationLineObj) { policeMap.removeLayer(deviationLineObj); deviationLineObj = null; }
            }

            // 5. Update Victim Position
            if(victimMarker) {
                victimMarker.setLatLng(newCoords);
                policeMap.setView(newCoords, Math.max(14, policeMap.getZoom()));
            }
            
            // If navigating, update the route dynamically
            if(policeNavRoute && policeMarker) {
                policeNavRoute.setLatLngs([policeMarker.getLatLng(), newCoords]);
            }
        }
    });

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
                console.log('Police: Pre-loaded', data.length, 'existing alert IDs. Will ignore these.');
            }
        } catch (e) {
            console.error('Failed to pre-load existing alerts:', e);
        }
    }

    // Run pre-load BEFORE starting the poller
    preloadExistingAlerts();

    // Polling logic: check Supabase every 3 seconds for ONLY NEW active alerts
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
            console.log("Police Dashboard: New alert detected via Supabase polling", data);
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

            // Re-format to match map data format expected from user tracking
            const emergencyData = {
                id: data.id,
                userName: actualUserName,
                phone: data.user_phone,
                message: data.message,
                timestamp: new Date().toLocaleTimeString(),
                alertType: data.alert_type,
                latitude: data.latitude,
                longitude: data.longitude,
                status: 'ACTIVE',
                evidence_status: data.evidence_status
            };
            
            handleIncomingCase(emergencyData);
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
                const newCoords = [data.latitude, data.longitude];
                if(victimMarker) {
                    victimMarker.setLatLng(newCoords);
                    policeMap.setView(newCoords, Math.max(14, policeMap.getZoom()));
                }
                if(policeNavRoute && policeMarker) {
                    policeNavRoute.setLatLngs([policeMarker.getLatLng(), newCoords]);
                }
                
                // Update info panel
                if(infoLat) infoLat.innerText = data.latitude;
                if(infoLng) infoLng.innerText = data.longitude;
                if(infoRouteStatus) {
                    if (data.alert_status === 'deviated') {
                        infoRouteStatus.innerText = "⚠️ Deviated";
                        infoRouteStatus.className = "text-danger";
                        // Reverse geocode the deviated location
                        reverseGeocode(data.latitude, data.longitude).then(addr => {
                            if (addr && infoAddress) infoAddress.innerText = addr;
                        });
                    } else {
                        infoRouteStatus.innerText = "On Route";
                        infoRouteStatus.className = "text-success";
                    }
                }
            }
        }, 3000);
    }

    function handleIncomingCase(data, silent = false) {
        if (!data || data.status !== 'ACTIVE') return;

        // Detect hidden evidence capture metadata in message
        if (data.message && data.message.includes('[EVD:CPT]')) {
            data.message = data.message.replace('[EVD:CPT]', '').trim();
            data.evidence_status = 'captured';
        }

        // Detect hidden travel mode metadata in message
        if (data.message && data.message.includes('[MODE:')) {
            const modeMatch = data.message.match(/\[MODE:(.*?)\]/);
            if (modeMatch && modeMatch[1]) {
                data.travelMode = modeMatch[1];
                data.message = data.message.replace(modeMatch[0], '').trim();
            }
        }

        currentCaseData = data;
        console.log("Police Dashboard: Processing incoming case", data);

        // Populate Red Alert Info — show actual user name
        if(polUserName) polUserName.innerText = data.userName || data.user_name || 'Unknown User';
        if(polUserPhone) polUserPhone.innerText = data.phone || data.user_phone || '--';
        if(polAlertType) polAlertType.innerText = (data.alertType || data.alert_type || 'SOS').toUpperCase();
        if(polMessage) polMessage.innerText = data.message;
        if(polTime) polTime.innerText = data.timestamp || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

        // Populate Info Panel
        if(infoName) infoName.innerText = data.userName || data.user_name || 'Unknown User';
        if(infoPhone) infoPhone.innerText = data.phone || data.user_phone || '--';
        if(infoMode) infoMode.innerText = data.travelMode || "Unknown";
        if(infoAddress) infoAddress.innerText = data.address || 'Fetching address...';
        if(infoLat) infoLat.innerText = data.latitude;
        if(infoLng) infoLng.innerText = data.longitude;

        // Populate Driver Details
        const policeDriverBox = document.getElementById('policeDriverBox');
        if (data.driverDetails) {
            if(policeDriverBox) policeDriverBox.style.display = 'block';
            const dName = document.getElementById('infoDriverName');
            const dPhone = document.getElementById('infoDriverPhone');
            const dCarNum = document.getElementById('infoDriverCarNum');
            const dModel = document.getElementById('infoDriverModel');
            if(dName) dName.innerText = data.driverDetails.driverName || '--';
            if(dPhone) dPhone.innerText = data.driverDetails.driverPhone || '--';
            if(dCarNum) dCarNum.innerText = data.driverDetails.driverCarNumber || '--';
            if(dModel) dModel.innerText = data.driverDetails.driverCarModel || '--';
        } else {
            if(policeDriverBox) policeDriverBox.style.display = 'none';
        }

        // Populate Evidence Status
        const evidenceBadge = document.getElementById('evidenceBadge');
        if (data.evidence_status === 'captured') {
            if(evidenceBadge) {
                evidenceBadge.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                        <div><i class="las la-camera"></i> Evidence Captured</div>
                        <button id="btnViewEvidence" style="background:#166534; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.8rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"><i class="las la-eye"></i> View</button>
                    </div>
                `;
                evidenceBadge.classList.remove('hidden');
                evidenceBadge.style.display = 'flex';
                evidenceBadge.style.alignItems = 'center';
                evidenceBadge.style.gap = '8px';
                evidenceBadge.style.background = '#dcfce7';
                evidenceBadge.style.color = '#166534';
                evidenceBadge.style.padding = '6px 12px';
                evidenceBadge.style.borderRadius = 'var(--radius-sm)';
                evidenceBadge.style.fontWeight = '600';
                evidenceBadge.style.marginTop = '12px';
                evidenceBadge.style.fontSize = '0.9rem';

                setTimeout(() => {
                    const btn = document.getElementById('btnViewEvidence');
                    if (btn) {
                        btn.onclick = () => {
                            const evdOverlay = document.getElementById('evdOverlay');
                            const evdModal = document.getElementById('evdModal');
                            const evdImg = document.getElementById('evdImage');
                            const evdAudio = document.getElementById('evdAudio');
                            // Now always access currentCaseData safely
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
                if (addr && infoAddress) infoAddress.innerText = addr;
            });
        }
        
        // Safe check for deviation-path element (may not exist in HTML)
        const deviationPathEl = document.querySelector('.deviation-path');
        if (data.alertType && data.alertType.includes("Not Safe")) {
            if(infoRouteStatus) {
                infoRouteStatus.innerText = "⚠️ Deviated";
                infoRouteStatus.className = "text-danger";
            }
            if(deviationPathEl) deviationPathEl.style.display = 'block';
        } else {
            if(infoRouteStatus) {
                infoRouteStatus.innerText = "Distress Call";
                infoRouteStatus.className = "text-danger";
            }
            if(deviationPathEl) deviationPathEl.style.display = 'none';
        }

        // Populate Contact Activity
        if(data.contactNotified && actNotified) actNotified.innerText = data.contactNotified;
        if(data.contactResponded && actResponded) actResponded.innerText = data.contactResponded;
        
        if (data.policeEscalation === "ACTIVE" || (data.alertType && data.alertType.includes("Escalated"))) {
            if(actEscalation) {
                actEscalation.innerText = "ACTIVE";
                actEscalation.className = "badge badge-red flash-subtle";
            }
        } else {
            if(actEscalation) {
                actEscalation.innerText = "PENDING";
                actEscalation.className = "badge badge-gray";
            }
        }

        // Update victim marker on map
        if(victimMarker && data.latitude && data.longitude) {
            const victimCoords = [parseFloat(data.latitude), parseFloat(data.longitude)];
            victimMarker.setLatLng(victimCoords);
            if(policeMap) policeMap.panTo(victimCoords);
        }

        // Add to active log
        updateActiveList(data);

        // Unhide all panels
        unhideDashboardPanels();
        resetTimeline();

        if (!silent) {
            if(popPolUserName) popPolUserName.innerText = data.userName || data.user_name || 'User';
            if(popPolAlertType) popPolAlertType.innerText = data.alertType || data.alert_type || 'SOS';
            if(policeIncidentOverlay) policeIncidentOverlay.classList.add('show');
            if(policeIncidentModal) policeIncidentModal.classList.add('show');

            try {
                if(policeAlertSound) policeAlertSound.play().catch(e => console.log("Audio autoplay blocked"));
            } catch (err) {}
        }

        console.log("Police Dashboard: Alert displayed successfully for", data.userName);
    }

    function unhideDashboardPanels() {
        policeAlertPanel.classList.remove('hidden');
        policeInfoPanel.classList.remove('hidden');
        policeMapPanel.classList.remove('hidden');
        policeContactPanel.classList.remove('hidden');
        policeTimelinePanel.classList.remove('hidden');
        policeActionPanel.classList.remove('hidden');
        
        // Leaflet needs to recalculate size when parent container goes from display:none -> block
        setTimeout(() => {
            if (policeMap) {
                policeMap.invalidateSize();
                if (victimMarker) {
                    policeMap.panTo(victimMarker.getLatLng());
                }
            }
        }, 100);
    }

    function hideDashboardPanels() {
        policeAlertPanel.classList.add('hidden');
        policeInfoPanel.classList.add('hidden');
        policeMapPanel.classList.add('hidden');
        policeContactPanel.classList.add('hidden');
        policeTimelinePanel.classList.add('hidden');
        policeActionPanel.classList.add('hidden');
    }

    function updateActiveList(data) {
        // Clear placeholder if it exists
        if (activeCasesList.querySelector('p')) {
            activeCasesList.innerHTML = '';
        }

        // Prepend to list
        const html = `
            <div class="queue-item" id="queue-${data.id}">
                <div class="queue-icon bg-danger-light text-danger" style="background:#fee2e2; color:#ef4444;">
                    <i class="las la-exclamation-triangle"></i>
                </div>
                <div class="queue-info">
                    <h4>${data.userName || data.user_name || 'Unknown'}</h4>
                    <p>${data.latitude}, ${data.longitude} • ${data.timestamp}</p>
                </div>
                <div class="queue-status">
                    <span class="badge badge-active-case">HIGH</span>
                </div>
            </div>
        `;
        activeCasesList.insertAdjacentHTML('afterbegin', html);
        
        // Dynamic count
        const count = activeCasesList.querySelectorAll('.queue-item').length;
        activeCasesCount.innerText = `${count} Active`;
    }

    btnAcknowledgeAlert.addEventListener('click', () => {
        policeIncidentOverlay.classList.remove('show');
        policeIncidentModal.classList.remove('show');
        policeAlertSound.pause();
        policeAlertSound.currentTime = 0;
        
        // Auto navigate gently
        document.querySelector('.queue-section').scrollIntoView({ behavior: 'smooth' });
    });

    // Action Controls
    btnAccept.addEventListener('click', async () => {
        setTimelineStep(2);
        btnAccept.disabled = true;
        btnAccept.innerHTML = '<i class="las la-check-double"></i><span>Accepted</span>';
        
        // Broadcast change
        const dataStr = localStorage.getItem('safeRouteEmergency');
        if(dataStr) {
            const d = JSON.parse(dataStr);
            d.policeEscalation = "ACCEPTED";
            localStorage.setItem('safeRouteEmergency', JSON.stringify(d));
            // Dispatch event for other tabs
            window.dispatchEvent(new StorageEvent('storage', { key: 'safeRouteEmergency', newValue: JSON.stringify(d) }));
        }
        
        if (supabase && currentCaseData && currentCaseData.id) {
            await supabase.from('emergency_alerts').update({ police_escalation: 'ACCEPTED' }).eq('id', currentCaseData.id);
        }

        alert("Case Accepted. Officer assigned.");
    });

    btnDispatch.addEventListener('click', async () => {
        setTimelineStep(3);
        btnDispatch.disabled = true;
        btnDispatch.innerHTML = '<i class="las la-siren"></i><span>Dispatched</span>';
        
        // Broadcast change
        const dataStr = localStorage.getItem('safeRouteEmergency');
        if(dataStr) {
            const d = JSON.parse(dataStr);
            d.policeEscalation = "ACTIVE";
            localStorage.setItem('safeRouteEmergency', JSON.stringify(d));
            window.dispatchEvent(new StorageEvent('storage', { key: 'safeRouteEmergency', newValue: JSON.stringify(d) }));
        }

        if (supabase && currentCaseData && currentCaseData.id) {
            await supabase.from('emergency_alerts').update({ police_escalation: 'ACTIVE' }).eq('id', currentCaseData.id);
        }

        alert("Emergency Response Team Dispatched to location.");
    });

    btnNavigate.addEventListener('click', () => {
        if(victimMarker && policeMap && policeMarker) {
            if(policeNavRoute) policeMap.removeLayer(policeNavRoute);
            policeNavRoute = L.polyline([policeMarker.getLatLng(), victimMarker.getLatLng()], {color: '#1e3a8a', weight: 5, dashArray: '8,8'}).addTo(policeMap);
            policeMap.fitBounds(policeNavRoute.getBounds(), {padding: [30, 30]});
            btnNavigate.innerHTML = '<i class="las la-location-arrow"></i><span>Navigating...</span>';
            btnNavigate.style.background = '#eab308';
            alert("Guidance system active. Navigating Unit to Victim's live location.");
        }
    });

    const reportModal = document.getElementById('caseReportModal');
    const reportOverlay = document.getElementById('reportOverlay');
    const reportText = document.getElementById('caseReportText');
    const btnSubmitReport = document.getElementById('btnSubmitReport');
    const btnCancelReport = document.getElementById('btnCancelReport');

    btnMarkResolved.addEventListener('click', () => {
        // Instead of immediate resolve, show the report modal
        reportOverlay.classList.add('show');
        reportModal.classList.add('show');
    });

    btnCancelReport.addEventListener('click', () => {
        reportOverlay.classList.remove('show');
        reportModal.classList.remove('show');
    });

    btnSubmitReport.addEventListener('click', async () => {
        const actionTaken = reportText.value.trim();
        if(!actionTaken) {
            alert("Please provide a brief report on the action taken.");
            return;
        }

        // Close modal
        reportOverlay.classList.remove('show');
        reportModal.classList.remove('show');

        // Proceed with resolve
        setTimelineStep(4);
        
        // Sync storage
        const dataStr = localStorage.getItem('safeRouteEmergency');
        if(dataStr) {
            const d = JSON.parse(dataStr);
            d.status = "RESOLVED";
            d.resolution_report = actionTaken;
            localStorage.setItem('safeRouteEmergency', JSON.stringify(d));
        }

        // Sync to Supabase
        if (supabase && currentCaseData && currentCaseData.id) {
            await supabase
                .from('emergency_alerts')
                .update({ 
                    status: 'resolved',
                    message: `[RESOLVED] Action Taken: ${actionTaken}` // Appending report to message to keep "dont change working" (no schema change)
                })
                .eq('id', currentCaseData.id);
        }

        setTimeout(() => {
            hideDashboardPanels();
            
            // Remove from queue visually
            const item = document.getElementById(`queue-${currentCaseData.id}`);
            if (item) item.remove();
            
            // Dynamic count
            const count = activeCasesList.querySelectorAll('.queue-item').length;
            if(activeCasesCount) activeCasesCount.innerText = `${count} Active`;
            
            // Show placeholder if empty
            if (count === 0 && activeCasesList) {
                activeCasesList.innerHTML = `<p style="color: #94a3b8; font-size: 0.9rem;">No active emergencies.</p>`;
            }
            
            alert("Case Closed. Report filed in records.");
            reportText.value = ''; // clear for next use
        }, 800);
    });

    function setTimelineStep(stepNum) {
        document.querySelectorAll('.time-step').forEach((el, index) => {
            const stepIndex = index + 1;
            if(stepIndex < stepNum) {
                el.className = "time-step completed";
            } else if (stepIndex === stepNum) {
                el.className = "time-step active";
            } else {
                el.className = "time-step pending";
            }
        });
    }

    function resetTimeline() {
        setTimelineStep(1);
        btnAccept.disabled = false;
        btnAccept.innerHTML = '<i class="las la-check-circle"></i><span>Accept Case</span>';
        btnDispatch.disabled = false;
        btnDispatch.innerHTML = '<i class="las la-siren"></i><span>Dispatch Team</span>';
    }

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
