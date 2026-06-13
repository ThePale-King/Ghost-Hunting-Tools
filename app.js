
// Global Shared Configurations and UI listeners
let audioCtx;

// Initialize shared AudioContext across recorders and sound alerts safely
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Night Vision Gain Slider Setup
const nvGainSlider = document.getElementById('nvGain');
const nvGainVal = document.getElementById('nvGainVal');

if (nvGainSlider) {
    nvGainSlider.addEventListener('input', (e) => {
        nvMultiplier = parseFloat(e.target.value);
        nvGainVal.innerText = nvMultiplier + "x";
    });
}
