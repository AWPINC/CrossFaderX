let audioCtx;
let masterGainNode; 
let groups = [];
let groupIdCounter = 0;
let currentMode = 'play'; // 'play' или 'manage'
let mixMode = 'single'; // 'single' или 'multi'
let lastTime = 0;
let animationId;
let lastPlayingGroup = null; // Запоминаем, какая группа играла последней

// DOM Элементы панели управления
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

// --- СОЗДАНИЕ НОВОЙ ГРУППЫ ---
function createGroup(files = []) {
    initAudio();

    const group = {
        id: ++groupIdCounter,
        tracks: [],
        isPlaying: false,
        duration: 0,
        currentVolume: 0.0,
        targetVolume: 0.0,
        fadeAction: 'none', // 'pause', 'stop', 'none'
        gainNode: audioCtx.createGain(),
        ui: {}
    };
    
    group.gainNode.gain.value = 0;
    group.gainNode.connect(masterGainNode);

    buildGroupUI(group);
    groups.push(group);

    if (files.length > 0) {
        Array.from(files).forEach((file, i) => addTrackToGroup(group, file, i === 0));
    }
    
    updateGlobalTransportUI();
    return group;
}

// Построение элементов интерфейса для группы
function buildGroupUI(group) {
    const container = document.createElement('div');
    container.className = 'group-container';
    container.dataset.groupId = group.id;
    
    const header = document.createElement('div');
    header.className = 'group-header';
    
    // Кнопка Play
    const playBtn = document.createElement('button');
    playBtn.className = 'transport-btn play group-play-btn';
    playBtn.textContent = '▶';
    playBtn.addEventListener('click', () => playGroup(group));

    // Кнопка Stop
    const stopBtn = document.createElement('button');
    stopBtn.className = 'transport-btn stop group-stop-btn';
    stopBtn.textContent = '⏹';
    stopBtn.addEventListener('click', () => stopGroup(group));

    // Прогресс-бар позиции
    const progressContainer = document.createElement('div');
    progressContainer.className = 'global-progress group-progress-container';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    const progressKnob = document.createElement('div');
    progressKnob.className = 'progress-knob';
    progressContainer.append(progressFill, progressKnob);

    // Перемотка группы округленная посекундно
    progressContainer.addEventListener('click', (e) => {
        if (group.tracks.length === 0 || group.duration === 0) return;
        const rect = progressContainer.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newTime = Math.round(percentage * group.duration); // Ровная секунда
        
        const wasPlaying = group.isPlaying && group.targetVolume > 0;
        if (wasPlaying) {
            group.tracks.forEach(t => t.audioElement.pause());
        }
        
        group.tracks.forEach(t => {
            t.audioElement.currentTime = newTime;
        });
        
        if (wasPlaying) {
            Promise.all(group.tracks.map(t => t.audioElement.play())).catch(err => console.error(err));
        }
    });

    // Кнопка Закрытия группы
    const closeBtn = document.createElement('button');
    closeBtn.className = 'transport-btn close-btn group-close-btn';
    closeBtn.textContent = '⛌';
    closeBtn.addEventListener('click', () => closeGroup(group));

    header.append(playBtn, stopBtn, progressContainer, closeBtn);

    const trackGrid = document.createElement('div');
    trackGrid.className = 'tracks-grid';
    trackGrid.style.setProperty('--grid-cols', columnInput.value);

    container.append(header, trackGrid);
    groupsContainer.append(container);

    group.ui = { container, playBtn, stopBtn, progressFill, progressKnob, trackGrid };
    
    setupGroupDragAndDropEvents(group);
}

