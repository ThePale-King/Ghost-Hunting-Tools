const rawVideo = document.getElementById('rawVideo');
const mainCanvas = document.getElementById('mainCanvas');
const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
const audioCanvas = document.getElementById('audioCanvas');

let audioCtx, recorder, stream, recordedChunks = [];
let logs = [], nvMultiplier = 6, currentMode = "NORMAL"; 
let isFlashlightOn = false, sensorActive = false, lastTotal = 0;
let detector; 

// 1. Setup & AI Loading
window.onload = async () => {
    try {
        detector = await cocoSsd.load();
        document.getElementById('aiStatus').innerText = "AI: TRACKING ACTIVE";
    } catch (e) {
        document.getElementById('aiStatus').innerText = "AI: OFFLINE (CHECK INTERNET)";
    }
    if (localStorage.getItem('ghostCam_granted') === 'true') {
        initSuite();
    }
};

async function initSuite() {
    document.getElementById('initBtn').innerText = "SYNCING...";
    await startCamera();
    document.getElementById('initBtn').innerText = "RE-SYNC SYSTEM";
}

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: 1280, height: 720 }, 
            audio: true 
        });
        localStorage.setItem('ghostCam_granted', 'true');
        rawVideo.srcObject = stream;
        rawVideo.onloadedmetadata = () => {
            mainCanvas.width = rawVideo.videoWidth;
            mainCanvas.height = rawVideo.videoHeight;
            processViewfinder();
            setupAudioVisualizer(stream);
        };
    } catch (e) { alert("Camera/Mic access required."); }
}

// 2. Viewfinder & AI Processing
async function processViewfinder() {
    mainCtx.filter = "none";
    mainCtx.drawImage(rawVideo, 0, 0, mainCanvas.width, mainCanvas.height);
    
    if (currentMode === "SLS") {
        mainCtx.filter = "sepia(1) hue-rotate(70deg) brightness(1.1) contrast(1.3)";
    } else if (currentMode === "NIGHTVISION") {
        const frame = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        const d = frame.data;
        for (let i = 0; i < d.length; i += 4) {
            let lum = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) * nvMultiplier;
            if (lum > 255) lum = 255;
            d[i] = lum * 0.1; d[i+1] = lum; d[i+2] = lum * 0.1;
        }
        mainCtx.putImageData(frame, 0, 0);
    }

    if (detector) {
        const predictions = await detector.detect(mainCanvas);
        predictions.forEach(prediction => {
            mainCtx.strokeStyle = "#ff0055";
            mainCtx.lineWidth = 3;
            mainCtx.strokeRect(...prediction.bbox);
            mainCtx.fillStyle = "#ff0055";
            mainCtx.font = "bold 14px Courier New";
            mainCtx.fillText(`${prediction.class.toUpperCase()} ${Math.round(prediction.score * 100)}%`, prediction.bbox[0], prediction.bbox[1] > 10 ? prediction.bbox[1] - 5 : 10);
            if (prediction.score > 0.66) logEvent(`AI DETECTED: ${prediction.class}`);
        });
    }
    requestAnimationFrame(processViewfinder);
}

// 3. System Toggles
async function toggleFlashlight() {
    if (!stream) return alert("Sync System first!");
    const track = stream.getVideoTracks()[0];
    try {
        isFlashlightOn = !isFlashlightOn;
        await track.applyConstraints({ advanced: [{ torch: isFlashlightOn }] });
        document.getElementById('torchBtn').innerText = `Flashlight: ${isFlashlightOn ? 'ON' : 'OFF'}`;
    } catch (e) { alert("Flashlight not supported."); }
}

function toggleMode() {
    const title = document.getElementById('modeTitle');
    const nvControls = document.getElementById('nvControls');
    if (currentMode === "NORMAL") currentMode = "SLS";
    else if (currentMode === "SLS") currentMode = "NIGHTVISION";
    else currentMode = "NORMAL";
    title.innerText = "SYSTEM: " + currentMode + " MODE";
    nvControls.style.display = currentMode === "NIGHTVISION" ? "flex" : "none";
}

function toggleFullscreen() {
    const container = document.getElementById('cameraContainer');
    if (!document.fullscreenElement) container.requestFullscreen();
    else document.exitFullscreen();
}

// 4. Recording & Logic
function toggleRecording() {
    const btn = document.getElementById('recBtn');
    if (!recorder || recorder.state === "inactive") {
        recordedChunks = [];
        const canvasStream = mainCanvas.captureStream(30);
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) canvasStream.addTrack(audioTracks[0]);
        recorder = new MediaRecorder(canvasStream);
        recorder.ondataavailable = e => recordedChunks.push(e.data);
        recorder.onstop = () => document.getElementById('downloadBtn').disabled = false;
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

// 5. Sensors
function armREMPod() {
    if (sensorActive) return;
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(res => { if (res == 'granted') startMotion(); });
    } else { startMotion(); }
}

function startMotion() {
    sensorActive = true;
    window.addEventListener('devicemotion', handleMotion);
    document.getElementById('remStatus').innerText = "ARMED";
}

function disarmREMPod() {
    sensorActive = false;
    window.removeEventListener('devicemotion', handleMotion);
    document.getElementById('remStatus').innerText = "STANDBY";
    document.getElementById('remStatus').classList.remove('alert');
}

function handleMotion(e) {
    let acc = e.accelerationIncludingGravity;
    let total = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);
    if (Math.abs(total - lastTotal) > 2.0) {
        logEvent("MOTION DETECTED");
        document.getElementById('remStatus').classList.add('alert');
        setTimeout(() => document.getElementById('remStatus').classList.remove('alert'), 500);
    }
    lastTotal = total;
}

function logEvent(msg) {
    const logEl = document.getElementById('timestampLog');
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    if (logs[logs.length-1] !== entry) {
        logs.push(entry);
        logEl.innerHTML = entry + "<br>" + logEl.innerHTML;
    }
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
        for(let i=0; i<dArray.length; i+=25) aCtx.fillRect(i/4, audioCanvas.height - dArray[i]/2, 4, dArray[i]/2);
    }
    draw();
}

document.getElementById('nvGain').addEventListener('input', (e) => {
    nvMultiplier = e.target.value;
    document.getElementById('nvGainVal').innerText = nvMultiplier + "x";
});
