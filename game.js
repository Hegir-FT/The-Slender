// Конфигурация игры
const CONFIG = {
    WIDTH: 800,
    HEIGHT: 600,
    TILE_SIZE: 32,
    PLAYER_SPEED: 3,
    SLENDERMAN_SPEED: 1.5,
    PAGES_TO_COLLECT: 8,
    RESPAWN_TIME: 10,
    FOV_RADIUS: 250
};

// Глобальные переменные
let canvas, ctx;
let peer = null;
let connections = {};
let players = {};
let pages = [];
let slenderman = { x: 0, y: 0, visible: false, pulse: 0 };
let playerId = null;
let isHost = false;
let roomId = null;
let gameLoopId = null;
let lastUpdate = Date.now();
let pingInterval = null;

// Мобильное управление
let isMobile = false;
let joystickActive = false;
let joystickStartX = 0;
let joystickStartY = 0;
let joystickCurrentX = 0;
let joystickCurrentY = 0;
let joystickRadius = 60;
let mobileButtons = {};

// Настройки мобильного управления
const MOBILE_CONFIG = {
    MOVE_THRESHOLD: 0.1,
    MAX_JOYSTICK_DISTANCE: 60,
    RUN_SPEED_MULTIPLIER: 1.8,
    TAP_THRESHOLD: 300, // мс
    LONG_PRESS_THRESHOLD: 1000 // мс
};

// Определение мобильного устройства
function detectMobileDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Проверка User Agent
    const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    
    // Проверка сенсорного экрана
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
    
    // Проверка ширины экрана
    const isSmallScreen = window.innerWidth <= 768;
    
    // Проверка ориентации
    const isMobileOrientation = window.matchMedia("(orientation: portrait)").matches || window.matchMedia("(orientation: landscape)").matches;
    
    isMobile = (isMobileUserAgent && hasTouch) || (hasTouch && isSmallScreen);
    
    console.log('Mobile detection:', { isMobile, isMobileUserAgent, hasTouch, isSmallScreen });
    return isMobile;
}

// Состояние игры
let gameState = {
    started: false,
    paused: false,
    gameOver: false,
    winner: null
};

// Состояние игрока
let localPlayer = {
    id: null,
    name: 'Игрок',
    x: 400,
    y: 300,
    color: '#ff5555',
    collectedPages: 0,
    dead: false,
    respawnTimer: 0,
    spectating: false,
    lastInput: { x: 0, y: 0 }
};

// Управление
const keys = {};
const inputState = { up: false, down: false, left: false, right: false };

// DOM элементы
const elements = {};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initEventListeners();
    resizeCanvas();
});

function initElements() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    elements.startScreen = document.getElementById('startScreen');
    elements.gameContainer = document.getElementById('gameContainer');
    elements.loading = document.getElementById('loading');
    elements.roomInfo = document.getElementById('roomInfo');
    elements.roomIdDisplay = document.getElementById('roomIdDisplay');
    elements.copyLink = document.getElementById('copyLink');
    elements.playerName = document.getElementById('playerName');
    elements.roomCode = document.getElementById('roomCode');
    elements.createRoom = document.getElementById('createRoom');
    elements.joinRoom = document.getElementById('joinRoom');
    elements.startButton = document.getElementById('startButton');
    elements.playerCount = document.getElementById('playerCount');
    elements.pageCount = document.getElementById('pageCount');
    elements.ping = document.getElementById('ping');
    elements.gameRoomId = document.getElementById('gameRoomId');
    elements.leaveGame = document.getElementById('leaveGame');
    elements.playerList = document.getElementById('playerList');
    elements.chatMessages = document.getElementById('chatMessages');
    elements.chatInput = document.getElementById('chatInput');
    elements.sendChat = document.getElementById('sendChat');
    elements.slendermanWarning = document.getElementById('slendermanWarning');
    elements.staticEffect = document.getElementById('staticEffect');
    elements.pauseMenu = document.getElementById('pauseMenu');
    elements.deathScreen = document.getElementById('deathScreen');
    elements.deathPages = document.getElementById('deathPages');
    elements.respawnTimer = document.getElementById('respawnTimer');
    elements.spectateBtn = document.getElementById('spectateBtn');
    elements.winScreen = document.getElementById('winScreen');
    elements.winnerName = document.getElementById('winnerName');
    elements.playAgainBtn = document.getElementById('playAgainBtn');
    elements.backToMenuBtn = document.getElementById('backToMenuBtn');
    elements.resumeGame = document.getElementById('resumeGame');
    elements.restartGame = document.getElementById('restartGame');
    elements.quitGame = document.getElementById('quitGame');
    elements.errorModal = document.getElementById('errorModal');
    elements.errorMessage = document.getElementById('errorMessage');
    elements.closeError = document.getElementById('closeError');
}