// --- ДОБАВЛЕНИЕ СТЕМОВ В ГРУППУ ---
function addTrackToGroup(group, file, isFirst) {
    const fileUrl = URL.createObjectURL(file);
    const audioEl = new Audio(fileUrl);
    
    audioEl.addEventListener('loadedmetadata', () => {
        if (audioEl.duration > group.duration) {
            group.duration = audioEl.duration;
        }
    });

    const trackSource = audioCtx.createMediaElementSource(audioEl);
    const gainNode = audioCtx.createGain();
    trackSource.connect(gainNode);
    gainNode.connect(group.gainNode);

    // В режиме Соло по умолчанию активен первый загруженный трек
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
    
    if (currentMode === 'manage') {
        btn.classList.add('draggable');
        btn.draggable = true;
    }

    group.ui.trackGrid.appendChild(btn);

    const track = {
        id: 'track_' + Date.now() + Math.random().toString(36).substr(2, 5),
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

// --- СТРОГАЯ ЛОГИКА ЕДИНСТВЕННОЙ ИГРАЮЩЕЙ ГРУППЫ ---
function playGroup(group) {
    initAudio();
    
    // Правило исключительности: затухает любая другая играющая группа
    groups.forEach(g => {
        if (g.id !== group.id && g.isPlaying && g.targetVolume > 0) {
            g.targetVolume = 0.0;
            g.fadeAction = 'pause'; 
        }
    });

    // Если группа еще не запущена на уровне аудиоэлементов, запускаем синхронно по секундам
    if (!group.isPlaying) {
        const syncTime = group.tracks.length > 0 ? Math.round(group.tracks[0].audioElement.currentTime) : 0;
        group.tracks.forEach(t => t.audioElement.currentTime = syncTime);
        Promise.all(group.tracks.map(t => t.audioElement.play())).catch(err => console.error(err));
        group.isPlaying = true;
    }
    
    group.targetVolume = 1.0;
    group.fadeAction = 'none';
    lastPlayingGroup = group;

    updateGlobalTransportUI();
    updateGroupUIStyles();
}

function stopGroup(group) {
    if (group.isPlaying && group.targetVolume > 0) {
        // Если группа играет прямо сейчас, запускаем плавное затухание, а затем сброс
        group.targetVolume = 0.0;
        group.fadeAction = 'stop';
    } else {
        // Если группа уже молчит, мгновенно сбрасываем позицию
        group.tracks.forEach(t => {
            t.audioElement.pause();
            t.audioElement.currentTime = 0;
        });
        group.isPlaying = false;
        group.currentVolume = 0.0;
        group.targetVolume = 0.0;
        group.fadeAction = 'none';
    }
    updateGlobalTransportUI();
    updateGroupUIStyles();
}

function closeGroup(group) {
    group.tracks.forEach(t => {
        t.audioElement.pause();
        URL.revokeObjectURL(t.audioElement.src);
    });
    group.gainNode.disconnect();
    group.ui.container.remove();
    groups = groups.filter(g => g.id !== group.id);
    if (lastPlayingGroup === group) lastPlayingGroup = null;
    updateGlobalTransportUI();
}

// --- ГЛОБАЛЬНЫЙ ТРАНСПОРТ ---
globalPlayBtn.addEventListener('click', () => {
    initAudio();
    const activeGroup = groups.find(g => g.isPlaying && g.targetVolume > 0);
    
    if (activeGroup) {
        // Глобальная пауза: плавно гасим текущую играющую группу
        lastPlayingGroup = activeGroup;
        activeGroup.targetVolume = 0.0;
        activeGroup.fadeAction = 'pause';
    } else {
        // Глобальный запуск: возобновляем последнюю игравшую или первую доступную группу
        const groupToPlay = (lastPlayingGroup && groups.includes(lastPlayingGroup)) ? lastPlayingGroup : groups[0];
        if (groupToPlay) {
            playGroup(groupToPlay);
        }
    }
    updateGlobalTransportUI();
});

globalStopBtn.addEventListener('click', () => {
    // Сбрасываем все группы. Играющая группа затухнет, остальные мгновенно сбросятся.
    groups.forEach(g => stopGroup(g));
    updateGlobalTransportUI();
});

function updateGlobalTransportUI() {
    const isAnyPlaying = groups.some(g => g.isPlaying && g.targetVolume > 0);
    globalPlayBtn.textContent = isAnyPlaying ? '⏸' : '▶';
    globalPlayBtn.className = isAnyPlaying ? 'transport-btn pause' : 'transport-btn play';
}

function updateGroupUIStyles() {
    groups.forEach(g => {
        const isCurrentActive = g.isPlaying && g.targetVolume > 0;
        g.ui.container.classList.toggle('group-playing', isCurrentActive);
        g.ui.playBtn.classList.toggle('active', isCurrentActive);
    });
}

// --- ЕДИНЫЙ ЦИКЛ АНИМАЦИИ И ПЛАВНЫХ ЗАТУХАНИЙ ---
function renderLoop(currentTimeStr) {
    if (!lastTime) lastTime = currentTimeStr;
    const deltaTime = (currentTimeStr - lastTime) / 1000;
    lastTime = currentTimeStr;

    const fadeTime = parseFloat(fadeTimeInput.value) || 1.0;
    const speed = 1.0 / fadeTime;

    groups.forEach(group => {
        // 1. Изменение громкости всей группы (Fade-In / Fade-Out при Play/Pause/Stop)
        if (group.currentVolume < group.targetVolume) {
            group.currentVolume = Math.min(group.currentVolume + speed * deltaTime, group.targetVolume);
        } else if (group.currentVolume > group.targetVolume) {
            group.currentVolume = Math.max(group.currentVolume - speed * deltaTime, group.targetVolume);
        }
        group.gainNode.gain.value = group.currentVolume;

        // По завершении затухания до нуля выполняем действие ('pause' или 'stop')
        if (group.targetVolume === 0.0 && group.currentVolume <= 0 && group.isPlaying) {
            if (group.fadeAction === 'pause') {
                group.tracks.forEach(t => t.audioElement.pause());
                group.isPlaying = false;
            } else if (group.fadeAction === 'stop') {
                group.tracks.forEach(t => {
                    t.audioElement.pause();
                    t.audioElement.currentTime = 0;
                });
                group.isPlaying = false;
            }
            group.fadeAction = 'none';
            updateGlobalTransportUI();
            updateGroupUIStyles();
        }

        // 2. Кроссфейд отдельных стемов внутри группы
        group.tracks.forEach(track => {
            if (track.currentVolume < track.targetVolume) {
                track.currentVolume = Math.min(track.currentVolume + speed * deltaTime, track.targetVolume);
            } else if (track.currentVolume > track.targetVolume) {
                track.currentVolume = Math.max(track.currentVolume - speed * deltaTime, track.targetVolume);
            }
            track.gainNode.gain.value = track.currentVolume;
            track.uiElement.style.setProperty('--vol', `${track.currentVolume * 100}%`);
        });

        // 3. Обновление прогресс-баров и курсоров позиции
        if (group.tracks.length > 0 && group.duration > 0) {
            const time = group.tracks[0].audioElement.currentTime;
            const progress = (time / group.duration) * 100;
            
            group.ui.progressFill.style.width = `${progress}%`;
            group.ui.progressKnob.style.left = `${progress}%`;
            
            group.tracks.forEach(t => {
                t.localPlayhead.style.left = `${progress}%`;
            });

            // Автоматическая остановка по окончании трека
            if (time >= group.duration && group.isPlaying && group.targetVolume > 0) {
                stopGroup(group);
            }
        }
    });

    animationId = requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

// --- НАСТРОЙКИ И РЕЖИМЫ ИНТЕРФЕЙСА ---
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
    
    // Пересчитываем состояния в соответствии с новым режимом
    if (mixMode === 'single') {
        groups.forEach(g => {
            let foundFirstActive = false;
            g.tracks.forEach(t => {
                if (!foundFirstActive && t.uiElement.classList.contains('active')) {
                    t.targetVolume = 1.0;
                    foundFirstActive = true;
                } else {
                    t.targetVolume = 0.0;
                    t.uiElement.classList.remove('active');
                }
            });
            if (!foundFirstActive && g.tracks.length > 0) {
                g.tracks[0].targetVolume = 1.0;
                g.tracks[0].uiElement.classList.add('active');
            }
        });
    }
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

fileUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        createGroup(e.target.files);
    }
    e.target.value = ''; // Сброс для возможности повторной загрузки
});

