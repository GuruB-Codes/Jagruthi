/**
 * MediaService.js
 * Comprehensive SOS Evidence Capture & Secure Storage System
 * Captures real Video and Audio via MediaRecorder and securely uploads to Supabase Storage bucket 'jagruthi-evidence'
 */
class MediaService {
    constructor() {
        this.video = document.getElementById('hiddenVideo');
        this.canvas = document.getElementById('hiddenCanvas');
        this.indicator = document.getElementById('mediaCaptureIndicator');
        this.statusText = document.getElementById('mediaStatusText');
        
        this.stream = null;
        this.videoRecorder = null;
        this.audioRecorder = null;
        this.videoChunks = [];
        this.audioChunks = [];
        
        // Cache last captured evidence for retry/playback
        this.lastEvidence = null;
        this.currentSosId = null;
        this.currentUserId = null;
        this.statusListeners = [];
    }

    /**
     * Subscribe to evidence state changes:
     * states: 'RECORDING', 'UPLOADING', 'UPLOADED', 'FAILED'
     */
    onStatusChange(callback) {
        if (typeof callback === 'function') {
            this.statusListeners.push(callback);
        }
    }

    notifyStatus(state, details = {}) {
        this.statusListeners.forEach(fn => {
            try {
                fn(state, details);
            } catch (e) {
                console.error("Error in status listener:", e);
            }
        });
    }

