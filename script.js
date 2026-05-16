let audioCtx;
let masterGainNode; 
let groups = [];
let groupIdCounter = 0;
let currentMode = 'play';
let mixMode = 'single';
let lastTime = 0;
let animationId;

// DOM Элементы
const fileUpload = document.getElementById('file-upload');
const addGroupBtn = document.getElementById('add-group-btn');
const groupsContainer = document.getElementById('groups-container');
const fadeTimeInput = document.getElementById('fade-time');
const globalPlayBtn = document.getElementById('global-play-btn');
const globalStopBtn = document.getElementById('global-stop-btn');

const modePlayBtn = document.getElementById('mode-play');
const modeManageBtn = document.getElementById('mode-manage');
const mixSingleBtn = document.getElementById('mix-single');
const mixMultiBtn = document.getElementById('mix-multi');

const gridSettings = document.getElementById('grid-settings');
const columnInput = document.getElementById('column-count');
const columnVal = document.getElementById('column-val');
const volumeSettings = document.getElementById('volume-settings');
const volumeInput = document.getElementById('master-volume');
const volumeVal = document.getElementById('volume-val');

// --- ИНИЦИАЛИЗАЦИЯ AUDIO CONTEXT ---
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGainNode = audioCtx.createGain();
        masterGainNode.connect(audioCtx.destination);
        masterGainNode.gain.value = parseFloat(volumeInput.value);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// --- СОЗДАНИЕ ГРУППЫ ---
function createGroup(files = []) {
    initAudio();

    const group = {
        id: ++groupIdCounter,
        tracks: [],
        isPlaying: false,
        duration: 0,
        currentVolume: 0.0,
        targetVolume: 0.0,
        isFadingOut: false,
        fadeAction: null,
        gainNode: audioCtx.createGain(),
        ui: {}
    };
    
    // Группа стартует с громкостью 0 (чтобы плавно появиться при Play)
    group.gainNode.gain.value = 0;
    group.gainNode.connect(masterGainNode);

    buildGroupUI(group);
    groups.push(group);

    if (files.length > 0) {
        Array.from(files).forEach((file, i) => addTrackToGroup(group, file, i === 0));
    }
}