addGroupBtn.addEventListener('click', () => createGroup());

// --- ОПТИМИЗИРОВАННЫЙ DRAG & DROP ТРЕКОВ И ГРУПП ---
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
        document.querySelectorAll('.group-container').forEach(el => el.classList.remove('drag-top', 'drag-bottom'));
    });

    track.uiElement.addEventListener('dragover', function(e) {
        if (currentMode !== 'manage' || !draggedTrack) return;
        e.preventDefault();
        e.stopPropagation();
        if (track !== draggedTrack) {
            this.classList.add('drag-over');
        }
    });

    track.uiElement.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
    });

    track.uiElement.addEventListener('drop', function(e) {
        if (currentMode !== 'manage' || !draggedTrack) return;
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');
        if (track !== draggedTrack) {
            moveTrackToGroup(draggedTrack, this);
        }
    });
}

function setupGroupDragAndDropEvents(group) {
    const grid = group.ui.trackGrid;
    const container = group.ui.container;

    // События для самой сетки треков (перетаскивание внутрь группы)
    grid.addEventListener('dragover', (e) => {
        if (currentMode !== 'manage' || !draggedTrack) return;
        e.preventDefault();
        grid.classList.add('grid-drag-over');
        container.classList.remove('drag-top', 'drag-bottom'); // убираем внешние подсветки
    });

    grid.addEventListener('dragleave', () => {
        grid.classList.remove('grid-drag-over');
    });

    grid.addEventListener('drop', (e) => {
        if (currentMode !== 'manage' || !draggedTrack) return;
        e.preventDefault();
        grid.classList.remove('grid-drag-over');
        moveTrackToGroup(draggedTrack, null, group);
    });

    // События для контейнера группы (перетаскивание МЕЖДУ группами с подсветкой краев)
    container.addEventListener('dragover', (e) => {
        if (currentMode !== 'manage' || !draggedTrack) return;
        e.preventDefault();
        
        // Если летим именно над сеткой треков, пусть работает логика сетки
        if (e.target.closest('.tracks-grid')) {
            container.classList.remove('drag-top', 'drag-bottom');
            return;
        }

        e.stopPropagation();
        const rect = container.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;

        if (relativeY < rect.height / 2) {
            container.classList.add('drag-top');
            container.classList.remove('drag-bottom');
        } else {
            container.classList.add('drag-bottom');
            container.classList.remove('drag-top');
        }
    });

    container.addEventListener('dragleave', () => {
        container.classList.remove('drag-top', 'drag-bottom');
    });

    container.addEventListener('drop', (e) => {
        if (currentMode !== 'manage' || !draggedTrack) return;
        if (e.target.closest('.tracks-grid')) return; // Отдаем управление дропу сетки

        e.preventDefault();
        e.stopPropagation();

        const isTop = container.classList.contains('drag-top');
        container.classList.remove('drag-top', 'drag-bottom');

        createNewGroupFromTrack(draggedTrack, group, isTop ? 'before' : 'after');
    });
}

