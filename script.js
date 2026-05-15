let audioCtx;
let tracks = [];
let isPlaying = false;
let lastTime = 0;

const fileUpload = document.getElementById('file-upload');
const trackContainer = document.getElementById('track-container');
const masterBtn = document.getElementById('master-btn');
const fadeTimeInput = document.getElementById('fade-time');

// 1. Обработка загрузки файлов
fileUpload.addEventListener('change', function(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Инициализируем аудиоконтекст при первом взаимодействии пользователя
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Очищаем предыдущие треки, если они были
    tracks.forEach(t => {
        t.audioElement.pause();
        URL.revokeObjectURL(t.audioElement.src); // Освобождаем оперативную память
    });
    tracks = [];
    trackContainer.innerHTML = '';

    files.forEach((file, index) => {
        // Создаем временную ссылку на локальный файл
        const fileUrl = URL.createObjectURL(file);
        
        const audioEl = new Audio(fileUrl);
        audioEl.loop = true; // Зацикливаем трек

        // Создаем узел контроля громкости (GainNode)
        const trackSource = audioCtx.createMediaElementSource(audioEl);
        const gainNode = audioCtx.createGain();
        
        // Подключаем: Аудио файл -> Громкость -> Выход (колонки)
        trackSource.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Изначально все треки на 0 громкости, кроме первого
        const isFirst = index === 0;
        const initialVol = isFirst ? 1.0 : 0.0;
        gainNode.gain.value = initialVol;

        // Создаем кнопку в интерфейсе
        const btn = document.createElement('button');
        btn.className = `track-btn ${isFirst ? 'active' : ''}`;
        btn.innerHTML = `<span>${file.name}</span>`;
        // Устанавливаем начальную заливку цветом (CSS переменная)
        btn.style.setProperty('--vol', `${initialVol * 100}%`);
        
        btn.addEventListener('click', () => switchTrack(index));
        trackContainer.appendChild(btn);

        // Сохраняем объект трека в наш массив
        tracks.push({
            audioElement: audioEl,
            gainNode: gainNode,
            uiElement: btn,
            currentVolume: initialVol,
            targetVolume: initialVol
        });
    });

    masterBtn.disabled = false;
});

// 2. Логика переключения треков (Установка Target Volume)
function switchTrack(selectedIndex) {
    tracks.forEach((track, index) => {
        if (index === selectedIndex) {
            track.targetVolume = 1.0;
            track.uiElement.classList.add('active');
        } else {
            track.targetVolume = 0.0;
            track.uiElement.classList.remove('active');
        }
    });
}

// 3. Математика плавного перехода (Вызывается каждый кадр)
function updateVolumes(currentTime) {
    if (!lastTime) lastTime = currentTime;
    // Считаем дельту времени (сколько секунд прошло с прошлого кадра)
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    const fadeTime = parseFloat(fadeTimeInput.value) || 2.0;
    const speed = 1.0 / fadeTime; // Скорость изменения (громкость в секунду)

    tracks.forEach(track => {
        if (track.currentVolume < track.targetVolume) {
            track.currentVolume += speed * deltaTime;
            if (track.currentVolume > track.targetVolume) track.currentVolume = track.targetVolume;
        } 
        else if (track.currentVolume > track.targetVolume) {
            track.currentVolume -= speed * deltaTime;
            if (track.currentVolume < track.targetVolume) track.currentVolume = track.targetVolume;
        }

        // Применяем громкость к аудиоузлу
        track.gainNode.gain.value = track.currentVolume;
        
        // Обновляем визуальную заливку на кнопке
        track.uiElement.style.setProperty('--vol', `${track.currentVolume * 100}%`);
    });

    if (isPlaying) {
        requestAnimationFrame(updateVolumes);
    }
}

// 4. Управление Play / Stop
masterBtn.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (!isPlaying) {
        // Синхронный старт
        tracks.forEach(t => t.audioElement.play());
        isPlaying = true;
        masterBtn.textContent = "Stop";
        masterBtn.style.backgroundColor = "#f44336"; // Красный цвет
        
        lastTime = performance.now();
        requestAnimationFrame(updateVolumes);
    } else {
        tracks.forEach(t => t.audioElement.pause());
        isPlaying = false;
        masterBtn.textContent = "Play";
        masterBtn.style.backgroundColor = "#4CAF50"; // Зеленый цвет
    }
});