function buildGroupUI(group) {
    const container = document.createElement('div');
    container.className = 'group-container';
    
    // Шапка: Play -> Progress -> Close
    const header = document.createElement('div');
    header.className = 'group-header';
    
    const playBtn = document.createElement('button');
    playBtn.className = 'transport-btn play group-play-btn';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => toggleGroupPlay(group));

    const progressContainer = document.createElement('div');
    progressContainer.className = 'global-progress group-progress-container';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    const progressKnob = document.createElement('div');
    progressKnob.className = 'progress-knob';
    progressContainer.append(progressFill, progressKnob);

    // Перемотка группы
    progressContainer.addEventListener('click', (e) => {
        if (group.tracks.length === 0 || group.duration === 0) return;
        const rect = progressContainer.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = Math.round(percentage * group.duration); // Округление до секунды
        
        const wasPlaying = group.isPlaying && !group.isFadingOut;
        if (wasPlaying) group.tracks.forEach(t => t.audioElement.pause());
        
        group.tracks.forEach(t => t.audioElement.currentTime = newTime);
        
        if (wasPlaying) Promise.all(group.tracks.map(t => t.audioElement.play())).catch(e => console.error(e));
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'transport-btn stop group-close-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => closeGroup(group));

    header.append(playBtn, progressContainer, closeBtn);

    const trackGrid = document.createElement('div');
    trackGrid.className = 'tracks-grid';
    trackGrid.style.setProperty('--grid-cols', columnInput.value);

    container.append(header, trackGrid);
    groupsContainer.append(container);

    group.ui = { container, playBtn, progressFill, progressKnob, trackGrid };
    setupGridDragAndDrop(group);
}

// --- ДОБАВЛЕНИЕ И УПРАВЛЕНИЕ ТРЕКАМИ ---
function addTrackToGroup(group, file, isFirst) {
    const fileUrl = URL.createObjectURL(file);
    const audioEl = new Audio(fileUrl);
    
    audioEl.addEventListener('loadedmetadata', () => {
        if (audioEl.duration > group.duration) group.duration = audioEl.duration;
    });

    const trackSource = audioCtx.createMediaElementSource(audioEl);
    const gainNode = audioCtx.createGain();
    trackSource.connect(gainNode);
    gainNode.connect(group.gainNode);

    gainNode.gain.value = isFirst ? 1.0 : 0.0;

    const btn = document.createElement('div');
    btn.className = `track-btn ${isFirst ? 'active' : ''}`;
    
    const trackPlayhead = document.createElement('div');
    trackPlayhead.className = 'track-playhead';
    
    const title = document.createElement('div');
    title.className = 'track-title';
    title.textContent = file.name;

    btn.appendChild(trackPlayhead);
    btn.appendChild(title);
    btn.style.setProperty('--vol', `${(isFirst ? 1 : 0) * 100}%`);
    btn.draggable = (currentMode === 'manage');
    if (currentMode === 'manage') btn.classList.add('draggable');

    group.ui.trackGrid.appendChild(btn);

    const track = {
        id: 't_' + Date.now() + Math.random(),
        audioElement: audioEl,
        gainNode: gainNode,
        uiElement: btn,
        localPlayhead: trackPlayhead,
        currentVolume: isFirst ? 1.0 : 0.0,
        targetVolume: isFirst ? 1.0 : 0.0
    };

    btn.addEventListener('click', () => handleTrackClick(track));
    
    setupTrackDragAndDrop(track);
    group.tracks.push(track);
}

function handleTrackClick(track) {
    if (currentMode !== 'play') return;
    const group = groups.find(g => g.tracks.includes(track));
    if (!group) return;

    if (mixMode === 'single') {
        group.tracks.forEach(t => {
            t.targetVolume = (t.id === track.id) ? 1.0 : 0.0;
            t.uiElement.classList.toggle('active', t.id === track.id);
        });
    } else {
        if (track.targetVolume > 0) {
            track.targetVolume = 0.0;
            track.uiElement.classList.remove('active');
        } else {
            track.targetVolume = 1.0;
            track.uiElement.classList.add('active');
        }
    }
}

// --- УПРАВЛЕНИЕ ВОСПРОИЗВЕДЕНИЕМ ---
function toggleGroupPlay(group) {
    if (!group.isPlaying || group.isFadingOut) playGroup(group);
    else pauseGroup(group);
    updateGlobalTransportUI();
}

function playGroup(group) {
    initAudio();
    if (group.tracks.length > 0) {
        const syncTime = Math.round(group.tracks[0].audioElement.currentTime);
        group.tracks.forEach(t => t.audioElement.currentTime = syncTime);
        Promise.all(group.tracks.map(t => t.audioElement.play())).catch(e => console.error(e));
    }
    group.targetVolume = 1.0;
    group.isPlaying = true;
    group.isFadingOut = false;
    group.ui.playBtn.textContent = 'Pause';
    group.ui.playBtn.className = 'transport-btn pause group-play-btn';
}

function pauseGroup(group) {
    group.targetVolume = 0.0;
    group.isFadingOut = true;
    group.fadeAction = 'pause';
}

function stopGroup(group) {
    group.targetVolume = 0.0;
    group.isFadingOut = true;
    group.fadeAction = 'stop';
}

function closeGroup(group) {
    group.tracks.forEach(t => {
        t.audioElement.pause();
        URL.revokeObjectURL(t.audioElement.src);
    });
    group.gainNode.disconnect();
    group.ui.container.remove();
    groups = groups.filter(g => g.id !== group.id);
    updateGlobalTransportUI();
}

globalPlayBtn.addEventListener('click', () => {
    const isAnyPlaying = groups.some(g => g.isPlaying && !g.isFadingOut);
    groups.forEach(g => isAnyPlaying ? pauseGroup(g) : playGroup(g));
    updateGlobalTransportUI();
});

globalStopBtn.addEventListener('click', () => {
    groups.forEach(g => stopGroup(g));
    updateGlobalTransportUI();
});

function updateGlobalTransportUI() {
    const isAnyPlaying = groups.some(g => g.isPlaying && !g.isFadingOut);
    globalPlayBtn.textContent = isAnyPlaying ? 'Pause All' : 'Play All';
    globalPlayBtn.className = isAnyPlaying ? 'transport-btn pause' : 'transport-btn play';
}

// --- ОБЩИЙ РЕНДЕР И ЗАТУХАНИЕ ---
function renderLoop(currentTimeStr) {
    if (!lastTime) lastTime = currentTimeStr;
    const deltaTime = (currentTimeStr - lastTime) / 1000;
    lastTime = currentTimeStr;

    const fadeTime = parseFloat(fadeTimeInput.value) || 1.0;
    const speed = 1.0 / fadeTime;

    groups.forEach(group => {
        // 1. Плавный fade in/out для самой группы (Play/Pause/Stop)
        if (group.currentVolume < group.targetVolume) {
            group.currentVolume = Math.min(group.currentVolume + speed * deltaTime, group.targetVolume);
        } else if (group.currentVolume > group.targetVolume) {
            group.currentVolume = Math.max(group.currentVolume - speed * deltaTime, group.targetVolume);
        }
        group.gainNode.gain.value = group.currentVolume;

        // Если группа затухала и достигла 0 громкости - останавливаем
        if (group.isFadingOut && group.currentVolume <= 0) {
            group.tracks.forEach(t => t.audioElement.pause());
            if (group.fadeAction === 'stop') {
                group.tracks.forEach(t => t.audioElement.currentTime = 0);
            }
            group.isFadingOut = false;
            group.isPlaying = false;
            group.ui.playBtn.textContent = 'Play';
            group.ui.playBtn.className = 'transport-btn play group-play-btn';
            updateGlobalTransportUI();
        }

        // 2. Плавный кроссфейд для треков внутри группы
        group.tracks.forEach(track => {
            if (track.currentVolume < track.targetVolume) {
                track.currentVolume = Math.min(track.currentVolume + speed * deltaTime, track.targetVolume);
            } else if (track.currentVolume > track.targetVolume) {
                track.currentVolume = Math.max(track.currentVolume - speed * deltaTime, track.targetVolume);
            }
            track.gainNode.gain.value = track.currentVolume;
            track.uiElement.style.setProperty('--vol', `${track.currentVolume * 100}%`);
        });

        // 3. Обновление UI прогресса
        if (group.tracks.length > 0 && group.duration > 0) {
            const time = group.tracks[0].audioElement.currentTime;
            const progress = (time / group.duration) * 100;
            
            group.ui.progressFill.style.width = `${progress}%`;
            group.ui.progressKnob.style.left = `${progress}%`;
            
            group.tracks.forEach(t => t.localPlayhead.style.left = `${progress}%`);

            if (time >= group.duration && group.isPlaying && !group.isFadingOut) {
                stopGroup(group);
            }
        }
    });

    animationId = requestAnimationFrame(renderLoop);
}

// Запускаем единый цикл рендера
requestAnimationFrame(renderLoop);

// --- ИВЕНТЫ: ЗАГРУЗКА, D&D WINDOWS, НАСТРОЙКИ ---
fileUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) createGroup(e.target.files);
    e.target.value = ''; // Сброс инпута
});