// Перетаскивание на пустую область контейнера групп
groupsContainer.addEventListener('dragover', (e) => {
    if (currentMode !== 'manage' || !draggedTrack) return;
    e.preventDefault();
});

groupsContainer.addEventListener('drop', (e) => {
    if (currentMode !== 'manage' || !draggedTrack) return;
    if (e.target === groupsContainer) {
        e.preventDefault();
        createNewGroupFromTrack(draggedTrack, null, 'append');
    }
});

// Перемещение трека в существующую группу
function moveTrackToGroup(track, targetElement = null, targetGroupParam = null) {
    const sourceGroup = groups.find(g => g.tracks.includes(track));
    const targetGroup = targetGroupParam || groups.find(g => g.tracks.some(t => t.uiElement === targetElement));
    
    if (!sourceGroup || !targetGroup) return;
    if (sourceGroup === targetGroup && !targetElement) return;

    // Удаляем из старой группы
    sourceGroup.tracks = sourceGroup.tracks.filter(t => t.id !== track.id);
    
    if (sourceGroup !== targetGroup) {
        track.gainNode.disconnect();
        track.gainNode.connect(targetGroup.gainNode);
        
        // Синхронизация воспроизведения: если целевая группа звучит прямо сейчас
        if (targetGroup.isPlaying && targetGroup.targetVolume > 0) {
            const syncTime = targetGroup.tracks.length > 0 ? targetGroup.tracks[0].audioElement.currentTime : 0;
            track.audioElement.currentTime = syncTime;
            track.audioElement.play().catch(err => console.error(err));
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

    // Пересчитываем длительности групп
    recalcGroupDuration(sourceGroup);
    recalcGroupDuration(targetGroup);
    updateGlobalTransportUI();
}

// Создание новой группы из перетащенного трека (между группами или в конец)
function createNewGroupFromTrack(track, targetGroup, position) {
    const sourceGroup = groups.find(g => g.tracks.includes(track));
    if (!sourceGroup) return;

    sourceGroup.tracks = sourceGroup.tracks.filter(t => t.id !== track.id);
    track.gainNode.disconnect();

    const newGroup = createGroup([]); // Создаем пустую группу

    // Перемещаем контейнер в DOM в нужное место
    if (targetGroup && position === 'before') {
        groupsContainer.insertBefore(newGroup.ui.container, targetGroup.ui.container);
        groups = groups.filter(g => g.id !== newGroup.id);
        const idx = groups.indexOf(targetGroup);
        groups.splice(idx, 0, newGroup);
    } else if (targetGroup && position === 'after') {
        groupsContainer.insertBefore(newGroup.ui.container, targetGroup.ui.container.nextSibling);
        groups = groups.filter(g => g.id !== newGroup.id);
        const idx = groups.indexOf(targetGroup);
        groups.splice(idx + 1, 0, newGroup);
    }

    // Привязываем трек к новой группе
    track.gainNode.connect(newGroup.gainNode);
    newGroup.tracks.push(track);
    newGroup.ui.trackGrid.appendChild(track.uiElement);
    
    // Останавливаем трек, так как новая группа по умолчанию не играет
    track.audioElement.pause();

    recalcGroupDuration(sourceGroup);
    recalcGroupDuration(newGroup);
    updateGlobalTransportUI();
    updateGroupUIStyles();
}

function recalcGroupDuration(group) {
    if (group.tracks.length === 0) {
        group.duration = 0;
    } else {
        group.duration = Math.max(...group.tracks.map(t => t.audioElement.duration || 0));
    }
}

// --- СИСТЕМНЫЙ DRAG & DROP ФАЙЛОВ ИЗ WINDOWS ---
window.addEventListener('dragover', (e) => {
    if (!draggedTrack) {
        e.preventDefault(); // Разрешаем дроп файлов извне
    }
});

window.addEventListener('drop', (e) => {
    if (!draggedTrack && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        const audioFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
        if (audioFiles.length > 0) {
            createGroup(audioFiles);
        }
    }
});