    /**
     * Helper to detect best supported video MIME type
     */
    getSupportedVideoMimeType() {
        const types = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4;codecs=avc1,mp4a',
            'video/mp4'
        ];
        for (const t of types) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
                return { mimeType: t, extension: t.includes('mp4') ? 'mp4' : 'webm' };
            }
        }
        return { mimeType: 'video/webm', extension: 'webm' };
    }

    /**
     * Helper to detect best supported audio MIME type
     */
    getSupportedAudioMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/aac'
        ];
        for (const t of types) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
                let ext = 'webm';
                if (t.includes('ogg')) ext = 'ogg';
                else if (t.includes('mp4') || t.includes('aac')) ext = 'mp4';
                return { mimeType: t, extension: ext };
            }
        }
        return { mimeType: 'audio/webm', extension: 'webm' };
    }

    /**
     * Start recording evidence (Video & Audio) simultaneously
     * @param {Object} options
     * @param {string} options.sosId - UUID of the sos_events record
     * @param {string} options.userId - UUID of the authenticated woman
     * @param {number} options.duration - Duration in ms (default 6000ms)
     */
    async captureAndUploadEvidence({ sosId, userId, duration = 6000 }) {
        this.currentSosId = sosId;
        this.currentUserId = userId;

        console.log(`MediaService: Initializing evidence capture for SOS ${sosId}, User ${userId}...`);
        
        // 1. Update UI: STATE 1 - 🔴 Evidence Recording
        this.notifyStatus('RECORDING', {
            message: "Capturing live video & audio evidence...",
            videoStatus: 'Recording',
            audioStatus: 'Recording',
            timestamp: new Date().toISOString()
        });
        this.showIndicator("🔴 Evidence Recording: Video + Audio capturing...");

        let captureResult = null;
        try {
            captureResult = await this.recordMediaStreams(duration);
        } catch (err) {
            console.error("MediaService: Recording error:", err);
            this.notifyStatus('FAILED', {
                message: `Recording error: ${err.message || 'Permissions denied'}`,
                videoStatus: 'Failed',
                audioStatus: 'Failed',
                error: err.message,
                timestamp: new Date().toISOString()
            });
            this.hideIndicator();
            return { success: false, error: err.message };
        }

        // 2. Upload to Supabase Storage and create sos_evidence rows
        return await this.uploadStoredEvidence();
    }

    /**
     * Records video and audio from user media
     */
    async recordMediaStreams(duration = 6000) {
        this.videoChunks = [];
        this.audioChunks = [];
        
        // Request camera & microphone
        let userStream = null;
        try {
            userStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
                audio: true
            });
        } catch (err) {
            console.warn("Could not get combined video+audio, trying fallback options...", err);
            // Fallback: try audio only or video only if one fails
            try {
                userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (audioErr) {
                try {
                    userStream = await navigator.mediaDevices.getUserMedia({ video: true });
                } catch (videoErr) {
                    throw new Error("Camera and Microphone access denied or unavailable.");
                }
            }
        }

        this.stream = userStream;

        if (this.video && this.stream.getVideoTracks().length > 0) {
            this.video.srcObject = this.stream;
            try {
                await this.video.play();
            } catch (e) {}
        }

        const videoInfo = this.getSupportedVideoMimeType();
        const audioInfo = this.getSupportedAudioMimeType();

        const hasVideoTrack = this.stream.getVideoTracks().length > 0;
        const hasAudioTrack = this.stream.getAudioTracks().length > 0;

        const recordPromises = [];

        // Setup Video Recording
        if (hasVideoTrack && typeof MediaRecorder !== 'undefined') {
            try {
                // Video recorder can record the full stream or video tracks
                const videoStream = new MediaStream(this.stream.getVideoTracks().concat(this.stream.getAudioTracks()));
                this.videoRecorder = new MediaRecorder(videoStream, { mimeType: videoInfo.mimeType });
                
                this.videoRecorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                        this.videoChunks.push(e.data);
                    }
                };

                const videoDone = new Promise((resolve) => {
                    this.videoRecorder.onstop = () => {
                        console.log("MediaService: Video recording finished. Chunks:", this.videoChunks.length);
                        resolve();
                    };
                });
                recordPromises.push(videoDone);
                this.videoRecorder.start(500); // chunk every 500ms
            } catch (e) {
                console.warn("Failed to initialize video recorder:", e);
            }
        }

        // Setup Audio Recording
        if (hasAudioTrack && typeof MediaRecorder !== 'undefined') {
            try {
                const audioStream = new MediaStream(this.stream.getAudioTracks());
                this.audioRecorder = new MediaRecorder(audioStream, { mimeType: audioInfo.mimeType });
                
                this.audioRecorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                        this.audioChunks.push(e.data);
                    }
                };

                const audioDone = new Promise((resolve) => {
                    this.audioRecorder.onstop = () => {
                        console.log("MediaService: Audio recording finished. Chunks:", this.audioChunks.length);
                        resolve();
                    };
                });
                recordPromises.push(audioDone);
                this.audioRecorder.start(500);
            } catch (e) {
                console.warn("Failed to initialize audio recorder:", e);
            }
        }

        // Record for specified duration
        await new Promise(resolve => setTimeout(resolve, duration));

        // Stop Recorders
        if (this.videoRecorder && this.videoRecorder.state !== 'inactive') {
            this.videoRecorder.stop();
        }
        if (this.audioRecorder && this.audioRecorder.state !== 'inactive') {
            this.audioRecorder.stop();
        }

        await Promise.all(recordPromises);

        // Build Blobs
        let videoBlob = null;
        let audioBlob = null;

        if (this.videoChunks.length > 0) {
            videoBlob = new Blob(this.videoChunks, { type: videoInfo.mimeType });
        }
        if (this.audioChunks.length > 0) {
            audioBlob = new Blob(this.audioChunks, { type: audioInfo.mimeType });
        }

        const captureTime = new Date().toISOString();

        // Cleanup camera/mic hardware
        this.stopHardware();

        this.lastEvidence = {
            sosId: this.currentSosId,
            userId: this.currentUserId,
            videoBlob,
            audioBlob,
            videoInfo,
            audioInfo,
            captureTime,
            videoLocalUrl: videoBlob ? URL.createObjectURL(videoBlob) : null,
            audioLocalUrl: audioBlob ? URL.createObjectURL(audioBlob) : null
        };

        return this.lastEvidence;
    }

    /**
     * Upload cached evidence to Supabase Storage bucket 'jagruthi-evidence'
     * and insert records into 'sos_evidence' table.
     */
    async uploadStoredEvidence() {
        if (!this.lastEvidence) {
            console.error("MediaService: No evidence to upload.");
            return { success: false, error: "No recorded evidence found." };
        }

        const { sosId, userId, videoBlob, audioBlob, videoInfo, audioInfo, captureTime } = this.lastEvidence;
        const supabase = window.supabaseClient;

        // 2. Update UI: STATE 2 - 🟡 Evidence Uploading
        this.notifyStatus('UPLOADING', {
            message: "Uploading video and audio evidence securely...",
            videoStatus: videoBlob ? 'Uploading' : 'Not Recorded',
            audioStatus: audioBlob ? 'Uploading' : 'Not Recorded',
            timestamp: captureTime
        });
        this.showIndicator("🟡 Evidence Uploading: Securing evidence in Jagruthi vault...");

        const videoStoragePath = `${userId}/${sosId}/evidence_video.${videoInfo.extension}`;
        const audioStoragePath = `${userId}/${sosId}/evidence_audio.${audioInfo.extension}`;
        const videoFileName = `evidence_video.${videoInfo.extension}`;
        const audioFileName = `evidence_audio.${audioInfo.extension}`;

        let videoSuccess = false;
        let audioSuccess = false;
        let videoError = null;
        let audioError = null;

        // Upload Video
        if (videoBlob && supabase) {
            try {
                console.log(`MediaService: Uploading video to jagruthi-evidence/${videoStoragePath}...`);
                const { data, error } = await supabase.storage
                    .from('jagruthi-evidence')
                    .upload(videoStoragePath, videoBlob, {
                        contentType: videoInfo.mimeType,
                        upsert: true
                    });

                if (error) {
                    console.error("Video Storage Upload Error:", error);
                    videoError = error.message;
                } else {
                    videoSuccess = true;
                    console.log("Video uploaded successfully to Supabase Storage!");
                }
            } catch (err) {
                console.error("Exception during video upload:", err);
                videoError = err.message;
            }

            // Insert video record into sos_evidence
            if (window.jagruthiSosService) {
                await window.jagruthiSosService.createSosEvidenceRecord({
                    sosId,
                    userId,
                    evidenceType: 'video',
                    storagePath: videoStoragePath,
                    fileName: videoFileName,
                    capturedAt: captureTime,
                    status: videoSuccess ? 'UPLOADED' : 'FAILED'
                });
            }
        }

        // Upload Audio
        if (audioBlob && supabase) {
            try {
                console.log(`MediaService: Uploading audio to jagruthi-evidence/${audioStoragePath}...`);
                const { data, error } = await supabase.storage
                    .from('jagruthi-evidence')
                    .upload(audioStoragePath, audioBlob, {
                        contentType: audioInfo.mimeType,
                        upsert: true
                    });

                if (error) {
                    console.error("Audio Storage Upload Error:", error);
                    audioError = error.message;
                } else {
                    audioSuccess = true;
                    console.log("Audio uploaded successfully to Supabase Storage!");
                }
            } catch (err) {
                console.error("Exception during audio upload:", err);
                audioError = err.message;
            }

            // Insert audio record into sos_evidence
            if (window.jagruthiSosService) {
                await window.jagruthiSosService.createSosEvidenceRecord({
                    sosId,
                    userId,
                    evidenceType: 'audio',
                    storagePath: audioStoragePath,
                    fileName: audioFileName,
                    capturedAt: captureTime,
                    status: audioSuccess ? 'UPLOADED' : 'FAILED'
                });
            }
        }

        this.hideIndicator();

        const allSuccessful = (videoBlob ? videoSuccess : true) && (audioBlob ? audioSuccess : true) && (videoSuccess || audioSuccess);

        if (allSuccessful) {
            // STATE 3 - 🟢 Evidence Secured
            this.notifyStatus('UPLOADED', {
                message: "Evidence Secured: Video + Audio uploaded successfully.",
                videoStatus: videoSuccess ? 'Uploaded' : 'Failed',
                audioStatus: audioSuccess ? 'Uploaded' : 'Failed',
                videoStoragePath,
                audioStoragePath,
                timestamp: captureTime,
                videoLocalUrl: this.lastEvidence.videoLocalUrl,
                audioLocalUrl: this.lastEvidence.audioLocalUrl
            });
            return { success: true, videoSuccess, audioSuccess };
        } else {
            // STATE 4 - 🔴 Evidence Upload Failed
            this.notifyStatus('FAILED', {
                message: "Evidence Upload Failed. You can retry uploading.",
                videoStatus: videoSuccess ? 'Uploaded' : 'Failed',
                audioStatus: audioSuccess ? 'Uploaded' : 'Failed',
                videoError,
                audioError,
                timestamp: captureTime
            });
            return { success: false, videoSuccess, audioSuccess, videoError, audioError };
        }
    }

    /**
     * Retry uploading cached evidence
     */
    async retryUpload() {
        if (!this.lastEvidence) {
            alert("No cached evidence available to retry.");
            return { success: false };
        }
        console.log("MediaService: Retrying evidence upload...");
        return await this.uploadStoredEvidence();
    }

    stopHardware() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                try {
                    track.stop();
                } catch (e) {}
            });
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
    }

    showIndicator(text) {
        if (this.indicator && this.statusText) {
            this.statusText.innerText = text;
            this.indicator.classList.remove('hidden');
        }
    }

    hideIndicator() {
        if (this.indicator) {
            this.indicator.classList.add('hidden');
        }
    }
}

// Global instance
window.emergencyMedia = new MediaService();
