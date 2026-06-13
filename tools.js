// --- 1. SLS CAMERA OVERLAY ---
async function startSLS() {
    const video = document.getElementById('slsVideo');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" }, 
            audio: false 
        });
        video.srcObject = stream;
        video.style.filter = "matrix(0,0,0,0,0, 0,1,0,0,0, 0,0,0,0,0, 0,0,0,1,0) hue-rotate(90deg) brightness(1.3) contrast(1.6)";
    } catch (err) {
        alert("SLS Lens setup failed: Verification/Permission missing.");
    }
}

// --- 2. HIGHLY SENSITIVE REM POD ---
let isArmed = false;
let lastX = 0, lastY = 0, lastZ = 0;
// Lower value = higher sensitivity. 0.3 means minor vibrations trigger it
const motionSensitivityThreshold = 0.3; 

function armREMPod() {
    getAudioContext(); 
    
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    activateMotionSensor();
                }
            }).catch(console.error);
    } else {
        activateMotionSensor();
    }
}

function activateMotionSensor() {
    if(isArmed) return;
    window.addEventListener('devicemotion', handleHighSensitivityMotion);
    isArmed = true;
    document.getElementById('remStatus').innerText = "ARMED";
    document.getElementById('remStatus').style.color = "#00ff66";
}

function handleHighSensitivityMotion(event) {
    let acc = event.acceleration; // Strips gravity to track actual raw hardware vibrations
    if (!acc || acc.x === null) {
        // Fallback if hardware device acceleration matrix is restricted
        acc = event.accelerationIncludingGravity;
    }
    if (!acc) return;

    // Track delta movement shifts between execution ticks
    let deltaX = Math.abs(acc.x - lastX);
    let deltaY = Math.abs(acc.y - lastY);
    let deltaZ = Math.abs(acc.z - lastZ);
    
    let totalDelta = deltaX + deltaY + deltaZ;
    document.getElementById('remVal').innerText = `VIBE SENSOR DELTA: ${totalDelta.toFixed(3)}`;

    // Initial pass check prevents immediate false alarms on execution boot
    if (lastX !== 0 && totalDelta > motionSensitivityThreshold) {
        triggerREMAalarm();
    }

    lastX = acc.x;
    lastY = acc.y;
    lastZ = acc.z;
}

function triggerREMAalarm() {
    const ctx = getAudioContext();
    const remStatus = document.getElementById('remStatus');
    
    if(remStatus.innerText === "TRIGGERED") return; // Avoid duplicate logs during active alarms
    
    remStatus.innerText = "TRIGGERED";
    remStatus.classList.add('alert');

    // Generate audio pulse spike
    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);

    // Save and Append local Timestamp data to the viewport log
    const timestampLog = document.getElementById('timestampLog');
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}.${now.getMilliseconds().toString().padStart(3,'0')}`;
    
    if (timestampLog.innerText === "No triggers recorded yet.") {
        timestampLog.innerHTML = "";
    }
    timestampLog.innerHTML = `[${timeStr}] EVT MOTION DETECTED<br>` + timestampLog.innerHTML;

    setTimeout(() => {
        if(isArmed) {
            remStatus.innerText = "ARMED";
            remStatus.classList.remove('alert');
        }
    }, 600);
}

// --- 3. EVP AUDIO RECORDER & PLAYBACK CONTEXT ---
let mediaRecorder;
let audioChunks = [];
let audioBlobUrl = null; 
let isRecording = false;
let visualizerAnimationId;

async function toggleEVP() {
    const recBtn = document.getElementById('recBtn');
    const playBtn = document.getElementById('playBtn');
    const ctx = getAudioContext();

    if (!isRecording) {
        audioChunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            mediaRecorder = new MediaRecorder(stream);
            
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 32;
            source.connect(analyser);
            setupVisualizer(analyser);

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm; codecs=opus' });
                // Clean up any old recording objects sitting inside storage frames
                if(audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
                audioBlobUrl = URL.createObjectURL(audioBlob);
                playBtn.disabled = false;
            };

            mediaRecorder.start();
            recBtn.innerText = "STOP REC";
            recBtn.style.borderColor = "#ff0055";
            recBtn.style.color = "#ff0055";
            isRecording = true;
        } catch (err) {
            alert("EVP Microphonic input registration failure.");
        }
    } else {
        mediaRecorder.stop();
        cancelAnimationFrame(visualizerAnimationId);
        recBtn.innerText = "RECORD EVP";
        recBtn.style.borderColor = "#00ff66";
        recBtn.style.color = "#00ff66";
        isRecording = false;
    }
}

function playEVP() {
    if (audioBlobUrl) {
        const audio = new Audio(audioBlobUrl);
        audio.play().catch(e => console.error("Playback interrupted:", e));
    }
}

function setupVisualizer(analyser) {
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        visualizerAnimationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = '#0d1117';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.2;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 1.3;
            canvasCtx.fillStyle = '#00ff66';
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }
    draw();
}

// --- 4. NIGHT VISION CAMERA PRODUCER AND LAYER PROCESSOR ---
const nvVideo = document.getElementById('nvHiddenVideo');
const nvCanvas = document.getElementById('nvViewfinder');
let nvCtx;

async function startNightVision() {
    document.getElementById('nvBtn').style.display = 'none';
    nvCtx = nvCanvas.getContext('2d', { willReadFrequently: true });
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: "environment",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });
        
        // Link stream to hidden video container
        nvVideo.srcObject = stream;
        
        // Essential iOS framework event hook to start calculation loops
        nvVideo.onloadedmetadata = () => {
            nvVideo.play();
            nvCanvas.width = nvVideo.videoWidth;
            nvCanvas.height = nvVideo.videoHeight;
            requestAnimationFrame(processNVFrame);
        };
    } catch (err) {
        alert("Night Vision camera capture failure.");
        document.getElementById('nvBtn').style.display = 'block';
    }
}

function processNVFrame() {
    // Check if the camera feed is running
    if (nvVideo.paused || nvVideo.ended || !nvVideo.srcObject) {
        requestAnimationFrame(processNVFrame);
        return;
    }

    // Paint camera data snapshot directly into canvas rendering zone
    nvCtx.drawImage(nvVideo, 0, 0, nvCanvas.width, nvCanvas.height);
    
    const frameData = nvCtx.getImageData(0, 0, nvCanvas.width, nvCanvas.height);
    const data = frameData.data;

    // Loop through every pixel inside the current canvas screen window frame
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i+1];
        let b = data[i+2];

        // Process luminance value
        let rawLuminance = (0.299 * r + 0.587 * g + 0.114 * b);
        
        // Multiply by the active slider value tracked globally inside app.js
        let boosted = rawLuminance * nvMultiplier;
        if (boosted > 255) boosted = 255; 

        // Strip structural colors to output a brightened green phosphor screen layout
        data[i] = boosted * 0.15;   
        data[i+1] = boosted;       
        data[i+2] = boosted * 0.15; 
    }

    // Paint updated matrix values back over viewfinder frame
    nvCtx.putImageData(frameData, 0, 0);
    
    // Recursive frame calculation hook
    requestAnimationFrame(processNVFrame);
}
