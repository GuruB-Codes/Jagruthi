/**
 * MediaService.js
 * Handles lightweight evidence capture (Burst photos + Short audio)
 */
class MediaService {
    constructor() {
        this.video = document.getElementById('hiddenVideo');
        this.canvas = document.getElementById('hiddenCanvas');
        this.indicator = document.getElementById('mediaCaptureIndicator');
        this.statusText = document.getElementById('mediaStatusText');
        
        this.stream = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.capturedImages = [];
    }

    async startCapture() {
        console.log("MediaService: Starting capture flow...");
        this.showIndicator("Capturing evidence...");
        
        try {
            // 1. Request Media Access (Video & Audio)
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "user" }, 
                audio: true 
            });
            
            if (this.video) {
                this.video.srcObject = this.stream;
                await this.video.play();
            }

            // 2. Capture Burst Photos (3 images, 500ms apart)
            await this.captureBurst(3, 800);
            
            // 3. Start Audio Recording
            this.showIndicator("Recording audio...");
            await this.recordAudio(7000); // 7 seconds

            // 4. Cleanup and return status
            this.stopAll();
            this.hideIndicator();
            
            return {
                status: "captured",
                image: this.capturedImages[0] || null, // Primary image for simulation
                audio: this.audioBase64 || null,
                timestamp: new Date().toISOString()
            };

        } catch (err) {
            console.error("MediaService Error:", err);
            this.hideIndicator();
            return { status: "failed", error: err.message };
        }
    }

    async captureBurst(count, interval) {
        return new Promise((resolve) => {
            let taken = 0;
            const captureInterval = setInterval(() => {
                if (this.video && this.canvas) {
                    const ctx = this.canvas.getContext('2d');
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    ctx.drawImage(this.video, 0, 0);
                    
                    const imgData = this.canvas.toDataURL('image/jpeg', 0.6); // Compressed JPEG
                    this.capturedImages.push(imgData);
                    console.log(`Captured image ${taken + 1}`);
                }
                
                taken++;
                if (taken >= count) {
                    clearInterval(captureInterval);
                    resolve();
                }
            }, interval);
        });
    }

    async recordAudio(duration) {
        return new Promise((resolve) => {
            if (!this.stream) return resolve();

            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(this.stream);
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                console.log("Audio recording saved. Size:", audioBlob.size);
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    this.audioBase64 = reader.result;
                    resolve();
                };
            };

            this.mediaRecorder.start();
            setTimeout(() => {
                if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
                    this.mediaRecorder.stop();
                }
            }, duration);
        });
    }

    stopAll() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
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
