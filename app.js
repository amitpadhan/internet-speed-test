/**
 * Quantum Speed - Internet Speed Test Engine
 * Order: Ping → Download → Upload
 */

/* ─────────────────────────────────────────────
   Particle Canvas Background
───────────────────────────────────────────── */
(function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    const ctx    = canvas.getContext('2d');
    let W, H, particles = [];

    function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    class Particle {
        constructor() { this.reset(true); }
        reset(init = false) {
            this.x  = Math.random() * W;
            this.y  = init ? Math.random() * H : H + 10;
            this.r  = Math.random() * 1.5 + 0.3;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = -(Math.random() * 0.5 + 0.2);
            this.alpha = Math.random() * 0.5 + 0.1;
            const colors = ['0,229,255', '168,85,247', '0,255,157', '255,107,107'];
            this.color  = colors[Math.floor(Math.random() * colors.length)];
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.y < -10) this.reset();
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color},${this.alpha})`;
            ctx.fill();
        }
    }

    function init() {
        resize();
        particles = Array.from({ length: 120 }, () => new Particle());
    }

    function loop() {
        ctx.clearRect(0, 0, W, H);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    init();
    loop();
})();


/* ─────────────────────────────────────────────
   SpeedTest Class
───────────────────────────────────────────── */
class SpeedTest {
    constructor() {
        // --- URLs ---
        this.downloadUrl = 'https://speed.cloudflare.com/__down?bytes=25000000'; // 25 MB
        this.uploadUrl   = 'https://speed.cloudflare.com/__up';                  // Cloudflare upload
        this.pingUrl     = 'https://speed.cloudflare.com/__down?bytes=0';

        // --- Speedometer arc constants ---
        // SVG path: M 30 160 A 120 120 0 0 1 270 160  →  half-circle, r=120
        // Arc length = π * 120 ≈ 377
        this.ARC_LENGTH  = 377;
        this.MAX_SPEED   = 150; // Mbps — needle pegs at this value

        // --- DOM elements ---
        this.el = {
            svgSpeed:     document.getElementById('svg-speed'),
            svgUnit:      document.getElementById('svg-unit'),
            svgMbs:       document.getElementById('svg-mbs'),
            svgPhase:     document.getElementById('svg-phase'),
            meterFill:    document.getElementById('meter-fill'),
            needleGroup:  document.getElementById('needle-group'),
            downloadVal:  document.getElementById('download-speed'),
            downloadMBps: document.getElementById('download-MBps'),
            uploadVal:    document.getElementById('upload-speed'),
            uploadMBps:   document.getElementById('upload-MBps'),
            pingVal:      document.getElementById('ping-value'),
            jitterVal:    document.getElementById('jitter-value'),
            startBtn:     document.getElementById('start-btn'),
            btnText:      document.getElementById('btn-text'),
            ipAddress:    document.getElementById('ip-address'),
            ispName:      document.getElementById('isp-name'),
            locationInfo: document.getElementById('location-info'),
            dlBar:        document.getElementById('download-bar'),
            ulBar:        document.getElementById('upload-bar'),
            pingBar:      document.getElementById('ping-bar'),
            jitterBar:    document.getElementById('jitter-bar'),
            cardPing:     document.getElementById('card-ping'),
            cardDl:       document.getElementById('card-download'),
            cardUl:       document.getElementById('card-upload'),
            cardJitter:   document.getElementById('card-jitter'),
            phasePing:    document.getElementById('phase-ping'),
            phaseDl:      document.getElementById('phase-download'),
            phaseUl:      document.getElementById('phase-upload'),
        };

        // Ensure meter-fill dasharray matches ARC_LENGTH
        this.el.meterFill.style.strokeDasharray  = this.ARC_LENGTH;
        this.el.meterFill.style.strokeDashoffset = this.ARC_LENGTH;

        this.init();
    }

    init() {
        this.el.startBtn.addEventListener('click', () => this.startTest());
        this.fetchDeviceInfo();
    }

    /* ── Device / ISP Info ── */
    async fetchDeviceInfo() {
        try {
            const res  = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            this.el.ipAddress.textContent    = `🌐 ${data.ip || 'Unknown IP'}`;
            this.el.ispName.textContent      = `🏢 ${data.org || 'Unknown ISP'}`;
            this.el.locationInfo.textContent = `📍 ${data.city || ''}, ${data.country_name || 'Unknown'}`;
        } catch {
            this.el.ipAddress.textContent    = '🌐 IP Unknown';
            this.el.ispName.textContent      = '🏢 ISP Unknown';
            this.el.locationInfo.textContent = '📍 Location Unknown';
        }
    }

    /* ── Speedometer Update ── */
    updateMeter(speedMbps) {
        const clamped = Math.min(speedMbps, this.MAX_SPEED);
        const pct     = clamped / this.MAX_SPEED;

        // Arc fill: offset shrinks as speed grows
        this.el.meterFill.style.strokeDashoffset = this.ARC_LENGTH - pct * this.ARC_LENGTH;

        // Needle: -90deg = left (0 Mbps), +90deg = right (MAX Mbps)
        // SVG transform attribute for reliable pivot
        const angle = -90 + pct * 180;
        this.el.needleGroup.setAttribute('transform',
            `rotate(${angle}, 150, 160)`);

        // SVG text updates
        const speedMBps = speedMbps / 8;
        this.el.svgSpeed.textContent = speedMbps.toFixed(2);
        this.el.svgMbs.textContent   = `${speedMBps.toFixed(2)} MB/s`;
    }

    /* ── Phase label ── */
    setPhaseLabel(text) {
        this.el.svgPhase.textContent = text.toUpperCase();
    }

    /* ── Phase Step Helpers ── */
    setPhase(name) {
        // Deactivate all
        ['phasePing', 'phaseDl', 'phaseUl'].forEach(k => {
            this.el[k].classList.remove('active', 'done');
        });

        // Mark previous phases done
        const order = ['phasePing', 'phaseDl', 'phaseUl'];
        const idx   = { ping: 0, download: 1, upload: 2 }[name];
        order.forEach((k, i) => {
            if (i < idx)  this.el[k].classList.add('done');
            if (i === idx) this.el[k].classList.add('active');
        });

        // Connectors
        const connectors = document.querySelectorAll('.phase-connector');
        connectors.forEach((c, i) => {
            c.classList.toggle('active', i < idx);
        });
    }

    setAllDone() {
        ['phasePing', 'phaseDl', 'phaseUl'].forEach(k => {
            this.el[k].classList.remove('active');
            this.el[k].classList.add('done');
        });
        document.querySelectorAll('.phase-connector').forEach(c => c.classList.add('active'));
    }

    activateCard(card) {
        document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
        if (card) card.classList.add('active');
    }

    resetUI() {
        this.updateMeter(0);
        this.setPhaseLabel('Ready to Test');
        ['downloadVal','uploadVal','pingVal','jitterVal'].forEach(k => {
            this.el[k].textContent = '--';
        });
        this.el.downloadMBps.textContent = '-- MB/s';
        this.el.uploadMBps.textContent   = '-- MB/s';
        [this.el.dlBar, this.el.ulBar, this.el.pingBar, this.el.jitterBar].forEach(b => {
            b.style.width = '0%';
        });
        document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.phase-step').forEach(s => s.classList.remove('active','done'));
        document.querySelectorAll('.phase-connector').forEach(c => c.classList.remove('active'));
    }

    /* ── Main Test Sequence ── */
    async startTest() {
        this.el.startBtn.disabled = true;
        this.el.btnText.textContent = 'Testing...';
        this.resetUI();

        try {
            /* 1. Ping & Jitter */
            this.setPhaseLabel('Measuring Latency...');
            this.setPhase('ping');
            this.activateCard(this.el.cardPing);
            const { ping, jitter } = await this.runPingTest();

            this.el.pingVal.textContent   = ping.toFixed(0);
            this.el.jitterVal.textContent = jitter.toFixed(0);
            this.el.pingBar.style.width   = `${Math.min(ping / 200, 1) * 100}%`;
            this.el.jitterBar.style.width = `${Math.min(jitter / 50, 1) * 100}%`;
            this.el.cardJitter.classList.add('active');

            /* 2. Download */
            this.setPhaseLabel('Download Speed...');
            this.setPhase('download');
            this.activateCard(this.el.cardDl);
            const dlMbps = await this.runDownloadTest();

            this.el.downloadVal.textContent  = dlMbps.toFixed(2);
            this.el.downloadMBps.textContent = `${(dlMbps / 8).toFixed(2)} MB/s`;
            this.el.dlBar.style.width        = `${Math.min(dlMbps / this.MAX_SPEED, 1) * 100}%`;

            /* 3. Upload */
            this.setPhaseLabel('Upload Speed...');
            this.setPhase('upload');
            this.activateCard(this.el.cardUl);
            const ulMbps = await this.runUploadTest();

            this.el.uploadVal.textContent  = ulMbps.toFixed(2);
            this.el.uploadMBps.textContent = `${(ulMbps / 8).toFixed(2)} MB/s`;
            this.el.ulBar.style.width      = `${Math.min(ulMbps / this.MAX_SPEED, 1) * 100}%`;

            /* Done */
            this.setAllDone();
            document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
            this.updateMeter(0);
            this.setPhaseLabel('Test Complete');

        } catch (err) {
            console.error('Speed test error:', err);
            this.setPhaseLabel('Test Failed');
        } finally {
            this.el.startBtn.disabled = false;
            this.el.btnText.textContent = 'Run Again';
        }
    }

    /* ── Ping Test (10 samples) ── */
    async runPingTest() {
        const pings = [];
        for (let i = 0; i < 10; i++) {
            const t0 = performance.now();
            await fetch(`${this.pingUrl}&r=${Math.random()}`, { cache: 'no-store', mode: 'no-cors' });
            pings.push(performance.now() - t0);
        }
        const avg    = pings.reduce((a, b) => a + b, 0) / pings.length;
        const jitter = pings.slice(1).reduce((acc, v, i) => acc + Math.abs(v - pings[i]), 0) / (pings.length - 1);
        return { ping: avg, jitter };
    }

    /* ── Download Test (streaming, real-time gauge) ── */
    async runDownloadTest() {
        const startTime = performance.now();
        const res       = await fetch(`${this.downloadUrl}&r=${Math.random()}`, { cache: 'no-store' });
        const reader    = res.body.getReader();
        let received    = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.length;
            const elapsed  = (performance.now() - startTime) / 1000;
            const speedMbps = (received * 8) / elapsed / 1e6;
            this.updateMeter(speedMbps);
            // live-update download card
            this.el.downloadVal.textContent  = speedMbps.toFixed(2);
            this.el.downloadMBps.textContent = `${(speedMbps / 8).toFixed(2)} MB/s`;
            this.el.dlBar.style.width        = `${Math.min(speedMbps / this.MAX_SPEED, 1) * 100}%`;
        }

        const total = (performance.now() - startTime) / 1000;
        return (received * 8) / total / 1e6;
    }

    /* ── Upload Test (XHR with live progress) ── */
    runUploadTest() {
        return new Promise((resolve, reject) => {
            const SIZE  = 5 * 1024 * 1024; // 5 MB
            const data  = new Uint8Array(SIZE);
            // Fill with pseudo-random data (avoids crypto quota limit)
            for (let i = 0; i < SIZE; i++) data[i] = (Math.random() * 256) | 0;

            const xhr       = new XMLHttpRequest();
            const startTime = performance.now();

            xhr.upload.onprogress = (e) => {
                if (!e.lengthComputable) return;
                const elapsed  = (performance.now() - startTime) / 1000;
                if (elapsed < 0.1) return;
                const speedMbps = (e.loaded * 8) / elapsed / 1e6;
                this.updateMeter(speedMbps);
                this.el.uploadVal.textContent  = speedMbps.toFixed(2);
                this.el.uploadMBps.textContent = `${(speedMbps / 8).toFixed(2)} MB/s`;
                this.el.ulBar.style.width      = `${Math.min(speedMbps / this.MAX_SPEED, 1) * 100}%`;
            };

            xhr.onload = () => {
                const elapsed = (performance.now() - startTime) / 1000;
                resolve((SIZE * 8) / elapsed / 1e6);
            };

            xhr.onerror   = () => {
                // Fallback: resolve with estimated value if CORS blocks the response
                const elapsed = (performance.now() - startTime) / 1000;
                resolve((SIZE * 8) / elapsed / 1e6);
            };

            xhr.open('POST', this.uploadUrl);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.send(data);
        });
    }
}

/* ─── Bootstrap ─── */
document.addEventListener('DOMContentLoaded', () => new SpeedTest());
