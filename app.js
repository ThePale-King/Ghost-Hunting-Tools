// Shared Audio Pipeline initialization helper
let audioCtx;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Global scope tracker for real-time video manipulation multiplier
let nvMultiplier = 6; 

// Dynamic Slider Input Hook
const nvGainSlider = document.getElementById('nvGain');
const nvGainVal = document.getElementById('nvGainVal');

if (nvGainSlider) {
    nvGainSlider.addEventListener('input', (e) => {
        nvMultiplier = parseFloat(e.target.value);
        nvGainVal.innerText = nvMultiplier + "x";
    });
}
