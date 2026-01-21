// Основные переменные
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let socket;
let playerId;
let gameState = {};
let keys = {};
let playerName = 'Игрок';
let lastSlendermanDistance = Infinity;

// Настройка canvas
canvas.width = 800;
canvas.height = 600;

// Обработчики событий
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    
    // Отправка сообщения в чат при нажатии Enter
    if (e.key === 'Enter') {
        document.getElementById('chatInput').focus();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && socket) {
        const message = e.target.value.trim();
        if (message) {
            socket.emit('playerChat', message);
            e.target.value = '';
        }
    }
});

// Начало игры
document.getElementById('startButton').addEventListener('click', () => {
    playerName = document.getElementById('playerName').value || 'Игрок';
    document.getElementById('startScreen').style.display = 'none';
    connectToServer();
});

// Подключение к серверу
function connectToServer() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Подключено к серверу');
    });
    
    socket.on('init', (data) => {
        playerId = data.playerId;
        canvas.width = data.gameConfig.width;
        canvas.height = data.gameConfig.height;
    });
    
    socket.on('gameState', (state) => {
        gameState = state;
        updateUI(state);
        render(state);
    });
    
    socket.on('playerDeath', () => {
        document.getElementById('gameOver').style.display = 'block';
    });
    
    socket.on('playerWin', (data) => {
        if (data.playerId === playerId) {
            document.getElementById('winScreen').style.display = 'block';
        }
    });
    
    socket.on('chatMessage', (data) => {
        addChatMessage(data);
    });
    
    socket.on('gameFull', () => {
        alert('Сервер переполнен! Попробуйте позже.');
        location.reload();
    });
}

// Обновление интерфейса
function updateUI(state) {
    // Обновление счетчика страниц
    const player = state.players[playerId];
    if (player) {
        document.getElementById('pageCount').textContent = 
            `${player.collectedPages}/${state.gameConfig.pagesToCollect}`;
    }
    
    // Обновление счетчика игроков
    document.getElementById('playerCount').textContent = 
        Object.keys(state.players).length;
    
    // Обновление списка игроков
    const playersList = document.getElementById('players');
    playersList.innerHTML = '';
    
    Object.values(state.players).forEach(p => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `playerItem ${p.dead ? 'dead' : ''}`;
        playerDiv.innerHTML = `
            <div class="playerColor" style="background: ${p.color}"></div>
            <span>${p.name} ${p.id === playerId ? '(Вы)' : ''}</span>
            <span class="page"> [${p.collectedPages}]</span>
        `;
        playersList.appendChild(playerDiv);
    });
    
    // Проверка близости Слендермена
    if (player && state.slenderman) {
        const dx = player.x - state.slenderman.x;
        const dy = player.y - state.slenderman.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const warning = document.getElementById('slendermanWarning');
        if (distance < 200 && state.slenderman.visible) {
            warning.style.display = 'block';
            
            // Звуковые предупреждения (если разрешены)
            if (distance < lastSlendermanDistance && distance < 100) {
                playWarningSound();
            }
        } else {
            warning.style.display = 'none';
        }
        lastSlendermanDistance = distance;
    }
}

// Добавление сообщения в чат
function addChatMessage(data) {
    const chat = document.getElementById('chatMessages');
    const message = document.createElement('div');
    message.innerHTML = `<span style="color: ${data.color}">${data.playerName}:</span> ${data.message}`;
    chat.appendChild(message);
    chat.scrollTop = chat.scrollHeight;
}

// Игровой цикл
function gameLoop() {
    if (socket && gameState.players && gameState.players[playerId]) {
        const player = gameState.players[playerId];
        
        if (!player.dead) {
            // Расчет движения
            let dx = 0, dy = 0;
            
            if (keys['w'] || keys['arrowup']) dy -= 1;
            if (keys['s'] || keys['arrowdown']) dy += 1;
            if (keys['a'] || keys['arrowleft']) dx -= 1;
            if (keys['d'] || keys['arrowright']) dx += 1;
            
            // Нормализация диагонального движения
            if (dx !== 0 && dy !== 0) {
                dx *= 0.7071;
                dy *= 0.7071;
            }
            
            if (dx !== 0 || dy !== 0) {
                socket.emit('playerMove', { dx, dy });
            }
        }
    }
    
    requestAnimationFrame(gameLoop);
}

// Отрисовка игры
function render(state) {
    // Очистка canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Отрисовка сетки (фон)
    drawGrid();
    
    // Отрисовка страниц
    if (state.pages) {
        state.pages.forEach(page => {
            if (!page.collected) {
                drawPage(page.x, page.y);
            }
        });
    }
    
    // Отрисовка игроков
    if (state.players) {
        Object.values(state.players).forEach(player => {
            drawPlayer(player.x, player.y, player.color, player.name, player === state.players[playerId], player.dead);
        });
    }
    
    // Отрисовка Слендермена
    if (state.slenderman && state.slenderman.visible) {
        drawSlenderman(state.slenderman.x, state.slenderman.y);
    }
    
    // Эффекты тумана
    drawFog();
}

// Рисование сетки
function drawGrid() {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = 0; y < canvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// Рисование игрока
function drawPlayer(x, y, color, name, isCurrentPlayer, isDead) {
    // Основной квадрат
    ctx.fillStyle = isDead ? '#666' : color;
    ctx.fillRect(x - 10, y - 10, 20, 20);
    
    // Обводка для текущего игрока
    if (isCurrentPlayer) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 12, y - 12, 24, 24);
    }
    
    // Имя игрока
    ctx.fillStyle = '#fff';
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(name, x, y - 15);
    
    // Эффект смерти
    if (isDead) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(x - 12, y - 12, 24, 24);
    }
}

// Рисование Слендермена
function drawSlenderman(x, y) {
    // Тело (высокий темный прямоугольник)
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 8, y - 30, 16, 60);
    
    // Голова
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 6, y - 35, 12, 12);
    
    // Руки
    ctx.fillRect(x - 20, y - 20, 40, 8);
    
    // Эффект пульсации
    const pulse = Math.sin(Date.now() / 200) * 5;
    ctx.strokeStyle = `rgba(255, 0, 0, ${0.3 + Math.abs(pulse) * 0.05})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 15 - pulse, y - 35 - pulse, 30 + pulse * 2, 70 + pulse * 2);
    
    // Искажение пространства вокруг
    for (let i = 0; i < 5; i++) {
        const radius = 50 + i * 10;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100, 0, 0, ${0.1 - i * 0.02})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// Рисование страницы
function drawPage(x, y) {
    // Бумага
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 6, y - 8, 12, 16);
    
    // Текст
    ctx.fillStyle = '#000';
    ctx.font = '8px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('PAGE', x, y + 2);
    
    // Свечение
    ctx.shadowColor = '#4CAF50';
    ctx.shadowBlur = 15;
    ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.fillRect(x - 10, y - 12, 20, 24);
    ctx.shadowBlur = 0;
}

// Рисование тумана
function drawFog() {
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 100,
        canvas.width / 2, canvas.height / 2, 400
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Звуковые эффекты
function playWarningSound() {
    // Создание простого звукового предупреждения
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 200;
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.log('Аудио не поддерживается или заблокировано');
    }
}

// Запуск игрового цикла
gameLoop();
