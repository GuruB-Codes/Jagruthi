/**
 * MediaService.js
 * Comprehensive SOS Evidence Capture & Secure Storage System
 * - Captures 3 Burst Photos with GPS & Timestamp Watermark
 * - Records ~7 Seconds of Audio via MediaRecorder with format detection
 * - Stores raw Blobs safely in IndexedDB (avoiding base64 localStorage limits)
 * - Uploads to Supabase Storage bucket 'jagruthi-evidence' & registers in 'sos_evidence' table
 * - Accurate state machine: 'Waiting for permission' -> 'Recording' -> 'Saving' -> 'Uploading' -> 'Evidence saved' / 'Capture failed'
 */

// ----------------------------------------------------
// 1. IndexedDB Helper for Safe Local Media Blob Storage
// ----------------------------------------------------
const IDB_NAME = 'JagruthiEvidenceDB';
const IDB_STORE = 'evidence_vault';
const IDB_VERSION = 1;

function openEvidenceDB() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            return reject(new Error("IndexedDB not supported on this browser."));
        }
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                store.createIndex('sosId', 'sosId', { unique: false });
                store.createIndex('capturedAt', 'capturedAt', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function idbSaveEvidenceRecord(record) {
    try {
        const db = await openEvidenceDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            store.put(record);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn("[MediaService] IndexedDB save notice:", e);
        return false;
    }
}

async function idbGetEvidenceBySos(sosId) {
    try {
        const db = await openEvidenceDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const index = store.index('sosId');
            const request = index.getAll(sosId);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        return [];
    }
}

async function idbGetAllEvidence() {
    try {
        const db = await openEvidenceDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const request = store.getAll();
            request.onsuccess = () => {
                const list = request.result || [];
                list.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
                resolve(list);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        return [];
    }
}

// ----------------------------------------------------
// 2. MediaService Implementation
// ----------------------------------------------------
class MediaService {
    constructor() {
        this.stream = null;
        this.statusListeners = [];
        this.currentSosId = null;
        this.currentUserId = null;
        this.lastCapturedEvidence = [];
        
        this.ensureDomElements();
    }

    ensureDomElements() {
        // Offscreen hidden video for drawing frames to canvas
        let video = document.getElementById('hiddenVideo');
        if (!video) {
            video = document.createElement('video');
            video.id = 'hiddenVideo';
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true;
            video.style.display = 'none';
            document.body.appendChild(video);
        }
        this.video = video;

        // Offscreen hidden canvas for snapshot extraction
        let canvas = document.getElementById('hiddenCanvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'hiddenCanvas';
            canvas.style.display = 'none';
            document.body.appendChild(canvas);
        }
        this.canvas = canvas;

        // Visual indicator banner
        let indicator = document.getElementById('mediaCaptureIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'mediaCaptureIndicator';
            indicator.className = 'media-indicator hidden';
            indicator.innerHTML = `
                <div class="media-indicator-content">
                    <div class="media-pulse"></div>
                    <span id="mediaStatusText">Capturing emergency evidence...</span>
                </div>
            `;
            document.body.appendChild(indicator);
        }
        this.indicator = indicator;
        this.statusText = document.getElementById('mediaStatusText') || indicator.querySelector('span');
    }

    /**
     * Subscribe to state updates:
     * states: 'WAITING_PERMISSION', 'RECORDING', 'SAVING', 'UPLOADING', 'UPLOADED', 'FAILED'
     */
    onStatusChange(callback) {
        if (typeof callback === 'function') {
            this.statusListeners.push(callback);
        }
    }

    notifyStatus(state, details = {}) {
        this.statusListeners.forEach(fn => {
            try { fn(state, details); } catch (e) { console.error("Status callback error:", e); }
        });
    }

    getSupportedAudioMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/aac',
            'audio/ogg;codecs=opus',
            'audio/ogg'
        ];
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
            for (const t of types) {
                if (MediaRecorder.isTypeSupported(t)) {
                    let ext = 'webm';
                    if (t.includes('mp4')) ext = 'mp4';
                    else if (t.includes('aac')) ext = 'aac';
                    else if (t.includes('ogg')) ext = 'ogg';
                    return { mimeType: t, extension: ext };
                }
            }
        }
        return { mimeType: 'audio/webm', extension: 'webm' };
    }

    /**
     * Complete Evidence Capture Workflow
     * 1. Burst Photos (3 images spaced 800ms)
     * 2. Audio recording (~7 seconds)
     * 3. IndexedDB local caching
     * 4. Supabase Storage upload and DB registration
     */
    async captureAndUploadEvidence({ sosId, userId, duration = 7000 }) {
        this.currentSosId = sosId;
        this.currentUserId = userId;
        this.lastCapturedEvidence = [];
        this.ensureDomElements();

        console.log(`[MediaService] Starting evidence capture for SOS ${sosId}, User ${userId}...`);

        // STATE 1: Waiting for Permission
        this.notifyStatus('WAITING_PERMISSION', {
            message: "Requesting camera & microphone access...",
            timestamp: new Date().toISOString()
        });
        this.showIndicator("🔒 Requesting camera & mic for evidence...");

        // 1. Acquire Hardware Stream
        let stream = null;
        try {
            // First try combined camera (front/user) + microphone
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            });
        } catch (initialErr) {
            console.warn("[MediaService] Combined getUserMedia failed, trying fallbacks:", initialErr);
            // Fallback 1: Try audio only
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (audioErr) {
                // Fallback 2: Try video only
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true });
                } catch (videoErr) {
                    const errMsg = "Camera & Microphone permissions denied or unavailable.";
                    this.notifyStatus('FAILED', {
                        message: errMsg,
                        error: errMsg,
                        timestamp: new Date().toISOString()
                    });
                    this.hideIndicator();
                    return { success: false, error: errMsg };
                }
            }
        }

        this.stream = stream;

        // Bind video element if video track available
        const hasVideo = stream.getVideoTracks().length > 0;
        const hasAudio = stream.getAudioTracks().length > 0;

        if (hasVideo && this.video) {
            this.video.srcObject = stream;
            try {
                await this.video.play();
            } catch (e) {}
        }

        const capturedItems = [];

        try {
            // STATE 2: Capturing 3 Burst Photos (if camera available)
            if (hasVideo) {
                this.notifyStatus('RECORDING', {
                    stage: 'photos',
                    message: "Capturing 3 burst photos...",
                    timestamp: new Date().toISOString()
                });
                this.showIndicator("📷 Capturing emergency burst photos (3)...");

                for (let i = 1; i <= 3; i++) {
                    this.showIndicator(`📷 Capturing photo ${i} of 3...`);
                    const photoBlob = await this.snapPhotoFrame(i);
                    if (photoBlob && photoBlob.size > 0) {
                        capturedItems.push({
                            type: 'photo',
                            index: i,
                            blob: photoBlob,
                            mimeType: 'image/jpeg',
                            fileName: `evidence_burst_${i}.jpg`,
                            capturedAt: new Date().toISOString()
                        });
                    }
                    if (i < 3) {
                        await new Promise(r => setTimeout(r, 800)); // 800ms interval
                    }
                }
            }

            // STATE 3: Recording Audio (~7 seconds) (if microphone available)
            if (hasAudio) {
                this.notifyStatus('RECORDING', {
                    stage: 'audio',
                    message: "Recording 7 seconds of audio evidence...",
                    timestamp: new Date().toISOString()
                });
                this.showIndicator("🎙️ Recording 7s emergency audio evidence...");

                const audioItem = await this.recordAudioStream(duration);
                if (audioItem && audioItem.blob && audioItem.blob.size > 0) {
                    capturedItems.push(audioItem);
                }
            }

        } catch (captureErr) {
            console.error("[MediaService] Capture process error:", captureErr);
        } finally {
            // Immediately stop hardware stream after capture
            this.stopHardware();
        }

        if (capturedItems.length === 0) {
            this.notifyStatus('FAILED', {
                message: "No evidence data could be captured.",
                timestamp: new Date().toISOString()
            });
            this.hideIndicator();
            return { success: false, error: "Zero media captured." };
        }

        // STATE 4: Saving to IndexedDB Vault
        this.notifyStatus('SAVING', {
            message: "Saving evidence to secure device vault...",
            itemsCount: capturedItems.length,
            timestamp: new Date().toISOString()
        });
        this.showIndicator("🔐 Securing evidence into device vault...");

        for (const item of capturedItems) {
            const record = {
                id: `${sosId}_${item.type}_${item.index || Date.now()}`,
                sosId: sosId,
                userId: userId,
                type: item.type,
                blob: item.blob,
                mimeType: item.mimeType,
                fileName: item.fileName,
                capturedAt: item.capturedAt,
                sizeBytes: item.blob.size,
                status: 'LOCAL_SAVED'
            };
            await idbSaveEvidenceRecord(record);
            this.lastCapturedEvidence.push(record);
        }

        // STATE 5: Uploading to Supabase Cloud Storage
        this.notifyStatus('UPLOADING', {
            message: "Uploading evidence to cloud vault...",
            timestamp: new Date().toISOString()
        });
        this.showIndicator("☁️ Uploading evidence to police & emergency cloud...");

        const uploadResults = await this.uploadCapturedItems(capturedItems, sosId, userId);

        this.hideIndicator();

        const successCount = uploadResults.filter(r => r.success).length;
        if (successCount > 0) {
            // STATE 6: Evidence Saved & Uploaded
            this.notifyStatus('UPLOADED', {
                message: `Evidence secured: ${successCount} files uploaded successfully.`,
                uploadedCount: successCount,
                totalCount: capturedItems.length,
                timestamp: new Date().toISOString()
            });
            return { success: true, uploadedCount: successCount, totalCount: capturedItems.length };
        } else {
            // Saved locally in IndexedDB even if network upload failed
            this.notifyStatus('SAVED_OFFLINE', {
                message: "Evidence saved safely on device. Cloud sync pending.",
                totalCount: capturedItems.length,
                timestamp: new Date().toISOString()
            });
            return { success: true, savedOffline: true, totalCount: capturedItems.length };
        }
    }

    /**
     * Extracts a video frame into a JPEG Blob with GPS & Timestamp watermark
     */
    snapPhotoFrame(index) {
        return new Promise((resolve) => {
            if (!this.video || !this.canvas) return resolve(null);

            const video = this.video;
            const canvas = this.canvas;
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Watermark band at the bottom
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.fillRect(0, canvas.height - 38, canvas.width, 38);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px Outfit, sans-serif';
            const timeStr = new Date().toLocaleString();
            let locText = "GPS: Live Device Tracking";
            if (window.startLoc && Array.isArray(window.startLoc)) {
                locText = `GPS: Lat ${window.startLoc[0].toFixed(4)}, Lng ${window.startLoc[1].toFixed(4)}`;
            }
            ctx.fillText(`Jagruthi Evidence #${index} • ${timeStr} • ${locText}`, 12, canvas.height - 14);

            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.85);
        });
    }

    /**
     * Records audio via MediaRecorder for requested duration
     */
    recordAudioStream(duration = 7000) {
        return new Promise((resolve) => {
            if (!this.stream || this.stream.getAudioTracks().length === 0) {
                return resolve(null);
            }

            const audioInfo = this.getSupportedAudioMimeType();
            const audioStream = new MediaStream(this.stream.getAudioTracks());
            const audioChunks = [];

            try {
                const recorder = new MediaRecorder(audioStream, { mimeType: audioInfo.mimeType });
                
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) audioChunks.push(e.data);
                };

                recorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: audioInfo.mimeType });
                    console.log(`[MediaService] Audio recorded. Size: ${audioBlob.size} bytes`);
                    resolve({
                        type: 'audio',
                        blob: audioBlob,
                        mimeType: audioInfo.mimeType,
                        fileName: `evidence_audio.${audioInfo.extension}`,
                        capturedAt: new Date().toISOString()
                    });
                };

                recorder.start(500); // 500ms chunks

                setTimeout(() => {
                    if (recorder.state !== 'inactive') {
                        recorder.stop();
                    }
                }, duration);

            } catch (err) {
                console.warn("[MediaService] MediaRecorder init error:", err);
                resolve(null);
            }
        });
    }

    /**
     * Uploads captured Blobs to Supabase Storage and records in sos_evidence
     */
    async uploadCapturedItems(items, sosId, userId) {
        const supabase = window.supabaseClient;
        const results = [];

        if (!supabase) {
            console.warn("[MediaService] Supabase client unavailable, evidence stored in IndexedDB only.");
            return items.map(() => ({ success: false, reason: 'No Supabase client' }));
        }

        for (const item of items) {
            const storagePath = `${userId}/${sosId}/${item.fileName}`;
            let uploadSuccess = false;
            let uploadError = null;

            try {
                console.log(`[MediaService] Uploading ${item.fileName} to bucket 'jagruthi-evidence'...`);
                const { error } = await supabase.storage
                    .from('jagruthi-evidence')
                    .upload(storagePath, item.blob, {
                        contentType: item.mimeType,
                        upsert: true
                    });

                if (error) {
                    console.warn(`[MediaService] Upload error for ${item.fileName}:`, error.message);
                    uploadError = error.message;
                } else {
                    uploadSuccess = true;
                    console.log(`[MediaService] Uploaded ${item.fileName} successfully!`);
                }
            } catch (err) {
                uploadError = err.message;
            }

            // Record in sos_evidence table
            if (window.jagruthiSosService) {
                try {
                    await window.jagruthiSosService.createSosEvidenceRecord({
                        sosId: sosId,
                        userId: userId,
                        evidenceType: item.type,
                        storagePath: storagePath,
                        fileName: item.fileName,
                        capturedAt: item.capturedAt,
                        status: uploadSuccess ? 'UPLOADED' : 'FAILED'
                    });
                } catch (dbErr) {
                    console.warn("[MediaService] DB insert notice:", dbErr);
                }
            }

            results.push({ success: uploadSuccess, error: uploadError, fileName: item.fileName });
        }

        return results;
    }

    stopHardware() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                try { track.stop(); } catch (e) {}
            });
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
    }

    showIndicator(text) {
        this.ensureDomElements();
        if (this.statusText) this.statusText.innerText = text;
        if (this.indicator) this.indicator.classList.remove('hidden');
    }

    hideIndicator() {
        if (this.indicator) this.indicator.classList.add('hidden');
    }
}

// Global instances & IndexedDB exports
window.emergencyMedia = new MediaService();
window.idbGetAllEvidence = idbGetAllEvidence;
window.idbGetEvidenceBySos = idbGetEvidenceBySos;