function initEventListeners() {
    // Управление
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    // UI события
    elements.createRoom.addEventListener('click', createRoom);
    elements.joinRoom.addEventListener('click', joinRoom);
    elements.startButton.addEventListener('click', startGame);
    elements.copyLink.addEventListener('click', copyRoomLink);
    elements.leaveGame.addEventListener('click', leaveGame);
    elements.sendChat.addEventListener('click', sendChatMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    elements.spectateBtn.addEventListener('click', toggleSpectate);
    elements.playAgainBtn.addEventListener('click', restartGame);
    elements.backToMenuBtn.addEventListener('click', quitToMenu);
    elements.resumeGame.addEventListener('click', togglePause);
    elements.restartGame.addEventListener('click', restartGame);
    elements.quitGame.addEventListener('click', quitToMenu);
    elements.closeError.addEventListener('click', () => {
        elements.errorModal.classList.add('hidden');
    });
    
    // ESC для паузы
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && gameState.started) {
            togglePause();
        }
    });
    
    // Изменение размера окна
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    const container = elements.gameContainer;
    if (!container.classList.contains('hidden')) {
        const sidePanel = document.querySelector('.side-panel');
        const sidePanelWidth = sidePanel ? sidePanel.offsetWidth : 300;
        const availableWidth = window.innerWidth - sidePanelWidth - 40;
        const availableHeight = window.innerHeight - 80; // Учет header
        
        const scaleX = availableWidth / CONFIG.WIDTH;
        const scaleY = availableHeight / CONFIG.HEIGHT;
        const scale = Math.min(scaleX, scaleY, 1.5); // Ограничиваем максимальное увеличение
        
        canvas.style.width = `${CONFIG.WIDTH * scale}px`;
        canvas.style.height = `${CONFIG.HEIGHT * scale}px`;
    }
}

function handleKeyDown(e) {
    const key = e.key.toLowerCase();
    keys[key] = true;
    
    // Управление движением
    switch(key) {
        case 'w': case 'arrowup': inputState.up = true; break;
        case 's': case 'arrowdown': inputState.down = true; break;
        case 'a': case 'arrowleft': inputState.left = true; break;
        case 'd': case 'arrowright': inputState.right = true; break;
        case 'enter':
            if (!gameState.paused) {
                elements.chatInput.focus();
            }
            break;
    }
    
    e.preventDefault();
}

function handleKeyUp(e) {
    const key = e.key.toLowerCase();
    keys[key] = false;
    
    switch(key) {
        case 'w': case 'arrowup': inputState.up = false; break;
        case 's': case 'arrowdown': inputState.down = false; break;
        case 'a': case 'arrowleft': inputState.left = false; break;
        case 'd': case 'arrowright': inputState.right = true; break;
    }
}

