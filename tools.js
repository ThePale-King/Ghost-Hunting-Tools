
// --- 1. SLS CAMERA LOGIC ---
async function startSLS() {
    const video = document.getElementById('slsVideo');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        video.srcObject = stream;
        video.style.filter = "matrix(0,0,0,0,0, 0,1,0,0,0, 0,0,0,0,0, 0,0,0,1,0) hue-rotate(90deg) brightness(1.2) contrast(1.5)";
    } catch (err) {
        alert("Camera access denied or unavailable.");
    }
}

// --- 2. REM POD LOGIC ---
let threshold = 1.5; 

function armREMPod() {
    getAudioContext(); // Resumes hardware audio node connection
    
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('devicemotion', handleMotion);
                }
            }).catch(console.error);
    } else {
        window.addEventListener('devicemotion', handleMotion);
    }
}

function triggerREMAalarm() {
    const ctx = getAudioContext();
    const remStatus = document.getElementById('remStatus');
    remStatus.innerText = "TRIGGERED";
    remStatus.classList.add('alert');

    let osc = ctx.createOscillator();
    let gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, ctx.currentTime); 
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.3); 

    setTimeout(() => {
        remStatus.innerText = "CALIBRATED";
        remStatus.classList.remove('alert');
    }, 800);
}

function handleMotion(event) {
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    
    let totalMovement = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
    document.getElementById('remVal').innerText = `X: ${(acc.x||0).toFixed(1)} Y: ${(acc.y||0).toFixed(1)} Z: ${(acc.z||0).toFixed(1)}`;
    
    if (totalMovement > 15) { 
        triggerREMAalarm();
    }
}

// --- 3. EVP RECORDER LOGIC ---
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let isRecording = false;

async function toggleEVP() {
    const recBtn = document.getElementById('recBtn');
    const ctx = getAudioContext();

    if (!isRecording) {
        audioChunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 32;
            source.connect(analyser);
            setupVisualizer(analyser);

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                document.getElementById('playBtn').disabled = false;
            };

            mediaRecorder.start();
            recBtn.innerText = "STOP REC";
            recBtn.style.borderColor = "#ff0055";
            recBtn.style.color = "#ff0055";
            isRecording = true;
        } catch (err) {
            alert("Microphone access required for EVP recording.");
        }
    } else {
        mediaRecorder.stop();
        recBtn.innerText = "RECORD EVP";
        recBtn.style.borderColor = "#00ff66";
        recBtn.style.color = "#00ff66";
        isRecording = false;
    }
}

function playEVP() {
    if (audioBlob) {
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
    }
}

function setupVisualizer(analyser) {
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        if (!isRecording) {
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = '#0d1117';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 1.5;
            canvasCtx.fillStyle = '#00ff66';
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }
    draw();
}

// --- 4. NIGHT VISION AMPLIFIER LOGIC ---
const nvVideo = document.getElementById('nvHiddenVideo');
const nvCanvas = document.getElementById('nvViewfinder');
let nvCtx;
let nvMultiplier = 4;

async function startNightVision() {
    document.getElementById('nvBtn').style.display = 'none';
    nvCtx = nvCanvas.getContext('2d', { willReadFrequently: true });
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", brightness: { ideal: 100 } },
            audio: false
        });
        nvVideo.srcObject = stream;
        nvVideo.addEventListener('loadedmetadata', () => {
            nvCanvas.width = nvVideo.videoWidth;
            nvCanvas.height = nvVideo.videoHeight;
            requestAnimationFrame(processNVFrame);
        });
    } catch (err) {
        alert("Night Vision sensor access error.");
        document.getElementById('nvBtn').style.display = 'block';
    }
}

function processNVFrame() {
    if (nvVideo.paused || nvVideo.ended) return;

    nvCtx.drawImage(nvVideo, 0, 0, nvCanvas.width, nvCanvas.height);
    const frameData = nvCtx.getImageData(0, 0, nvCanvas.width, nvCanvas.height);
    const data = frameData.data;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i+1];
        let b = data[i+2];

        let rawLuminance = (0.299 * r + 0.587 * g + 0.114 * b);
        let boosted = rawLuminance * nvMultiplier;
        if (boosted > 255) boosted = 255;

        data[i] = boosted * 0.15;   
        data[i+1] = boosted;       
        data[i+2] = boosted * 0.15; 
    }

    nvCtx.putImageData(frameData, 0, 0);
    requestAnimationFrame(processNVFrame);
}
