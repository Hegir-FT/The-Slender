const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Конфигурация игры
const GameConfig = {
    width: 800,
    height: 600,
    tileSize: 32,
    slendermanSpeed: 1.5,
    playerSpeed: 3,
    maxPlayers: 10,
    pagesToCollect: 8
};

// Игровые объекты
const players = {};
const slenderman = {
    x: 400,
    y: 300,
    targetPlayer: null,
    visible: false,
    visibleTimer: 0
};
const pages = [];
let gameStarted = false;

// Генерация страниц
function generatePages() {
    pages.length = 0;
    for (let i = 0; i < GameConfig.pagesToCollect; i++) {
        pages.push({
            id: i,
            x: Math.random() * (GameConfig.width - 50) + 25,
            y: Math.random() * (GameConfig.height - 50) + 25,
            collected: false,
            collectedBy: null
        });
    }
}

// Инициализация игры
function initGame() {
    generatePages();
    gameStarted = true;
    
    slenderman.x = Math.random() * GameConfig.width;
    slenderman.y = Math.random() * GameConfig.height;
    slenderman.visible = false;
    slenderman.visibleTimer = 0;
}

// Обновление Слендермена
function updateSlenderman() {
    if (Object.keys(players).length === 0) return;

    // Выбор цели (ближайший игрок)
    let closestPlayer = null;
    let closestDistance = Infinity;
    
    Object.values(players).forEach(player => {
        if (player.dead) return;
        
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
    if (slenderman.targetPlayer && !slenderman.targetPlayer.dead) {
        const dx = slenderman.targetPlayer.x - slenderman.x;
        const dy = slenderman.targetPlayer.y - slenderman.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            slenderman.x += (dx / distance) * GameConfig.slendermanSpeed;
            slenderman.y += (dy / distance) * GameConfig.slendermanSpeed;
        }
        
        // Появление Слендермена
        slenderman.visibleTimer++;
        if (slenderman.visibleTimer > 180) { // Каждые 3 секунды при 60 FPS
            slenderman.visible = !slenderman.visible;
            slenderman.visibleTimer = 0;
        }
        
        // Проверка на убийство
        if (distance < 30 && slenderman.visible) {
            io.to(slenderman.targetPlayer.id).emit('playerDeath');
            players[slenderman.targetPlayer.id].dead = true;
            players[slenderman.targetPlayer.id].deathTime = Date.now();
        }
    }
}

// Игровой цикл
setInterval(() => {
    if (!gameStarted) return;
    
    updateSlenderman();
    
    // Отправка обновлений состояния всем игрокам
    io.emit('gameState', {
        players: players,
        slenderman: slenderman,
        pages: pages,
        gameConfig: GameConfig
    });
}, 1000 / 60); // 60 FPS

// Обработка подключений Socket.io
io.on('connection', (socket) => {
    console.log('Новый игрок подключился:', socket.id);
    
    if (Object.keys(players).length >= GameConfig.maxPlayers) {
        socket.emit('gameFull');
        socket.disconnect();
        return;
    }
    
    // Создание нового игрока
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * (GameConfig.width - 100) + 50,
        y: Math.random() * (GameConfig.height - 100) + 50,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        name: `Игрок_${Object.keys(players).length + 1}`,
        collectedPages: 0,
        dead: false,
        deathTime: null
    };
    
    if (!gameStarted) {
        initGame();
    }
    
    // Отправка начального состояния
    socket.emit('init', {
        playerId: socket.id,
        gameConfig: GameConfig
    });
    
    // Обработка движения игрока
    socket.on('playerMove', (data) => {
        const player = players[socket.id];
        if (!player || player.dead) return;
        
        // Обновление позиции с учетом скорости
        player.x += data.dx * GameConfig.playerSpeed;
        player.y += data.dy * GameConfig.playerSpeed;
        
        // Границы карты
        player.x = Math.max(25, Math.min(GameConfig.width - 25, player.x));
        player.y = Math.max(25, Math.min(GameConfig.height - 25, player.y));
        
        // Сбор страниц
        pages.forEach(page => {
            if (!page.collected) {
                const dx = player.x - page.x;
                const dy = player.y - page.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 30) {
                    page.collected = true;
                    page.collectedBy = socket.id;
                    player.collectedPages++;
                    
                    if (player.collectedPages >= GameConfig.pagesToCollect) {
                        io.emit('playerWin', {
                            playerId: socket.id,
                            playerName: player.name
                        });
                    }
                }
            }
        });
    });
    
    socket.on('playerChat', (message) => {
        const player = players[socket.id];
        io.emit('chatMessage', {
            playerId: socket.id,
            playerName: player.name,
            message: message,
            color: player.color
        });
    });
    
    socket.on('disconnect', () => {
        console.log('Игрок отключился:', socket.id);
        delete players[socket.id];
        
        if (Object.keys(players).length === 0) {
            gameStarted = false;
        }
    });
});

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// Маршрут для главной страницы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