// Создание комнаты
function createRoom() {
    const name = elements.playerName.value.trim() || 'Игрок';
    localPlayer.name = name;
    
    roomId = generateRoomCode();
    elements.roomIdDisplay.textContent = roomId;
    elements.gameRoomId.textContent = roomId;
    elements.roomInfo.classList.remove('hidden');
    
    elements.createRoom.disabled = true;
    elements.joinRoom.disabled = true;
    elements.startButton.disabled = false;
    
    showMessage('Создана новая комната. Пригласите друзей!', 'system');
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// Присоединение к комнате
function joinRoom() {
    const code = elements.roomCode.value.trim().toUpperCase();
    const name = elements.playerName.value.trim() || 'Игрок';
    
    if (!code.match(/^[A-Z0-9]{6}$/)) {
        showError('Неверный код комнаты. Должно быть 6 символов (A-Z, 2-9)');
        return;
    }
    
    localPlayer.name = name;
    roomId = code;
    elements.gameRoomId.textContent = roomId;
    elements.roomInfo.classList.remove('hidden');
    
    elements.createRoom.disabled = true;
    elements.joinRoom.disabled = true;
    elements.startButton.disabled = false;
    
    showMessage(`Присоединение к комнате ${code}...`, 'system');
}

// Копирование ссылки
function copyRoomLink() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
        showMessage('Ссылка скопирована в буфер обмена!', 'system');
    });
}

// Запуск игры
function startGame() {
    elements.startScreen.classList.add('hidden');
    elements.loading.classList.remove('hidden');
    
    // Инициализируем PeerJS
    const peerId = `slenderman-${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    peer = new Peer(peerId, {
        debug: 0,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });
    
    peer.on('open', (id) => {
        playerId = id;
        localPlayer.id = id;
        localPlayer.color = generatePlayerColor();
        
        if (!isHost) {
            // Пытаемся подключиться к хосту
            const hostId = `slenderman-${roomId}-host`;
            connectToPeer(hostId);
        } else {
            isHost = true;
            initializeGameWorld();
        }
        
        elements.loading.classList.add('hidden');
        elements.gameContainer.classList.remove('hidden');
        
        startGameLoop();
        startPingMeasurement();
        
        showMessage(`Вы вошли в комнату ${roomId}`, 'system');
        
        if (isHost) {
            showMessage('Вы хост комнаты', 'system');
        }
    });
    
    peer.on('connection', (conn) => {
        setupConnection(conn);
    });
    
    peer.on('error', (err) => {
        console.error('PeerJS ошибка:', err);
        showError(`Ошибка соединения: ${err.type}`);
    });
    
    peer.on('disconnected', () => {
        showError('Соединение потеряно');
    });
    
    // Проверяем, есть ли параметр room в URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoom = urlParams.get('room');
    if (urlRoom && !roomId) {
        elements.roomCode.value = urlRoom.toUpperCase();
        joinRoom();
    }
}

function generatePlayerColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 60%)`;
}

// Подключение к другому пиру
function connectToPeer(peerId) {
    const conn = peer.connect(peerId, {
        reliable: true,
        serialization: 'json'
    });
    
    setupConnection(conn);
}

// Настройка соединения
function setupConnection(conn) {
    conn.on('open', () => {
        connections[conn.peer] = conn;
        
        // Отправляем информацию о себе
        conn.send({
            type: 'playerJoin',
            player: {
                id: playerId,
                name: localPlayer.name,
                color: localPlayer.color,
                x: localPlayer.x,
                y: localPlayer.y,
                collectedPages: 0,
                dead: false
            }
        });
        
        // Если мы хост, отправляем текущее состояние игры
        if (isHost) {
            conn.send({
                type: 'gameState',
                players: players,
                pages: pages,
                slenderman: slenderman,
                config: CONFIG
            });
        }
        
        updatePlayerList();
        showMessage(`Игрок ${conn.peer} подключился`, 'system');
    });
    
    conn.on('data', (data) => {
        handleNetworkMessage(data, conn.peer);
    });
    
    conn.on('close', () => {
        delete connections[conn.peer];
        delete players[conn.peer];
        updatePlayerList();
        showMessage(`Игрок ${conn.peer} отключился`, 'system');
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
    });
}

