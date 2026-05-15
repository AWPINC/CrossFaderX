let audioCtx;
let masterGainNode; // Общий узел громкости
let tracks = [];
let isPlaying = false;
let currentMode = 'play';
let activeTrackIndex = 0;
let lastTime = 0;
let animationId;
let globalDuration = 0;

// DOM Элементы
const fileUpload = document.getElementById('file-upload');
const trackContainer = document.getElementById('track-container');
const playPauseBtn = document.getElementById('play-pause-btn');
const stopBtn = document.getElementById('stop-btn');
const fadeTimeInput = document.getElementById('fade-time');
const globalProgressContainer = document.getElementById('global-progress-container');
const globalProgressFill = document.getElementById('global-progress-fill');
const globalPlayhead = document.getElementById('global-playhead');

const modePlayBtn = document.getElementById('mode-play');
const modeManageBtn = document.getElementById('mode-manage');

// Сменяющиеся элементы
const gridSettings = document.getElementById('grid-settings');
const columnInput = document.getElementById('column-count');
const columnVal = document.getElementById('column-val');
const volumeSettings = document.getElementById('volume-settings');
const volumeInput = document.getElementById('master-volume');
const volumeVal = document.getElementById('volume-val');

// --- 1. ЗАГРУЗКА И ПОДГОТОВКА ---
fileUpload.addEventListener('change', function(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Создаем мастер-громкость и подключаем к выходу
        masterGainNode = audioCtx.createGain();
        masterGainNode.connect(audioCtx.destination);
        masterGainNode.gain.value = parseFloat(volumeInput.value);
    }
    
    cleanupSession();
    
    files.forEach((file, i) => {
        const fileUrl = URL.createObjectURL(file);
        const audioEl = new Audio(fileUrl);
        
        if (i === 0) {
            audioEl.addEventListener('loadedmetadata', () => {
                globalDuration = audioEl.duration;
            });
        }

        const trackSource = audioCtx.createMediaElementSource(audioEl);
        const gainNode = audioCtx.createGain();
        
        // Подключаем: Источник -> Локальная громкость -> Мастер громкость
        trackSource.connect(gainNode);
        gainNode.connect(masterGainNode);

        const isFirst = i === 0;
        gainNode.gain.value = isFirst ? 1.0 : 0.0;

        const btn = document.createElement('div');
        btn.className = `track-btn ${isFirst ? 'active' : ''}`;
        btn.dataset.index = i;
        
        const trackPlayhead = document.createElement('div');
        trackPlayhead.className = 'track-playhead';
        
        const title = document.createElement('div');
        title.className = 'track-title';
        title.textContent = file.name;

        btn.appendChild(trackPlayhead);
        btn.appendChild(title);
        
        btn.style.setProperty('--vol', `${(isFirst ? 1 : 0) * 100}%`);
        trackContainer.appendChild(btn);

        btn.addEventListener('click', () => {
            if (currentMode === 'play') switchTrack(i);
        });

        tracks.push({
            id: i,
            audioElement: audioEl,
            gainNode: gainNode,
            uiElement: btn,
            localPlayhead: trackPlayhead,
            currentVolume: isFirst ? 1.0 : 0.0,
            targetVolume: isFirst ? 1.0 : 0.0
        });
        
        setupDragAndDrop(btn);
    });

    playPauseBtn.disabled = false;
    playPauseBtn.textContent = "Play";
    playPauseBtn.className = "transport-btn play";
    activeTrackIndex = 0;
    
    requestAnimationFrame(updateUI);
});

function cleanupSession() {
    tracks.forEach(t => {
        t.audioElement.pause();
        URL.revokeObjectURL(t.audioElement.src);
    });
    tracks = [];
    trackContainer.innerHTML = '';
    globalPlayhead.style.left = '0%';
    globalProgressFill.style.width = '0%';
    cancelAnimationFrame(animationId);
}

// --- 2. ТРАНСПОРТ (PLAY/PAUSE/STOP) ---
playPauseBtn.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (!isPlaying) {
        // Принудительная синхронизация по первому треку при старте
        if (tracks.length > 0) {
            const syncTime = tracks[0].audioElement.currentTime;
            tracks.forEach(t => {
                t.audioElement.currentTime = syncTime;
                t.audioElement.play();
            });
        }
        
        isPlaying = true;
        playPauseBtn.textContent = "Pause";
        playPauseBtn.className = "transport-btn pause";
        lastTime = performance.now();
        requestAnimationFrame(updateVolumes);
    } else {
        tracks.forEach(t => t.audioElement.pause());
        isPlaying = false;
        playPauseBtn.textContent = "Play";
        playPauseBtn.className = "transport-btn play";
    }
});

stopBtn.addEventListener('click', () => {
    tracks.forEach(t => {
        t.audioElement.pause();
        t.audioElement.currentTime = 0;
    });
    isPlaying = false;
    playPauseBtn.textContent = "Play";
    playPauseBtn.className = "transport-btn play";
    updateUI();
});

