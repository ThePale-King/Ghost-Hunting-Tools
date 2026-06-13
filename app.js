const rawVideo = document.getElementById('rawVideo');
const mainCanvas = document.getElementById('mainCanvas');
const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
const audioCanvas = document.getElementById('audioCanvas');

let audioCtx, recorder, stream, recordedChunks = [];
let logs = [], nvMultiplier = 6, currentMode = "SLS"; 
let isFlashlightOn = false, sensorActive = false, lastTotal = 0;

window.onload = () => {
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
            video: { facingMode: "environment" }, 
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
    } catch (e) { alert("Camera Access Required."); }
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

async function toggleFlashlight() {
    if (!stream) return alert("Sync System first!");
    const track = stream.getVideoTracks()[0];
    try {
        isFlashlightOn = !isFlashlightOn;
        await track.applyConstraints({ advanced: [{ torch: isFlashlightOn }] });
        document.getElementById('torchBtn').innerText = `Flashlight: ${isFlashlightOn ? 'ON' : 'OFF'}`;
    } catch (e) { alert("Flashlight not supported on this device."); }
}

function toggleMode() {
    currentMode = (currentMode === "SLS") ? "NIGHTVISION" : "SLS";
    document.getElementById('modeTitle').innerText = currentMode === "SLS" ? "SYSTEM: SLS OVERLAY" : "SYSTEM: NV AMPLIFIER";
    document.getElementById('nvControls').style.display = currentMode === "SLS" ? "none" : "flex";
}

function toggleFullscreen() {
    const container = document.getElementById('cameraContainer');
    if (!document.fullscreenElement) container.requestFullscreen();
    else document.exitFullscreen();
}

function toggleRecording() {
    const btn = document.getElementById('recBtn');
    if (!recorder || recorder.state === "inactive") {
        recordedChunks = [];
        const canvasStream = mainCanvas.captureStream(30);
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) canvasStream.addTrack(audioTracks);
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
        const entry = `[${new Date().toLocaleTimeString()}] MOTION`;
        logs.push(entry);
        document.getElementById('timestampLog').innerHTML = entry + "<br>" + document.getElementById('timestampLog').innerHTML;
        document.getElementById('remStatus').classList.add('alert');
        setTimeout(() => document.getElementById('remStatus').classList.remove('alert'), 500);
    }
    lastTotal = total;
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