// Обработка сетевых сообщений
function handleNetworkMessage(data, senderId) {
    switch(data.type) {
        case 'playerJoin':
            players[data.player.id] = data.player;
            updatePlayerList();
            break;
            
        case 'playerUpdate':
            if (players[data.playerId]) {
                players[data.playerId] = { ...players[data.playerId], ...data.data };
            }
            break;
            
        case 'playerMove':
            if (players[data.playerId]) {
                players[data.playerId].x = data.x;
                players[data.playerId].y = data.y;
                players[data.playerId].lastInput = { x: data.x, y: data.y };
            }
            break;
            
        case 'playerDeath':
            if (players[data.playerId]) {
                players[data.playerId].dead = true;
                players[data.playerId].respawnTimer = CONFIG.RESPAWN_TIME;
                
                if (data.playerId === playerId) {
                    showDeathScreen();
                }
            }
            break;
            
        case 'playerRespawn':
            if (players[data.playerId]) {
                players[data.playerId].dead = false;
                players[data.playerId].respawnTimer = 0;
                players[data.playerId].spectating = false;
                
                if (data.playerId === playerId) {
                    elements.deathScreen.classList.add('hidden');
                }
            }
            break;
            
        case 'pageCollected':
            if (pages[data.pageId]) {
                pages[data.pageId].collected = true;
                
                if (data.playerId === playerId) {
                    localPlayer.collectedPages++;
                    updatePageCount();
                    
                    if (localPlayer.collectedPages >= CONFIG.PAGES_TO_COLLECT) {
                        broadcast({ type: 'gameWin', playerId: playerId });
                        showWinScreen(playerId);
                    }
                }
                
                if (players[data.playerId]) {
                    players[data.playerId].collectedPages++;
                }
                
                updatePlayerList();
                
                // Проигрываем звук сбора
                playSound('collect');
            }
            break;
            
        case 'chatMessage':
            showMessage(data.message, data.senderId === playerId ? 'you' : 'other', data.senderName, data.color);
            break;
            
        case 'gameState':
            if (!isHost) {
                players = data.players;
                pages = data.pages;
                slenderman = data.slenderman;
                
                if (!players[playerId]) {
                    players[playerId] = {
                        ...localPlayer,
                        id: playerId
                    };
                }
                
                updatePlayerList();
                updatePageCount();
            }
            break;
            
        case 'gameUpdate':
            if (!isHost) {
                players = data.players;
                slenderman = data.slenderman;
            }
            break;
            
        case 'gameWin':
            showWinScreen(data.playerId);
            break;
            
        case 'ping':
            if (data.senderId === playerId && data.timestamp) {
                const ping = Date.now() - data.timestamp;
                elements.ping.textContent = `${ping}ms`;
            }
            break;
    }
}

// Рассылка сообщения всем игрокам
function broadcast(message) {
    Object.values(connections).forEach(conn => {
        if (conn.open) {
            conn.send(message);
        }
    });
}

// Инициализация игрового мира (только у хоста)
function initializeGameWorld() {
    // Создаем страницы
    pages = [];
    for (let i = 0; i < CONFIG.PAGES_TO_COLLECT; i++) {
        pages.push({
            id: i,
            x: Math.random() * (CONFIG.WIDTH - 100) + 50,
            y: Math.random() * (CONFIG.HEIGHT - 100) + 50,
            collected: false,
            collectedBy: null
        });
    }
    
    // Инициализируем Слендермена
    slenderman = {
        x: Math.random() * CONFIG.WIDTH,
        y: Math.random() * CONFIG.HEIGHT,
        visible: false,
        pulse: 0,
        targetPlayer: null,
        lastSeen: 0
    };
    
    // Добавляем себя в список игроков
    players[playerId] = { ...localPlayer };
    gameState.started = true;
}