// --- 3. МИКШИРОВАНИЕ ---
function switchTrack(selectedIndex) {
    activeTrackIndex = selectedIndex;
    tracks.forEach(track => {
        if (track.id === selectedIndex) {
            track.targetVolume = 1.0;
            track.uiElement.classList.add('active');
        } else {
            track.targetVolume = 0.0;
            track.uiElement.classList.remove('active');
        }
    });
}

function updateVolumes(currentTime) {
    if (!lastTime) lastTime = currentTime;
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    const fadeTime = parseFloat(fadeTimeInput.value) || 2.0;
    const speed = 1.0 / fadeTime;

    tracks.forEach(track => {
        if (track.currentVolume < track.targetVolume) {
            track.currentVolume = Math.min(track.currentVolume + speed * deltaTime, track.targetVolume);
        } else if (track.currentVolume > track.targetVolume) {
            track.currentVolume = Math.max(track.currentVolume - speed * deltaTime, track.targetVolume);
        }
        track.gainNode.gain.value = track.currentVolume;
        track.uiElement.style.setProperty('--vol', `${track.currentVolume * 100}%`);
    });

    if (isPlaying) requestAnimationFrame(updateVolumes);
}

// --- 4. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (КУРСОРЫ) ---
function updateUI() {
    if (tracks.length > 0 && globalDuration > 0) {
        const currentTime = tracks[0].audioElement.currentTime;
        const progressPercent = (currentTime / globalDuration) * 100;
        
        globalPlayhead.style.left = `${progressPercent}%`;
        globalProgressFill.style.width = `${progressPercent}%`;

        tracks.forEach(t => {
            if (t.id === activeTrackIndex) {
                t.localPlayhead.style.left = `${progressPercent}%`;
            }
        });

        if (currentTime > 0) {
            stopBtn.disabled = false;
        } else {
            stopBtn.disabled = true;
        }

        if (currentTime >= globalDuration) stopBtn.click();
    }
    animationId = requestAnimationFrame(updateUI);
}

// --- 5. ПЕРЕМОТКА (СИНХРОННЫЙ SEEKING) ---
globalProgressContainer.addEventListener('click', (e) => {
    if (tracks.length === 0 || globalDuration === 0) return;
    const rect = globalProgressContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * globalDuration;
    
    // ВАЖНО: Чтобы избежать рассинхрона, ставим на паузу
    const wasPlaying = isPlaying;
    if (wasPlaying) {
        tracks.forEach(t => t.audioElement.pause());
    }
    
    // Перематываем в тишине
    for (let i = 0; i < tracks.length; i++) {
        tracks[i].audioElement.currentTime = newTime;
    }
    
    // Запускаем одновременно, если до этого играло
    if (wasPlaying) {
        tracks.forEach(t => t.audioElement.play());
    }
    
    updateUI(); 
});

// --- 6. РЕЖИМЫ И НАСТРОЙКИ (МАСТЕР ГРОМКОСТЬ / СЕТКА) ---
modePlayBtn.addEventListener('click', () => setMode('play'));
modeManageBtn.addEventListener('click', () => setMode('manage'));

function setMode(mode) {
    currentMode = mode;
    modePlayBtn.classList.toggle('active', mode === 'play');
    modeManageBtn.classList.toggle('active', mode === 'manage');
    
    // Сменяем ползунки внутри фиксированного блока
    volumeSettings.style.display = (mode === 'play') ? 'flex' : 'none';
    gridSettings.style.display = (mode === 'manage') ? 'flex' : 'none';
    
    tracks.forEach(t => {
        t.uiElement.draggable = (mode === 'manage');
        if (mode === 'manage') {
            t.uiElement.classList.add('draggable');
        } else {
            t.uiElement.classList.remove('draggable');
            t.uiElement.classList.remove('dragging');
        }
    });
}

// Управление мастер громкостью
volumeInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    volumeVal.textContent = `${Math.round(val * 100)}%`;
    if (masterGainNode) {
        masterGainNode.gain.value = val;
    }
});

// Управление колонками
columnInput.addEventListener('input', (e) => {
    const val = e.target.value;
    columnVal.textContent = val;
    trackContainer.style.setProperty('--grid-cols', val);
});

// --- 7. DRAG & DROP ---
let draggedItem = null;

function setupDragAndDrop(element) {
    element.addEventListener('dragstart', function() {
        if (currentMode !== 'manage') return;
        draggedItem = this;
        setTimeout(() => this.classList.add('dragging'), 0);
    });

    element.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        draggedItem = null;
        trackContainer.querySelectorAll('.track-btn').forEach(el => el.classList.remove('drag-over'));
    });

    element.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (this !== draggedItem && currentMode === 'manage') {
            this.classList.add('drag-over');
        }
    });

    element.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
    });

    element.addEventListener('drop', function() {
        if (this !== draggedItem && currentMode === 'manage') {
            this.classList.remove('drag-over');
            const allItems = Array.from(trackContainer.querySelectorAll('.track-btn'));
            const draggedIdx = allItems.indexOf(draggedItem);
            const targetIdx = allItems.indexOf(this);
            
            if (draggedIdx < targetIdx) {
                this.after(draggedItem);
            } else {
                this.before(draggedItem);
            }
        }
    });
}