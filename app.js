const rawVideo = document.getElementById('rawVideo');
const mainCanvas = document.getElementById('mainCanvas');
const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
const audioCanvas = document.getElementById('audioCanvas');

let audioCtx, recorder, stream, recordedChunks = [];
let logs = [], nvMultiplier = 6, currentMode = "SLS"; 

// 1. Initial State Check
window.onload = () => {
    if (localStorage.getItem('ghostCam_granted') === 'true') {
        document.getElementById('initBtn').innerText = "RESUMING...";
        startCamera();
    }
};

async function initSuite() {
    await startCamera();
}

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" }, 
            audio: true 
        });
        
        localStorage.setItem('ghostCam_granted', 'true');
        document.getElementById('initBtn').style.display = 'none';

        rawVideo.srcObject = stream;
        rawVideo.onloadedmetadata = () => {
            mainCanvas.width = rawVideo.videoWidth;
            mainCanvas.height = rawVideo.videoHeight;
            processViewfinder();
            setupAudioVisualizer(stream);
        };
    } catch (e) { 
        alert("Camera Access Required. Check browser permissions."); 
    }
}

function processViewfinder() {
    mainCtx.drawImage(rawVideo, 0, 0, mainCanvas.width, mainCanvas.height);
    
    if (currentMode === "SLS") {
        mainCanvas.style.filter = "sepia(1) hue-rotate(70deg) brightness(1.2) contrast(1.5)";
    } else {
        mainCanvas.style.filter = "none";
        const frame = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        const d = frame.data;
        for (let i = 0; i < d.length; i += 4) {
            let lum = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) * nvMultiplier;
            if (lum > 255) lum = 255;
            d[i] = lum * 0.1; d[i+1] = lum; d[i+2] = lum * 0.1;
        }
        mainCtx.putImageData(frame, 0, 0);
    }
    requestAnimationFrame(processViewfinder);
}

function toggleMode() {
    const title = document.getElementById('modeTitle');
    const nvControls = document.getElementById('nvControls');
    currentMode = (currentMode === "SLS") ? "NIGHTVISION" : "SLS";
    title.innerText = (currentMode === "SLS") ? "SYSTEM: SLS OVERLAY" : "SYSTEM: NV AMPLIFIER";
    nvControls.style.display = (currentMode === "SLS") ? "none" : "flex";
}

function toggleFullscreen() {
    const container = document.getElementById('cameraContainer');
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => alert("Error: " + err.message));
    } else {
        document.exitFullscreen();
    }
}

function toggleRecording() {
    const btn = document.getElementById('recBtn');
    if (!recorder || recorder.state === "inactive") {
        recordedChunks = [];
        const canvasStream = mainCanvas.captureStream(30);
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);

        recorder = new MediaRecorder(canvasStream);
        recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        recorder.onstop = () => { document.getElementById('downloadBtn').disabled = false; };
        
        recorder.start();
        btn.innerText = "🔴 STOPPING...";
    } else {
        recorder.stop();
        btn.innerText = "RECORD SESSION";
    }
}

function downloadVideo() {
    const blob = new Blob(recordedChunks, { type: "video/mp4" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Hunt_${Date.now()}.mp4`;
    a.click();
}

function armREMPod() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(response => {
            if (response == 'granted') startMotion();
        });
    } else { startMotion(); }
}

function startMotion() {
    window.addEventListener('devicemotion', e => {
        let acc = e.accelerationIncludingGravity;
        let total = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);
        if (Math.abs(total - lastTotal) > 2.0) triggerMotion();
        lastTotal = total;
    });
    document.getElementById('remStatus').innerText = "ARMED";
}

let lastTotal = 0;
function triggerMotion() {
    const logEl = document.getElementById('timestampLog');
    const status = document.getElementById('remStatus');
    const entry = `[${new Date().toLocaleTimeString()}] MOTION`;
    logs.push(entry);
    logEl.innerHTML = entry + "<br>" + logEl.innerHTML;
    status.classList.add('alert');
    status.innerText = "TRIGGERED";
    setTimeout(() => { status.classList.remove('alert'); status.innerText = "ARMED"; }, 1000);
}

function downloadLogs() {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ghost_logs.txt";
    a.click();
}

function setupAudioVisualizer(stream) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    source.connect(analyser);
    const dArray = new Uint8Array(analyser.frequencyBinCount);
    const aCtx = audioCanvas.getContext('2d');

    function draw() {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dArray);
        aCtx.fillStyle = '#0d1117'; aCtx.fillRect(0,0,audioCanvas.width, audioCanvas.height);
        aCtx.fillStyle = '#00ff66';
        for(let i=0; i<dArray.length; i+=25) {
            let v = dArray[i];
            aCtx.fillRect(i/4, audioCanvas.height - v/2, 4, v/2);
        }
    }
    draw();
}

document.getElementById('nvGain').addEventListener('input', (e) => {
    nvMultiplier = e.target.value;
    document.getElementById('nvGainVal').innerText = nvMultiplier + "x";
});