// Игровой цикл
function startGameLoop() {
    gameLoopId = setInterval(() => {
        if (gameState.paused || gameState.gameOver) return;
        
        const now = Date.now();
        const deltaTime = (now - lastUpdate) / 1000;
        lastUpdate = now;
        
        // Обновление локального игрока
        updateLocalPlayer(deltaTime);
        
        // Если мы хост, обновляем игровой мир
        if (isHost) {
            updateGameWorld(deltaTime);
            
            // Рассылаем обновления
            broadcast({
                type: 'gameUpdate',
                players: players,
                slenderman: slenderman
            });
        }
        
        // Отрисовка
        render();
        
        // Обновление таймеров
        updateTimers(deltaTime);
        
    }, 1000 / 60); // 60 FPS
}

function updateLocalPlayer(deltaTime) {
    if (localPlayer.dead || localPlayer.spectating) return;
    
    // Движение
    let moveX = 0;
    let moveY = 0;
    
    if (inputState.up) moveY -= 1;
    if (inputState.down) moveY += 1;
    if (inputState.left) moveX -= 1;
    if (inputState.right) moveX += 1;
    
    // Нормализация диагонального движения
    if (moveX !== 0 && moveY !== 0) {
        moveX *= 0.7071;
        moveY *= 0.7071;
    }
    
    if (moveX !== 0 || moveY !== 0) {
        localPlayer.x += moveX * CONFIG.PLAYER_SPEED;
        localPlayer.y += moveY * CONFIG.PLAYER_SPEED;
        
        // Границы
        localPlayer.x = Math.max(20, Math.min(CONFIG.WIDTH - 20, localPlayer.x));
        localPlayer.y = Math.max(20, Math.min(CONFIG.HEIGHT - 20, localPlayer.y));
        
        // Отправляем движение другим игрокам
        broadcast({
            type: 'playerMove',
            playerId: playerId,
            x: localPlayer.x,
            y: localPlayer.y
        });
        
        // Обновляем в локальном списке
        if (players[playerId]) {
            players[playerId].x = localPlayer.x;
            players[playerId].y = localPlayer.y;
        }
        
        // Проверка сбора страниц
        checkPageCollection();
    }
}

function updateGameWorld(deltaTime) {
    // Обновление Слендермена
    updateSlenderman(deltaTime);
    
    // Обновление таймеров респавна
    Object.values(players).forEach(player => {
        if (player.dead && player.respawnTimer > 0) {
            player.respawnTimer -= deltaTime;
            
            if (player.respawnTimer <= 0) {
                player.respawnTimer = 0;
                broadcast({
                    type: 'playerRespawn',
                    playerId: player.id
                });
            }
        }
    });
}

function updateSlenderman(deltaTime) {
    slenderman.pulse += deltaTime * 2;
    
    // Находим ближайшего живого игрока
    let closestPlayer = null;
    let closestDistance = Infinity;
    
    Object.values(players).forEach(player => {
        if (player.dead || player.spectating) return;
        
        const dx = player.x - slenderman.x;
        const dy = player.y - slenderman.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < closestDistance) {
            closestDistance = distance;
            closestPlayer = player;
        }
    });
    
    slenderman.targetPlayer = closestPlayer;
    
    // Движение к цели
    if (slenderman.targetPlayer) {
        const dx = slenderman.targetPlayer.x - slenderman.x;
        const dy = slenderman.targetPlayer.y - slenderman.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            slenderman.x += (dx / distance) * CONFIG.SLENDERMAN_SPEED;
            slenderman.y += (dy / distance) * CONFIG.SLENDERMAN_SPEED;
        }
        
        // Мерцание
        if (Math.random() < 0.02) { // 2% шанс каждый кадр
            slenderman.visible = !slenderman.visible;
            slenderman.lastSeen = Date.now();
            
            if (slenderman.visible && distance < 200) {
                playSound('appear');
            }
        }
        
        // Проверка на убийство
        if (distance < 30 && slenderman.visible) {
            broadcast({
                type: 'playerDeath',
                playerId: slenderman.targetPlayer.id
            });
            
            if (slenderman.targetPlayer.id === playerId) {
                playSound('death');
            }
        }
        
        // Предупреждение о близости
        const warningElement = elements.slendermanWarning;
        if (distance < 200 && slenderman.visible) {
            warningElement.classList.remove('hidden');
            
            // Эффект статики
            if (distance < 100) {
                elements.staticEffect.classList.remove('hidden');
                elements.staticEffect.style.opacity = (1 - (distance / 100)) * 0.3;
            } else {
                elements.staticEffect.classList.add('hidden');
            }
        } else {
            warningElement.classList.add('hidden');
            elements.staticEffect.classList.add('hidden');
        }
    }
}