addGroupBtn.addEventListener('click', () => createGroup());

const dndOverlay = document.getElementById('dnd-overlay');
window.addEventListener('dragover', (e) => { e.preventDefault(); dndOverlay.classList.add('active'); });
window.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) dndOverlay.classList.remove('active'); });
window.addEventListener('drop', (e) => {
    e.preventDefault();
    dndOverlay.classList.remove('active');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const audioFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
        if (audioFiles.length > 0) createGroup(audioFiles);
    }
});

modePlayBtn.addEventListener('click', () => setMode('play'));
modeManageBtn.addEventListener('click', () => setMode('manage'));
mixSingleBtn.addEventListener('click', () => setMixMode('single'));
mixMultiBtn.addEventListener('click', () => setMixMode('multi'));

function setMode(mode) {
    currentMode = mode;
    modePlayBtn.classList.toggle('active', mode === 'play');
    modeManageBtn.classList.toggle('active', mode === 'manage');
    volumeSettings.style.display = (mode === 'play') ? 'flex' : 'none';
    gridSettings.style.display = (mode === 'manage') ? 'flex' : 'none';
    
    groups.forEach(g => {
        g.tracks.forEach(t => {
            t.uiElement.draggable = (mode === 'manage');
            t.uiElement.classList.toggle('draggable', mode === 'manage');
            t.uiElement.classList.remove('dragging');
        });
    });
}

