/**
 * Quantum Speed - Internet Speed Test Engine
 * Order: Ping → Download → Upload (Sequential)
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
        particles = Array.from({ length: 100 }, () => new Particle());
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
        // Arc length = 371
        this.ARC_LENGTH  = 371;
        this.MAX_SPEED   = 150; // Mbps

        // --- DOM elements ---
        this.el = {
            svgSpeed:     document.getElementById('svg-speed'),
            svgUnit:      document.getElementById('svg-unit'),
            svgMbs:       document.getElementById('svg-mbs'),
            meterFill:    document.getElementById('meter-fill'),
            needleGroup:  document.getElementById('needle-group'),
            
            downloadVal:  document.getElementById('download-speed'),
            downloadMBps: document.getElementById('download-MBps'),
            uploadVal:    document.getElementById('upload-speed'),
            uploadMBps:   document.getElementById('upload-MBps'),
            pingVal:      document.getElementById('ping-value'),
            
            startBtn:     document.getElementById('start-btn'),
            btnText:      document.getElementById('btn-text'),
            
            ipAddress:    document.getElementById('ip-address'),
            ispName:      document.getElementById('isp-name'),
            locationInfo: document.getElementById('location-info'),
            
            dlBar:        document.getElementById('download-bar'),
            ulBar:        document.getElementById('upload-bar'),
            pingBar:      document.getElementById('ping-bar'),
            
            cardPing:     document.getElementById('card-ping'),
            cardDl:       document.getElementById('card-download'),
            cardUl:       document.getElementById('card-upload'),
            
            phasePing:    document.getElementById('phase-ping'),
            phaseDl:      document.getElementById('phase-download'),
            phaseUl:      document.getElementById('phase-upload'),
            
            conn1:        document.getElementById('conn-1'),
            conn2:        document.getElementById('conn-2'),
        };

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
    updateMeter(value, type = 'speed') {
        let pct = 0;
        if (type === 'speed') {
            const clamped = Math.min(value, this.MAX_SPEED);
            pct = clamped / this.MAX_SPEED;
            const speedMBps = value / 8;
            this.el.svgSpeed.textContent = value.toFixed(2);
            this.el.svgMbs.textContent   = `${speedMBps.toFixed(2)} MB/s`;
            this.el.svgUnit.textContent  = 'MBPS';
        } else if (type === 'ping') {
            // Reverse mapping for ping: lower is better, let's map 0-200ms to the meter
            const clamped = Math.min(value, 200);
            pct = 1 - (clamped / 200); // 0ms = 100%, 200ms = 0%
            this.el.svgSpeed.textContent = value.toFixed(0);
            this.el.svgMbs.textContent   = `LATENCY`;
            this.el.svgUnit.textContent  = 'MS';
        }

        this.el.meterFill.style.strokeDashoffset = this.ARC_LENGTH - pct * this.ARC_LENGTH;
        const angle = -90 + pct * 180;
        this.el.needleGroup.setAttribute('transform', `rotate(${angle}, 150, 158)`);
    }

    /* ── Phase Step Helpers ── */
    setPhase(name) {
        // Reset steps
        ['phasePing', 'phaseDl', 'phaseUl'].forEach(k => {
            this.el[k].classList.remove('active', 'done');
        });
        this.el.conn1.classList.remove('active');
        this.el.conn2.classList.remove('active');

        // Mark active/done
        const order = ['phasePing', 'phaseDl', 'phaseUl'];
        const idx   = { ping: 0, download: 1, upload: 2 }[name];
        order.forEach((k, i) => {
            if (i < idx)  this.el[k].classList.add('done');
            if (i === idx) this.el[k].classList.add('active');
        });

        // Connectors
        if (idx > 0) this.el.conn1.classList.add('active');
        if (idx > 1) this.el.conn2.classList.add('active');
    }

    setAllDone() {
        ['phasePing', 'phaseDl', 'phaseUl'].forEach(k => {
            this.el[k].classList.remove('active');
            this.el[k].classList.add('done');
        });
        this.el.conn1.classList.add('active');
        this.el.conn2.classList.add('active');
    }

    activateCard(card) {
        document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
        if (card) card.classList.add('active');
    }

    /* ── Reset UI ── */
    resetUI() {
        this.updateMeter(0, 'speed');
        ['downloadVal','uploadVal','pingVal'].forEach(k => {
            this.el[k].textContent = '--';
        });
        this.el.downloadMBps.textContent = '-- MB/s';
        this.el.uploadMBps.textContent   = '-- MB/s';
        [this.el.dlBar, this.el.ulBar, this.el.pingBar].forEach(b => {
            b.style.width = '0%';
        });
        this.activateCard(null);
        this.setPhase('ping');
    }

    /* ── Main Test Sequence ── */
    async startTest() {
        this.el.startBtn.disabled = true;
        this.el.btnText.textContent = 'Testing...';
        this.resetUI();

        try {
            /* 1. Ping */
            this.setPhase('ping');
            this.activateCard(this.el.cardPing);
            const ping = await this.runPingTest();
            
            this.el.pingVal.textContent   = ping.toFixed(0);
            this.el.pingBar.style.width   = `${Math.min(ping / 200, 1) * 100}%`;
            this.updateMeter(ping, 'ping');
            await new Promise(r => setTimeout(r, 800)); // Pause to show ping on meter

            /* 2. Download */
            this.updateMeter(0, 'speed');
            this.setPhase('download');
            this.activateCard(this.el.cardDl);
            const dlMbps = await this.runDownloadTest();

            this.el.downloadVal.textContent  = dlMbps.toFixed(2);
            this.el.downloadMBps.textContent = `${(dlMbps / 8).toFixed(2)} MB/s`;
            this.el.dlBar.style.width        = `${Math.min(dlMbps / this.MAX_SPEED, 1) * 100}%`;
            await new Promise(r => setTimeout(r, 800)); // Pause

            /* 3. Upload */
            this.updateMeter(0, 'speed');
            this.setPhase('upload');
            this.activateCard(this.el.cardUl);
            const ulMbps = await this.runUploadTest();

            this.el.uploadVal.textContent  = ulMbps.toFixed(2);
            this.el.uploadMBps.textContent = `${(ulMbps / 8).toFixed(2)} MB/s`;
            this.el.ulBar.style.width      = `${Math.min(ulMbps / this.MAX_SPEED, 1) * 100}%`;

            /* Done */
            this.setAllDone();
            this.activateCard(null);
            this.updateMeter(0, 'speed');
            this.el.btnText.textContent = 'Run Again';

        } catch (err) {
            console.error('Speed test error:', err);
            this.el.btnText.textContent = 'Error - Retry';
        } finally {
            this.el.startBtn.disabled = false;
        }
    }

    /* ── Ping Test ── */
    async runPingTest() {
        const pings = [];
        for (let i = 0; i < 5; i++) {
            const t0 = performance.now();
            await fetch(`${this.pingUrl}&r=${Math.random()}`, { cache: 'no-store', mode: 'no-cors' });
            pings.push(performance.now() - t0);
            this.updateMeter(pings[pings.length-1], 'ping');
            await new Promise(r => setTimeout(r, 100));
        }
        return pings.reduce((a, b) => a + b, 0) / pings.length;
    }

    /* ── Download Test ── */
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
            this.updateMeter(speedMbps, 'speed');
            this.el.downloadVal.textContent  = speedMbps.toFixed(2);
            this.el.downloadMBps.textContent = `${(speedMbps / 8).toFixed(2)} MB/s`;
            this.el.dlBar.style.width        = `${Math.min(speedMbps / this.MAX_SPEED, 1) * 100}%`;
        }

        const total = (performance.now() - startTime) / 1000;
        return (received * 8) / total / 1e6;
    }

    /* ── Upload Test ── */
    runUploadTest() {
        return new Promise((resolve, reject) => {
            const SIZE  = 5 * 1024 * 1024; // 5 MB
            const data  = new Uint8Array(SIZE);
            // Pre-fill data
            for (let i = 0; i < SIZE; i++) data[i] = (Math.random() * 256) | 0;

            const xhr       = new XMLHttpRequest();
            let startTime;

            xhr.upload.onloadstart = () => {
                startTime = performance.now();
            };

            xhr.upload.onprogress = (e) => {
                if (!e.lengthComputable || !startTime) return;
                const elapsed  = (performance.now() - startTime) / 1000;
                if (elapsed < 0.1) return;
                const speedMbps = (e.loaded * 8) / elapsed / 1e6;
                this.updateMeter(speedMbps, 'speed');
                this.el.uploadVal.textContent  = speedMbps.toFixed(2);
                this.el.uploadMBps.textContent = `${(speedMbps / 8).toFixed(2)} MB/s`;
                this.el.ulBar.style.width      = `${Math.min(speedMbps / this.MAX_SPEED, 1) * 100}%`;
            };

            xhr.onload = () => {
                const elapsed = (performance.now() - startTime) / 1000;
                resolve((SIZE * 8) / elapsed / 1e6);
            };

            xhr.onerror = () => {
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