function checkPageCollection() {
    pages.forEach((page, index) => {
        if (!page.collected) {
            const dx = localPlayer.x - page.x;
            const dy = localPlayer.y - page.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 25) {
                page.collected = true;
                page.collectedBy = playerId;
                
                broadcast({
                    type: 'pageCollected',
                    pageId: index,
                    playerId: playerId
                });
            }
        }
    });
}

function updateTimers(deltaTime) {
    if (localPlayer.dead && localPlayer.respawnTimer > 0) {
        localPlayer.respawnTimer -= deltaTime;
        elements.respawnTimer.textContent = Math.ceil(localPlayer.respawnTimer);
        
        if (localPlayer.respawnTimer <= 0) {
            localPlayer.dead = false;
            localPlayer.respawnTimer = 0;
            
            broadcast({
                type: 'playerRespawn',
                playerId: playerId
            });
            
            elements.deathScreen.classList.add('hidden');
        }
    }
}

// Отрисовка
function render() {
    // Очистка canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    
    // Рисуем сетку
    drawGrid();
    
    // Рисуем туман войны
    drawFogOfWar();
    
    // Рисуем страницы
    drawPages();
    
    // Рисуем игроков
    drawPlayers();
    
    // Рисуем Слендермена
    if (slenderman.visible) {
        drawSlenderman();
    }
}

function drawGrid() {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    
    // Вертикальные линии
    for (let x = 0; x < CONFIG.WIDTH; x += CONFIG.TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CONFIG.HEIGHT);
        ctx.stroke();
    }
    
    // Горизонтальные линии
    for (let y = 0; y < CONFIG.HEIGHT; y += CONFIG.TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CONFIG.WIDTH, y);
        ctx.stroke();
    }
}