function setMixMode(mode) {
    mixMode = mode;
    mixSingleBtn.classList.toggle('active', mode === 'single');
    mixMultiBtn.classList.toggle('active', mode === 'multi');
}

volumeInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    volumeVal.textContent = `${Math.round(val * 100)}%`;
    if (masterGainNode) masterGainNode.gain.value = val;
});

columnInput.addEventListener('input', (e) => {
    const val = e.target.value;
    columnVal.textContent = val;
    document.querySelectorAll('.tracks-grid').forEach(el => el.style.setProperty('--grid-cols', val));
});

// --- DRAG AND DROP (ПЕРЕМЕЩЕНИЕ ТРЕКОВ МЕЖДУ ГРУППАМИ) ---
let draggedTrack = null;

function setupTrackDragAndDrop(track) {
    track.uiElement.addEventListener('dragstart', function(e) {
        if (currentMode !== 'manage') return e.preventDefault();
        draggedTrack = track;
        setTimeout(() => this.classList.add('dragging'), 0);
    });

    track.uiElement.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        draggedTrack = null;
        document.querySelectorAll('.track-btn').forEach(el => el.classList.remove('drag-over'));
        document.querySelectorAll('.tracks-grid').forEach(el => el.classList.remove('grid-drag-over'));
    });

    track.uiElement.addEventListener('dragover', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (track !== draggedTrack && currentMode === 'manage') this.classList.add('drag-over');
    });

    track.uiElement.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
    });

    track.uiElement.addEventListener('drop', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (track !== draggedTrack && currentMode === 'manage' && draggedTrack) {
            this.classList.remove('drag-over');
            moveTrackToGroup(draggedTrack, this);
        }
    });
}

function setupGridDragAndDrop(group) {
    group.ui.trackGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (currentMode === 'manage' && draggedTrack) group.ui.trackGrid.classList.add('grid-drag-over');
    });
    group.ui.trackGrid.addEventListener('dragleave', () => group.ui.trackGrid.classList.remove('grid-drag-over'));
    group.ui.trackGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        group.ui.trackGrid.classList.remove('grid-drag-over');
        if (currentMode === 'manage' && draggedTrack) moveTrackToGroup(draggedTrack, null, group);
    });
}

function moveTrackToGroup(track, targetElement = null, targetGroupParam = null) {
    const sourceGroup = groups.find(g => g.tracks.includes(track));
    const targetGroup = targetGroupParam || groups.find(g => g.tracks.some(t => t.uiElement === targetElement));
    
    if (!sourceGroup || !targetGroup) return;

    sourceGroup.tracks = sourceGroup.tracks.filter(t => t.id !== track.id);
    
    if (sourceGroup !== targetGroup) {
        track.gainNode.disconnect();
        track.gainNode.connect(targetGroup.gainNode);
        
        // Синхронизация времени, если целевая группа играет
        if (targetGroup.isPlaying) {
            const syncTime = targetGroup.tracks.length > 0 ? targetGroup.tracks[0].audioElement.currentTime : 0;
            track.audioElement.currentTime = syncTime;
            track.audioElement.play();
        } else {
            track.audioElement.pause();
        }
    }

    if (targetElement) {
        const targetIndex = Array.from(targetGroup.ui.trackGrid.children).indexOf(targetElement);
        targetGroup.tracks.splice(targetIndex, 0, track);
        targetGroup.ui.trackGrid.insertBefore(track.uiElement, targetElement);
    } else {
        targetGroup.tracks.push(track);
        targetGroup.ui.trackGrid.appendChild(track.uiElement);
    }
}