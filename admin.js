document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.supabaseClient;
    
    // Auth Check
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userRole = localStorage.getItem('userRole');
    if (isLoggedIn !== 'true' || userRole !== 'admin') {
        window.location.href = 'login.html';
        return;
    }

    // === Admin Initials Badge ===
    const adminName = localStorage.getItem('fullName') || 'Admin';
    const adminBadge = document.getElementById('adminInitialsBadge');
    if (adminBadge) {
        const initials = adminName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        adminBadge.innerText = initials;
    }

    // === Notification Bell Dropdown ===
    let notifCount = 0;
    const adminBellBtn = document.getElementById('adminBellBtn');
    const adminNotifDropdown = document.getElementById('adminNotifDropdown');
    const adminNotifCount = document.getElementById('adminNotifCount');
    const adminNotifList = document.getElementById('adminNotifList');
    const notifClearBtn = document.getElementById('notifClearBtn');

    if (adminBellBtn) {
        adminBellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            adminNotifDropdown.classList.toggle('hidden');
        });
    }
    document.addEventListener('click', () => {
        if (adminNotifDropdown) adminNotifDropdown.classList.add('hidden');
    });
    if (notifClearBtn) {
        notifClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notifCount = 0;
            adminNotifList.innerHTML = '<div class="notif-empty"><i class="las la-check-circle"></i> All clear</div>';
            if (adminNotifCount) { adminNotifCount.innerText = '0'; adminNotifCount.style.display = 'none'; }
        });
    }

    function pushAdminNotification(message, type = 'warning') {
        notifCount++;
        if (adminNotifCount) {
            adminNotifCount.innerText = notifCount;
            adminNotifCount.style.display = 'flex';
        }
        if (adminNotifList) {
            const empty = adminNotifList.querySelector('.notif-empty');
            if (empty) empty.remove();
            const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const item = document.createElement('div');
            item.className = `notif-item notif-${type}`;
            item.innerHTML = `
                <div class="notif-icon"><i class="las la-${type === 'warning' ? 'exclamation-circle' : 'siren'}"></i></div>
                <div class="notif-body">
                    <div class="notif-msg">${message}</div>
                    <div class="notif-time">${time}</div>
                </div>
            `;
            adminNotifList.insertAdjacentElement('afterbegin', item);
        }
    }

    const adminNotifBadge = document.getElementById('adminNotifBadge');
    const statActive = document.getElementById('statActive');
    const statResolved = document.getElementById('statResolved');
    const adminActiveEmergencies = document.getElementById('adminActiveEmergencies');
    const adminEmptyState = document.getElementById('adminEmptyState');
    const adminTimelineWrapper = document.getElementById('adminTimelineWrapper');
    const adminTimeline = document.getElementById('adminTimeline');
    const adminIncidentOverlay = document.getElementById('adminIncidentOverlay');
    const adminIncidentModal = document.getElementById('adminIncidentModal');
    const admPopupUser = document.getElementById('admPopupUser');
    const admPopupType = document.getElementById('admPopupType');
    const admPopupLoc = document.getElementById('admPopupLoc');
    const btnAdminAcknowledge = document.getElementById('btnAdminAcknowledge');

    // Closed cases archive section
    const closedCasesSection = document.getElementById('closedCasesSection');
    const closedCasesList = document.getElementById('closedCasesList');

    let totalActive = 0;
    let resolvedCount = 0;
    const policeMonitors = new Map();

    // =====================================================
    // FEATURE 2: Fetch real user details from Supabase
    // =====================================================
    async function fetchUserDetails(phone) {
        if (!supabase || !phone) return null;
        try {
            const { data, error } = await supabase
                .from('users')
                .select('full_name, phone')
                .eq('phone', phone)
                .limit(1)
                .single();
            if (data && !error) return data;
        } catch(e) {}
        return null;
    }

    async function fetchGlobalStats() {
        if (!supabase) return;

        // Real user count (role = 'user')
        const { count: userCount } = await supabase
            .from('users').select('*', { count: 'exact', head: true }).eq('role', 'user');
        document.getElementById('statTotalUsers').innerText = userCount ?? 0;

        // Real resolved count
        const { count: resolved } = await supabase
            .from('emergency_alerts').select('*', { count: 'exact', head: true }).eq('status', 'resolved');
        resolvedCount = resolved || 0;
        statResolved.innerText = resolvedCount;

        // Real police unit count (role = 'police')
        const { count: policeCount } = await supabase
            .from('users').select('*', { count: 'exact', head: true }).eq('role', 'police');
        document.getElementById('statPoliceCount').innerText = policeCount ?? 0;

        // Real active contacts count
        const { count: contactCount } = await supabase
            .from('emergency_contacts').select('*', { count: 'exact', head: true });
        document.getElementById('statContactCount').innerText = contactCount ?? 0;

        // Real active alerts count
        const { count: activeCount } = await supabase
            .from('emergency_alerts').select('*', { count: 'exact', head: true }).eq('status', 'active');
        if (statActive) statActive.innerText = activeCount ?? 0;
    }

    fetchGlobalStats();
    let adminMap, liveAlertMarker;
    let isMapInit = false;

    function initAdminMap() {
        if(isMapInit) return;
        isMapInit = true;
        adminMap = L.map('adminMap', {zoomControl: false}).setView([12.9716, 77.5946], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(adminMap);
        const policeIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
        const userIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
        L.marker([12.9650, 77.5850], {icon: policeIcon}).addTo(adminMap).bindPopup("Police Unit 4");
        L.marker([12.9800, 77.6000], {icon: userIcon}).addTo(adminMap).bindPopup("Safe User");
        L.marker([12.9500, 77.5900], {icon: userIcon}).addTo(adminMap).bindPopup("Safe User");
    }
    setTimeout(initAdminMap, 500);

    window.addEventListener('storage', (e) => {
        if (e.key === 'safeRouteEmergency' && e.newValue) {
            const data = JSON.parse(e.newValue);
            handleSystemUpdate(data);
        }
        if (e.key === 'safeRouteLiveLocation' && e.newValue) {
            const liveLoc = JSON.parse(e.newValue);
            if(!isMapInit) initAdminMap();
            // Ensure ID is marked as known if received via storage event
            if (liveLoc.id) knownAlerts.add(liveLoc.id);
            const newCoords = [liveLoc.lat, liveLoc.lng];
            if(!liveAlertMarker) {
                const dangerIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
                liveAlertMarker = L.marker(newCoords, {icon: dangerIcon}).addTo(adminMap).bindPopup("ACTIVE EMERGENCY");
            } else {
                liveAlertMarker.setLatLng(newCoords);
            }
        }
    });

    let knownAlerts = new Set();
    let alertMarkers = {};
    let isFirstPoll = true;

    setInterval(async () => {
        if (!supabase) return;
        const { data: activeAlerts, error: alertError } = await supabase
            .from('emergency_alerts')
            .select('*')
            .eq('status', 'active');

        if (activeAlerts && !alertError) {
            totalActive = activeAlerts.length;
            statActive.innerText = totalActive;
            if (totalActive > 0) {
                if(adminNotifBadge) adminNotifBadge.style.display = 'block';
                adminEmptyState.style.display = 'none';
            } else {
                adminEmptyState.style.display = 'block';
            }

            for (const alert of activeAlerts) {
                if (!knownAlerts.has(alert.id)) {
                    knownAlerts.add(alert.id);
                    handleSystemUpdate({
                        ...alert,
                        userName: alert.user_phone,
                        status: 'ACTIVE',
                        timestamp: new Date(alert.created_at).toLocaleTimeString(),
                        alertType: alert.alert_type
                    }, isFirstPoll);
                }

                // Live police status check
                const policeStatus = alert.police_escalation || 'PENDING';
                
                // CRITICAL: Pulse the badge if status changed to ACCEPTED/ACTIVE
                const existingBadge = document.getElementById(`police-status-${alert.id}`);
                const oldContent = existingBadge?.innerText || '';
                
                updatePoliceStatusBadge(alert.id, policeStatus);
                
                // Visual feedback for status change
                const newBadge = document.getElementById(`police-status-${alert.id}`);
                if (newBadge && oldContent && !newBadge.innerText.includes(oldContent)) {
                    newBadge.classList.add('pulse-highlight');
                    setTimeout(() => newBadge.classList.remove('pulse-highlight'), 2000);
                }

                if (alert.police_escalation === 'ACCEPTED' || alert.police_escalation === 'ACTIVE') {
                    if (policeMonitors.has(alert.id)) {
                        const monitor = policeMonitors.get(alert.id);
                        if (!monitor.resolved) {
                            monitor.resolved = true;
                            clearInterval(monitor.timer);
                            addTimelineEntry(`Police accepted and responded to the case.`, 'success');
                        }
                    }
                }

                const { data: latestLoc } = await supabase
                    .from('live_locations')
                    .select('*')
                    .eq('user_phone', alert.user_phone)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                if (latestLoc) updateGlobalMarker(alert.id, [latestLoc.latitude, latestLoc.longitude], alert.alert_type);
            }
        }

        const { count: res } = await supabase.from('emergency_alerts').select('*', { count: 'exact', head: true }).eq('status', 'resolved');
        if (res !== null) statResolved.innerText = res;
        isFirstPoll = false;

        // Refresh analytics dashboard on each poll
        buildAnalyticsDashboard();
    }, 5000);

    function updateGlobalMarker(alertId, coords, type) {
        if (!isMapInit) initAdminMap();
        if (alertMarkers[alertId]) {
            alertMarkers[alertId].setLatLng(coords);
        } else {
            const dangerIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
            alertMarkers[alertId] = L.marker(coords, {icon: dangerIcon}).addTo(adminMap).bindPopup(`ACTIVE SOS: ${type}`);
        }
    }

    function updatePoliceStatusBadge(alertId, status) {
        const badge = document.getElementById(`police-status-${alertId}`);
        if (!badge) return;
        if (status === 'ACCEPTED' || status === 'ACTIVE') {
            badge.innerHTML = `<i class="las la-check-circle"></i> Police Responded`;
            badge.className = 'admin-police-badge badge-police-ok';
        } else if (status === 'ESCALATED') {
            badge.innerHTML = `<i class="las la-siren"></i> Escalated to Nearest Station`;
            badge.className = 'admin-police-badge badge-police-escalate';
        } else {
            badge.innerHTML = `<i class="las la-clock"></i> Awaiting Police Response`;
            badge.className = 'admin-police-badge badge-police-pending';
        }
    }

    function startPoliceResponseMonitor(alertId, alertData) {
        if (policeMonitors.has(alertId)) return;
        let attemptCount = 0;
        let escalateTimer = null;
        
        // Wait exactly 2 minutes (120000ms) before sending 3 re-alerts
        const InitialWait = 120000;
        const ReAlertInterval = 5000; // 5 seconds between the 3 fast alerts for visibility
        
        const initialTimer = setTimeout(async () => {
            let policeStatus = null;
            if (supabase) {
                const { data } = await supabase.from('emergency_alerts').select('police_escalation').eq('id', alertId).single();
                policeStatus = data?.police_escalation;
            }
            const monitor = policeMonitors.get(alertId);
            if (monitor?.resolved) return;
            if (policeStatus === 'ACCEPTED' || policeStatus === 'ACTIVE') return;
            
            // Re-alert phase
            escalateTimer = setInterval(async () => {
                policeStatus = null;
                if (supabase) {
                    const { data } = await supabase.from('emergency_alerts').select('police_escalation').eq('id', alertId).single();
                    policeStatus = data?.police_escalation;
                }
                const currentMonitor = policeMonitors.get(alertId);
                if (currentMonitor?.resolved || policeStatus === 'ACCEPTED' || policeStatus === 'ACTIVE') {
                    clearInterval(escalateTimer);
                    return;
                }
                
                attemptCount++;
                if (attemptCount <= 3) firePoliceReAlert(alertId, alertData, attemptCount);
                if (attemptCount >= 3) {
                    clearInterval(escalateTimer);
                    if (currentMonitor) currentMonitor.resolved = true;
                    escalateToNearestStation(alertId, alertData);
                }
            }, ReAlertInterval);
            
        }, InitialWait);

        policeMonitors.set(alertId, { timer: initialTimer, escalateTimer, resolved: false });
    }

    function firePoliceReAlert(alertId, alertData, attempt) {
        const msg = `⚠️ Re-Alert #${attempt}: No police response for ${alertData.userName || alertData.user_phone}'s SOS.`;
        addTimelineEntry(msg, 'danger');
        // Push to notification bell
        pushAdminNotification(`Re-Alert #${attempt}: Police hasn't responded to ${alertData.userName || alertData.user_phone}`, 'warning');
        updatePoliceStatusBadge(alertId, 'PENDING');
        const card = document.getElementById(`admCard-${alertId}`);
        if (card) {
            const existing = card.querySelector('.re-alert-warning');
            if (existing) existing.remove();
            const warn = document.createElement('div');
            warn.className = 're-alert-warning';
            warn.innerHTML = `<i class="las la-exclamation-circle"></i> Re-Alert ${attempt}/3 sent — Station hasn't responded yet.`;
            card.appendChild(warn);
        }
    }

    function escalateToNearestStation(alertId, alertData) {
        addTimelineEntry(`🚔 ESCALATION: Case escalated to nearest available police station after 3 failed re-alerts.`, 'danger');
        // Push critical notification to bell
        pushAdminNotification(`🚔 ESCALATION: ${alertData.userName || alertData.user_phone}'s case escalated to nearest station!`, 'danger');
        updatePoliceStatusBadge(alertId, 'ESCALATED');
        const card = document.getElementById(`admCard-${alertId}`);
        if (card) {
            const existing = card.querySelector('.re-alert-warning');
            if (existing) existing.remove();
            const esc = document.createElement('div');
            esc.className = 'escalation-notice';
            esc.innerHTML = `<i class="las la-siren"></i> <strong>ESCALATED</strong> to Nearest Police Station`;
            card.appendChild(esc);
        }
        if (supabase) {
            supabase.from('emergency_alerts').update({ police_escalation: 'ESCALATED' }).eq('id', alertId);
        }
    }

    function addTimelineEntry(text, type) {
        adminTimelineWrapper.classList.remove('hidden');
        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const entry = document.createElement('div');
        entry.className = `tl-item tl-${type}`;
        entry.innerHTML = `<div class="tl-time">${time}</div><div class="tl-content">${text}</div>`;
        adminTimeline.insertAdjacentElement('afterbegin', entry);
    }

    function generateTimeline(data) {
        adminTimeline.innerHTML = '';
        addTimelineEntry(`SOS signal registered by system (${data.alertType || 'Emergency'}).`, 'danger');
    }

    const existingEmerg = localStorage.getItem('safeRouteEmergency');
    if (existingEmerg) {
        const data = JSON.parse(existingEmerg);
        handleSystemUpdate(data, true);
    }

    function handleSystemUpdate(data, silent = false) {
        if (data.message && data.message.includes('[EVD:CPT]')) {
            data.message = data.message.replace('[EVD:CPT]', '').trim();
            data.evidence_status = 'captured';
        }
        const existingCard = document.getElementById(`admCard-${data.id}`);
        if(existingCard && data.status === 'ACTIVE') {
            // If it already exists and is active, just return to avoid flickering/duplicates
            knownAlerts.add(data.id);
            return;
        }

        if(existingCard) {
            existingCard.remove();
            totalActive = Math.max(0, totalActive - 1);
        }

        if (data.status === 'ACTIVE') {
            knownAlerts.add(data.id);
            totalActive++;
            if(adminNotifBadge) adminNotifBadge.style.display = 'block';
            adminEmptyState.style.display = 'none';
            renderActiveEmergencyUI(data);
            generateTimeline(data);
            if (data.user_phone || data.phone) enrichCardWithUserDetails(data.id, data.user_phone || data.phone);
            if (data.id && !policeMonitors.has(data.id)) startPoliceResponseMonitor(data.id, data);
            if(!silent) showAdminPopup(data);

        } else if (data.status === 'RESOLVED') {
            // Stop monitor
            if (data.id && policeMonitors.has(data.id)) {
                const monitor = policeMonitors.get(data.id);
                monitor.resolved = true;
                clearTimeout(monitor.timer);
                clearInterval(monitor.escalateTimer);
            }
            if(liveAlertMarker && adminMap) {
                adminMap.removeLayer(liveAlertMarker);
                liveAlertMarker = null;
            }
            resolvedCount++;
            statResolved.innerText = resolvedCount;

            // FEATURE 2: Add compact closed case entry
            addClosedCaseEntry(data);

            if(totalActive === 0) {
                adminEmptyState.style.display = 'block';
                if(adminNotifBadge) adminNotifBadge.style.display = 'none';
                adminTimelineWrapper.classList.add('hidden');
            }
        }
        statActive.innerText = totalActive;
    }

    // =====================================================
    // FEATURE 2: Compact Closed Case Archive
    // =====================================================
    function addClosedCaseEntry(data) {
        if (!closedCasesSection || !closedCasesList) return;
        closedCasesSection.classList.remove('hidden');

        const shortId = data.id ? String(data.id).slice(0, 8).toUpperCase() : 'N/A';
        const location = (data.latitude && data.longitude)
            ? `${parseFloat(data.latitude).toFixed(4)}, ${parseFloat(data.longitude).toFixed(4)}`
            : 'Location unavailable';
        const time = data.timestamp || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        const entry = document.createElement('div');
        entry.className = 'closed-case-entry';
        entry.innerHTML = `
            <div class="cc-id"><i class="las la-hashtag"></i> ${shortId}</div>
            <div class="cc-loc"><i class="las la-map-marker"></i> ${location}</div>
            <div class="cc-time"><i class="las la-clock"></i> ${time}</div>
        `;
        closedCasesList.insertAdjacentElement('afterbegin', entry);
    }

    async function enrichCardWithUserDetails(alertId, phone) {
        const userDetails = await fetchUserDetails(phone);
        const nameEl = document.getElementById(`adm-name-${alertId}`);
        const phoneLabelEl = document.getElementById(`adm-phone-${alertId}`);
        if (userDetails && userDetails.full_name) {
            if (nameEl) nameEl.innerText = userDetails.full_name;
            if (phoneLabelEl) phoneLabelEl.innerText = userDetails.phone || phone;
        } else {
            if (nameEl) nameEl.innerText = phone;
        }
    }

    // =====================================================
    // FEATURE 1: Render card with ADMIN-ONLY delete button
    // =====================================================
    function renderActiveEmergencyUI(data) {
        const phone = data.user_phone || data.phone || '--';
        const policeStatus = data.policeEscalation || data.police_escalation || 'PENDING';
        const evidenceHtml = data.evidence_status === 'captured'
            ? `<div class="adm-evidence-pill"><i class="las la-shield-alt"></i> Evidence Shield Active</div>` : '';

        const cardHtml = `
            <div class="live-alert-item" id="admCard-${data.id}">
                <div class="live-alert-header">
                    <div class="live-alert-title">
                        <i class="las la-exclamation-triangle pulse-icon-danger"></i>
                        ${data.alertType || data.alert_type || 'SOS'}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="badge badge-danger">LIVE</span>
                        <button class="admin-dismiss-btn" onclick="adminDismissCard('${data.id}', this)" title="Remove from admin view only">
                            <i class="las la-times"></i> Dismiss
                        </button>
                    </div>
                </div>

                <div class="adm-user-details-grid">
                    <div class="adm-detail-item">
                        <span class="adm-label">Name</span>
                        <strong id="adm-name-${data.id}">Loading...</strong>
                    </div>
                    <div class="adm-detail-item">
                        <span class="adm-label">Phone</span>
                        <strong id="adm-phone-${data.id}">${phone}</strong>
                    </div>
                    <div class="adm-detail-item">
                        <span class="adm-label">Time</span>
                        <strong>${data.timestamp || new Date().toLocaleTimeString()}</strong>
                    </div>
                    <div class="adm-detail-item">
                        <span class="adm-label">Contact</span>
                        <strong>${data.contactNotified || 'Notified'}</strong>
                    </div>
                    <div class="adm-detail-item adm-detail-full">
                        <span class="adm-label">Location</span>
                        <strong class="adm-coords">${data.latitude ? `${parseFloat(data.latitude).toFixed(4)}, ${parseFloat(data.longitude).toFixed(4)}` : '--'}</strong>
                    </div>
                    <div class="adm-detail-item adm-detail-full">
                        <span class="adm-label">Message</span>
                        <strong class="adm-message-val">${data.message || '--'}</strong>
                    </div>
                </div>

                <div class="adm-police-monitor">
                    <div class="adm-monitor-label"><i class="las la-shield-alt"></i> Police Response Status</div>
                    <div class="admin-police-badge badge-police-pending" id="police-status-${data.id}">
                        <i class="las la-clock"></i> Awaiting Police Response
                    </div>
                </div>
                ${evidenceHtml}
            </div>
        `;
        adminActiveEmergencies.insertAdjacentHTML('afterbegin', cardHtml);
        updatePoliceStatusBadge(data.id, policeStatus);
    }

    // FEATURE 1: Admin-only dismiss — NO Supabase changes, police/emergency unaffected
    window.adminDismissCard = function(alertId, btn) {
        const card = document.getElementById(`admCard-${alertId}`);
        if (!card) return;
        if (!confirm('Remove this alert from admin view only?\n\n(This does NOT affect police or emergency dashboards — they continue normally.)')) return;
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(40px)';
        setTimeout(() => {
            card.remove();
            totalActive = Math.max(0, totalActive - 1);
            statActive.innerText = totalActive;
            if (adminActiveEmergencies.querySelectorAll('.live-alert-item').length === 0) {
                adminEmptyState.style.display = 'block';
            }
        }, 300);
        // Cancel police monitor for visual purposes only (police dashboard still running)
        if (policeMonitors.has(alertId)) {
            const monitor = policeMonitors.get(alertId);
            monitor.resolved = true;
            clearInterval(monitor.timer);
        }
    };

    function generateTimeline(data) {
        adminTimelineWrapper.classList.remove('hidden');
        adminTimeline.innerHTML = '';
        const tlSteps = [
            { time: "T-0", text: `Alert Triggered by ${data.userName || data.user_phone}`, type: "danger" },
            { time: "T+1s", text: `Emergency Contact Notified`, type: "success" }
        ];
        if (data.contactResponded === 'YES') tlSteps.push({ time: "T+5m", text: "Contact Read Receipt", type: "success" });
        const alertType = data.alertType || data.alert_type || '';
        if (alertType.includes("Escalated") || data.policeEscalation === "ACTIVE") {
            tlSteps.push({ time: "T+6m", text: "Police Node Escalation Activated", type: "danger" });
        } else {
            tlSteps.push({ time: "Pending", text: "Police Response Pending — Monitor Active", type: "active" });
        }
        let tlHtml = '';
        tlSteps.forEach(s => {
            tlHtml += `<div class="tl-item tl-${s.type}"><div class="tl-time">${s.time}</div><div class="tl-content">${s.text}</div></div>`;
        });
        adminTimeline.innerHTML = tlHtml;
    }

    function showAdminPopup(data) {
        admPopupUser.innerText = data.userName || data.user_phone || '--';
        admPopupType.innerText = data.alertType || data.alert_type || 'SOS';
        admPopupLoc.innerText = data.latitude ? `${parseFloat(data.latitude).toFixed(4)}, ${parseFloat(data.longitude).toFixed(4)}` : '--';
        const popupPhone = document.getElementById('admPopupPhone');
        const popupMsg = document.getElementById('admPopupMsg');
        if (popupPhone) popupPhone.innerText = data.user_phone || data.phone || '--';
        if (popupMsg) popupMsg.innerText = data.message || '--';
        adminIncidentOverlay.classList.add('show');
        adminIncidentModal.classList.add('show');
        const audio = document.getElementById('adminAlertSound');
        try { audio.play().catch(e => {}); } catch(err) {}
        const phone = data.user_phone || data.phone;
        if (phone && supabase) {
            fetchUserDetails(phone).then(u => { if (u?.full_name) admPopupUser.innerText = u.full_name; });
        }
    }

    btnAdminAcknowledge.addEventListener('click', () => {
        adminIncidentOverlay.classList.remove('show');
        adminIncidentModal.classList.remove('show');
        const audio = document.getElementById('adminAlertSound');
        audio.pause();
        audio.currentTime = 0;
    });

    // =====================================================
    // FEATURE 3: Live Analytics Dashboard
    // =====================================================
    async function buildAnalyticsDashboard() {
        if (!supabase) return;

        const { data: allAlerts, error } = await supabase
            .from('emergency_alerts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error || !allAlerts) return;

        renderDailyTrend(allAlerts);
        renderAlertTypeBreakdown(allAlerts);
        renderDangerZones(allAlerts);
        renderHourlyPattern(allAlerts);
        renderAnalyticsSummary(allAlerts);
    }

    function renderAnalyticsSummary(alerts) {
        const totalEl = document.getElementById('analTotal');
        const weekEl = document.getElementById('analWeek');
        const peakEl = document.getElementById('analPeak');
        if (!totalEl) return;

        const now = new Date();
        const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);
        const thisWeek = alerts.filter(a => new Date(a.created_at) >= weekAgo);

        // Find peak hour
        const hourCounts = {};
        alerts.forEach(a => {
            const h = new Date(a.created_at).getHours();
            hourCounts[h] = (hourCounts[h] || 0) + 1;
        });
        const peakHour = Object.entries(hourCounts).sort((a,b) => b[1]-a[1])[0];
        const peakLabel = peakHour ? `${peakHour[0] > 12 ? peakHour[0]-12 : peakHour[0]}${peakHour[0] >= 12 ? 'PM' : 'AM'}` : '--';

        if (totalEl) totalEl.innerText = alerts.length;
        if (weekEl) weekEl.innerText = thisWeek.length;
        if (peakEl) peakEl.innerText = peakLabel;
    }

    function renderDailyTrend(alerts) {
        const container = document.getElementById('dailyTrendChart');
        if (!container) return;

        // Last 7 days
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push({ label: d.toLocaleDateString('en-US', {weekday:'short'}), dateStr: d.toISOString().split('T')[0], count: 0 });
        }

        alerts.forEach(a => {
            const dateStr = new Date(a.created_at).toISOString().split('T')[0];
            const day = days.find(d => d.dateStr === dateStr);
            if (day) day.count++;
        });

        const maxCount = Math.max(...days.map(d => d.count), 1);

        container.innerHTML = days.map(d => {
            const pct = Math.round((d.count / maxCount) * 100);
            const colorClass = d.count === 0 ? '#e2e8f0' : d.count >= 3 ? '#ef4444' : d.count >= 1 ? '#f59e0b' : '#10b981';
            return `
                <div class="trend-bar-group">
                    <div class="trend-bar-wrap">
                        <div class="trend-count">${d.count || ''}</div>
                        <div class="trend-bar" style="height:${Math.max(pct, 4)}%; background:${colorClass};"></div>
                    </div>
                    <div class="trend-label">${d.label}</div>
                </div>
            `;
        }).join('');
    }

    function renderAlertTypeBreakdown(alerts) {
        const container = document.getElementById('alertTypeChart');
        if (!container) return;

        const types = {};
        alerts.forEach(a => {
            const t = a.alert_type || 'Unknown';
            types[t] = (types[t] || 0) + 1;
        });

        const total = alerts.length || 1;
        const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

        container.innerHTML = Object.entries(types)
            .sort((a,b) => b[1]-a[1])
            .slice(0, 5)
            .map(([type, count], i) => {
                const pct = Math.round((count / total) * 100);
                return `
                    <div class="type-row">
                        <div class="type-dot" style="background:${colors[i % colors.length]};"></div>
                        <div class="type-name">${type}</div>
                        <div class="type-bar-track">
                            <div class="type-bar-fill" style="width:${pct}%; background:${colors[i % colors.length]};"></div>
                        </div>
                        <div class="type-count">${count}</div>
                    </div>
                `;
            }).join('') || '<p style="color:#94a3b8;font-size:0.85rem;">No data yet</p>';
    }

    const zoneNameCache = {};

    async function renderDangerZones(alerts) {
        const container = document.getElementById('dangerZonesList');
        if (!container) return;

        // Group by rounded lat/lng (≈1km grid)
        const zones = {};
        alerts.forEach(a => {
            if (!a.latitude || !a.longitude) return;
            const key = `${parseFloat(a.latitude).toFixed(2)},${parseFloat(a.longitude).toFixed(2)}`;
            zones[key] = (zones[key] || 0) + 1;
        });

        const sorted = Object.entries(zones).sort((a,b) => b[1]-a[1]).slice(0, 5);

        if (sorted.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;">No location data yet</p>';
            return;
        }

        const maxZone = sorted[0][1] || 1;
        let htmlChunks = [];
        
        for (let i = 0; i < sorted.length; i++) {
            const [coords, count] = sorted[i];
            const [lat, lon] = coords.split(',');
            let displayLoc = coords;

            if (zoneNameCache[coords]) {
                displayLoc = zoneNameCache[coords];
            } else {
                try {
                    const res = await fetch(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`);
                    const data = await res.json();
                    if (data.features && data.features.length > 0) {
                        const p = data.features[0].properties;
                        const parts = [p.name, p.locality, p.district, p.city].filter(Boolean);
                        displayLoc = parts.slice(0, 2).join(', ') || coords;
                    }
                    zoneNameCache[coords] = displayLoc;
                } catch (e) {
                    console.error('Reverse geocoding failed', e);
                }
            }

            const riskLevel = count >= 5 ? 'HIGH' : count >= 2 ? 'MED' : 'LOW';
            const riskColor = riskLevel === 'HIGH' ? '#ef4444' : riskLevel === 'MED' ? '#f59e0b' : '#10b981';
            const rankIcons = ['🔴', '🟠', '🟡', '🟢', '🔵'];
            
            htmlChunks.push(`
                <div class="zone-row">
                    <div class="zone-rank">${rankIcons[i] || ''}</div>
                    <div class="zone-info">
                        <div class="zone-coords" title="${coords}" style="font-weight: 600; font-size: 0.95rem; margin-bottom: 6px;">${displayLoc}</div>
                        <div class="zone-bar-track">
                            <div class="zone-bar-fill" style="width:${Math.round((count/maxZone)*100)}%; background:${riskColor};"></div>
                        </div>
                    </div>
                    <div class="zone-meta">
                        <div class="zone-count">${count}</div>
                        <div class="zone-risk" style="color:${riskColor};">${riskLevel}</div>
                    </div>
                </div>
            `);
        }
        
        container.innerHTML = htmlChunks.join('');
    }

    function renderHourlyPattern(alerts) {
        const container = document.getElementById('hourlyPattern');
        if (!container) return;

        const hours = Array(24).fill(0);
        alerts.forEach(a => {
            hours[new Date(a.created_at).getHours()]++;
        });
        const maxH = Math.max(...hours, 1);

        // Show only 6 time slots (0,4,8,12,16,20)
        const slots = [0, 4, 8, 12, 16, 20];
        container.innerHTML = slots.map(h => {
            const count = hours[h] + (hours[h+1] || 0) + (hours[h+2] || 0) + (hours[h+3] || 0);
            const pct = Math.round((count / (maxH * 4)) * 100);
            const label = h === 0 ? 'Mid' : h === 4 ? '4AM' : h === 8 ? '8AM' : h === 12 ? 'Noon' : h === 16 ? '4PM' : '8PM';
            const color = h >= 20 || h === 0 ? '#8b5cf6' : h >= 16 ? '#ef4444' : h >= 8 ? '#3b82f6' : '#94a3b8';
            return `
                <div class="hourly-col">
                    <div class="hourly-bar-wrap">
                        <div class="hourly-count">${count || ''}</div>
                        <div class="hourly-bar" style="height:${Math.max(pct,4)}%; background:${color};"></div>
                    </div>
                    <div class="hourly-label">${label}</div>
                </div>
            `;
        }).join('');
    }

    // Initial analytics load
    buildAnalyticsDashboard();
});