function drawFogOfWar() {
    // Создаем радиальный градиент для тумана войны
    const gradient = ctx.createRadialGradient(
        localPlayer.x, localPlayer.y, 50,
        localPlayer.x, localPlayer.y, CONFIG.FOV_RADIUS
    );
    
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    
    // Дополнительная тьма по краям
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    
    // Вырезаем область видимости
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(localPlayer.x, localPlayer.y, CONFIG.FOV_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
}

function drawPages() {
    pages.forEach(page => {
        if (!page.collected && isPageVisible(page)) {
            // Свечение страницы
            ctx.shadowColor = '#4CAF50';
            ctx.shadowBlur = 15;
            ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
            ctx.beginPath();
            ctx.arc(page.x, page.y, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Сама страница
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(page.x - 6, page.y - 8, 12, 16);
            
            // Текст на странице
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('PAGE', page.x, page.y);
            
            // Обводка
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 2;
            ctx.strokeRect(page.x - 8, page.y - 10, 16, 20);
        }
    });
}

function drawPlayers() {
    Object.values(players).forEach(player => {
        if (player && isPlayerVisible(player)) {
            // Игрок мертв
            if (player.dead) {
                ctx.fillStyle = player.color.replace(')', ', 0.3)').replace('rgb', 'rgba');
                ctx.beginPath();
                ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
                ctx.fill();
                
                // Крест
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(player.x - 10, player.y - 10);
                ctx.lineTo(player.x + 10, player.y + 10);
                ctx.moveTo(player.x + 10, player.y - 10);
                ctx.lineTo(player.x - 10, player.y + 10);
                ctx.stroke();
                return;
            }
            
            // Тело игрока
            ctx.fillStyle = player.color;
            ctx.beginPath();
            ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
            ctx.fill();
            
            // Обводка для текущего игрока
            if (player.id === playerId) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
                ctx.stroke();
            }
            
            // Имя игрока
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(player.name, player.x, player.y - 18);
            
            // Счетчик страниц
            ctx.fillStyle = '#4CAF50';
            ctx.font = 'bold 10px Courier New';
            ctx.textBaseline = 'top';
            ctx.fillText(`${player.collectedPages}`, player.x, player.y + 15);
        }
    });
}

function drawSlenderman() {
    if (!isPointVisible(slenderman.x, slenderman.y)) return;
    
    const pulse = Math.sin(slenderman.pulse) * 3;
    
    // Эффект искажения
    for (let i = 0; i < 3; i++) {
        const radius = 40 + i * 20 + pulse;
        ctx.beginPath();
        ctx.arc(slenderman.x, slenderman.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 0, 0, ${0.1 - i * 0.03})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Тело Слендермена
    ctx.fillStyle = '#000000';
    ctx.fillRect(slenderman.x - 8, slenderman.y - 40, 16, 80);
    
    // Руки
    ctx.fillRect(slenderman.x - 30, slenderman.y - 10, 60, 8);
    
    // Голова
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(slenderman.x, slenderman.y - 45, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Лицо (пустота)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(slenderman.x, slenderman.y - 45, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Пульсирующая аура
    ctx.strokeStyle = `rgba(255, 0, 0, ${0.5 + Math.abs(pulse) * 0.1})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(slenderman.x, slenderman.y, 50 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
}

function isPointVisible(x, y) {
    const dx = x - localPlayer.x;
    const dy = y - localPlayer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= CONFIG.FOV_RADIUS;
}

function isPlayerVisible(player) {
    return isPointVisible(player.x, player.y);
}

function isPageVisible(page) {
    return isPointVisible(page.x, page.y);
}

// UI функции
function updatePlayerList() {
    elements.playerList.innerHTML = '';
    
    // Добавляем локального игрока
    addPlayerToList(localPlayer, true);
    
    // Добавляем других игроков
    Object.values(players).forEach(player => {
        if (player.id !== playerId) {
            addPlayerToList(player, false);
        }
    });
    
    elements.playerCount.textContent = Object.keys(players).length;
}

function addPlayerToList(player, isLocal) {
    const div = document.createElement('div');
    div.className = `player-item ${player.dead ? 'dead' : ''} ${isLocal ? 'local' : ''}`;
    
    div.innerHTML = `
        <div class="player-color" style="background: ${player.color}"></div>
        <span>${player.name} ${isLocal ? '(Вы)' : ''}</span>
        <span class="pages">[${player.collectedPages}/${CONFIG.PAGES_TO_COLLECT}]</span>
    `;
    
    elements.playerList.appendChild(div);
}

function updatePageCount() {
    elements.pageCount.textContent = `${localPlayer.collectedPages}/${CONFIG.PAGES_TO_COLLECT}`;
}

function showMessage(message, type = 'system', senderName = null, color = null) {
    const div = document.createElement('div');
    
    switch(type) {
        case 'system':
            div.className = 'system-msg';
            div.textContent = `Система: ${message}`;
            break;
        case 'you':
            div.innerHTML = `<span style="color: ${localPlayer.color}">Вы:</span> ${message}`;
            break;
        case 'other':
            div.innerHTML = `<span style="color: ${color}">${senderName}:</span> ${message}`;
            break;
    }
    
    elements.chatMessages.appendChild(div);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function sendChatMessage() {
    const message = elements.chatInput.value.trim();
    if (!message) return;
    
    showMessage(message, 'you');
    
    broadcast({
        type: 'chatMessage',
        senderId: playerId,
        senderName: localPlayer.name,
        color: localPlayer.color,
        message: message
    });
    
    elements.chatInput.value = '';
    elements.chatInput.blur();
}

function showDeathScreen() {
    elements.deathPages.textContent = localPlayer.collectedPages;
    elements.deathScreen.classList.remove('hidden');
    playSound('death');
}

function toggleSpectate() {
    localPlayer.spectating = !localPlayer.spectating;
    elements.deathScreen.classList.add('hidden');
    
    if (localPlayer.spectating) {
        showMessage('Вы наблюдаете за игрой', 'system');
    }
}

function showWinScreen(winnerId) {
    const winner = players[winnerId] || localPlayer;
    elements.winnerName.textContent = winner.name;
    elements.winnerName.style.color = winner.color;
    elements.winScreen.classList.remove('hidden');
    gameState.gameOver = true;
    playSound('win');
}

function restartGame() {
    if (isHost) {
        initializeGameWorld();
    }
    
    localPlayer.collectedPages = 0;
    localPlayer.dead = false;
    localPlayer.spectating = false;
    localPlayer.respawnTimer = 0;
    
    gameState.gameOver = false;
    gameState.winner = null;
    
    elements.winScreen.classList.add('hidden');
    elements.deathScreen.classList.add('hidden');
    
    updatePageCount();
    updatePlayerList();
    
    showMessage('Игра началась заново!', 'system');
}

function quitToMenu() {
    // Закрываем все соединения
    Object.values(connections).forEach(conn => conn.close());
    if (peer) peer.destroy();
    
    // Сбрасываем состояние
    clearInterval(gameLoopId);
    if (pingInterval) clearInterval(pingInterval);
    
    peer = null;
    connections = {};
    players = {};
    pages = [];
    gameState = { started: false, paused: false, gameOver: false, winner: null };
    
    // Показываем меню
    elements.gameContainer.classList.add('hidden');
    elements.startScreen.classList.remove('hidden');
    elements.winScreen.classList.add('hidden');
    elements.deathScreen.classList.add('hidden');
    elements.pauseMenu.classList.add('hidden');
    
    showMessage('Вы вышли в главное меню', 'system');
}

function togglePause() {
    gameState.paused = !gameState.paused;
    elements.pauseMenu.classList.toggle('hidden');
    
    if (gameState.paused) {
        showMessage('Игра приостановлена', 'system');
    }
}

function leaveGame() {
    if (confirm('Вы уверены, что хотите покинуть игру?')) {
        quitToMenu();
    }
}

// Измерение пинга
function startPingMeasurement() {
    pingInterval = setInterval(() => {
        if (Object.keys(connections).length > 0) {
            const timestamp = Date.now();
            broadcast({
                type: 'ping',
                senderId: playerId,
                timestamp: timestamp
            });
        }
    }, 2000);
}

// Звуковые эффекты
function playSound(type) {
    try {
        // Создаем простые звуковые эффекты через Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        switch(type) {
            case 'collect':
                playCollectSound(audioContext);
                break;
            case 'appear':
                playAppearSound(audioContext);
                break;
            case 'death':
                playDeathSound(audioContext);
                break;
            case 'win':
                playWinSound(audioContext);
                break;
        }
    } catch (e) {
        console.log('Аудио не поддерживается');
    }
}

function playCollectSound(audioContext) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioContext.currentTime + 0.1); // C6
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
}

function playAppearSound(audioContext) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.5);
    
    gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

function playDeathSound(audioContext) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

function playWinSound(audioContext) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
    oscillator.frequency.setValueAtTime(1046.50, audioContext.currentTime + 0.3); // C6
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
}

// Обработка ошибок
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorModal.classList.remove('hidden');
}

// Предупреждение о звуке
window.addEventListener('click', () => {
    // Активируем аудиоконтекст при первом клике пользователя
    if (window.AudioContext && !window.audioContextActivated) {
        const audioContext = new AudioContext();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        window.audioContextActivated = true;
    }
});

// Адаптация canvas при изменении размера
window.addEventListener('resize', resizeCanvas);
