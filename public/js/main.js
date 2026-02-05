import { ChessBoard } from './board.js';
import { SocketManager } from './socket.js';

class Game {
    constructor() {
        this.board = new ChessBoard();
        this.socket = new SocketManager();
        this.gameId = null;
        this.playerColor = null;
        this.currentTurn = 'white';
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.checkUrlForGame();
        this.setupSocketListeners();
        this.loadSavedTheme();
        this.loadPanelStates();
    }
    
    setupEventListeners() {
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.createGame();
        });
        
        document.getElementById('join-game-btn').addEventListener('click', () => {
            this.showJoinGamePrompt();
        });
        
        document.getElementById('copy-link-btn').addEventListener('click', () => {
            this.copyGameLink();
        });
        
        document.getElementById('open-link-btn').addEventListener('click', () => {
            this.openGameLink();
        });
        
        document.getElementById('help-btn').addEventListener('click', () => {
            this.showHelp();
        });
        
        document.getElementById('close-help').addEventListener('click', () => {
            this.hideHelp();
        });
        
        // Close modal when clicking outside
        document.getElementById('help-modal').addEventListener('click', (e) => {
            if (e.target.id === 'help-modal') {
                this.hideHelp();
            }
        });
        
        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideHelp();
            }
        });
        
        // Theme picker functionality
        document.getElementById('board-color-picker').addEventListener('input', (e) => {
            this.updateBoardTheme(e.target.value);
        });
        
        // Theme preset buttons
        document.querySelectorAll('.theme-preset').forEach(button => {
            button.addEventListener('click', () => {
                const color = button.dataset.color;
                this.updateBoardTheme(color);
                document.getElementById('board-color-picker').value = color;
                
                // Update active state
                document.querySelectorAll('.theme-preset').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
            });
        });
        
        // Contrast slider functionality
        document.getElementById('contrast-slider').addEventListener('input', (e) => {
            this.updateBoardContrast(parseInt(e.target.value));
        });
        
        // Panel toggle functionality
        document.querySelectorAll('.panel-header').forEach(header => {
            header.addEventListener('click', () => {
                this.togglePanel(header.dataset.panel);
            });
        });

        // Game chat functionality
        document.getElementById('send-game-chat-btn').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('game-chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
    }
    
    setupSocketListeners() {
        // Handle socket reconnection - rejoin game if we were in one
        this.socket.on('connect', () => {
            console.log('Socket connected');
            if (this.gameId) {
                console.log('Rejoining game:', this.gameId);
                const username = localStorage.getItem('chess-username') || '';
                this.socket.emit('join-game', { gameId: this.gameId, username });
            }
        });

        this.socket.on('game-created', (data) => {
            this.gameId = data.gameId;
            this.playerColor = data.color;
            this.board.setPlayerColor(data.color); // Set board orientation
            this.board.castleRights = data.castleRights || null;
            this.board.setupBoard(data.board);
            this.updateGameStatus('Waiting for opponent...');
            this.showGameLink(data.gameUrl);
        });
        
        this.socket.on('game-joined', (data) => {
            this.gameId = data.gameId;
            this.playerColor = data.color;
            this.currentTurn = data.currentTurn || 'white';
            this.board.setPlayerColor(data.color); // Set board orientation
            this.board.castleRights = data.castleRights || null;
            this.board.enPassantTarget = data.enPassantTarget || null;
            this.board.setupBoard(data.board);

            // Restore move history if rejoining
            if (data.moves && data.moves.length > 0) {
                this.updateMoveHistory(data.moves);
            }

            // Load chat history if available
            if (data.chatHistory && data.chatHistory.length > 0) {
                this.loadChatHistory(data.chatHistory);
            }

            // Handle finished games
            if (data.status === 'finished') {
                let statusMessage;
                if (data.result === 'draw') {
                    statusMessage = 'Game Over - Draw';
                } else {
                    const winnerIsMe = data.result === this.playerColor;
                    statusMessage = winnerIsMe ? 'Game Over - You won!' : 'Game Over - You lost';
                }
                this.updateGameStatus(statusMessage);
                this.board.setInteractive(false);
            } else {
                const isMyTurn = this.currentTurn === this.playerColor;
                this.updateGameStatus(isMyTurn ? 'Your turn!' : "Waiting for opponent...");
                this.board.setInteractive(isMyTurn);
            }
        });
        
        this.socket.on('game-updated', (data) => {
            this.updatePlayerInfo(data.players);
            if (data.status === 'active') {
                this.updateGameStatus(`Game active! ${data.currentTurn}'s turn`);
                this.currentTurn = data.currentTurn;
                this.board.setInteractive(this.playerColor === this.currentTurn);
            }
        });
        
        this.socket.on('move-made', (data) => {
            this.board.setupBoard(data.board);
            this.currentTurn = data.currentTurn;

            // Update en passant target from server data
            this.board.enPassantTarget = data.enPassantTarget || null;

            // Update castle rights from server data
            if (data.castleRights) {
                this.board.castleRights = data.castleRights;
            }

            // Handle game over
            if (data.gameOver) {
                let statusMessage;
                if (data.gameOver.type === 'checkmate') {
                    const winnerIsMe = data.gameOver.winner === this.playerColor;
                    statusMessage = winnerIsMe ? 'Checkmate! You win!' : 'Checkmate! You lose.';
                } else if (data.gameOver.type === 'stalemate') {
                    statusMessage = 'Stalemate - Draw!';
                }
                this.updateGameStatus(statusMessage);
                this.board.setInteractive(false);
                this.updateMoveHistory(data.moves);
                return;
            }

            // Check status
            let statusMessage;
            if (data.inCheck) {
                const isYourTurn = this.currentTurn === this.playerColor;
                statusMessage = isYourTurn ? 'Check! Your king is in danger' : "Check! Opponent's king is in danger";
            } else {
                statusMessage = `${this.currentTurn}'s turn`;
            }

            this.updateGameStatus(statusMessage);
            this.board.setInteractive(this.playerColor === this.currentTurn);
            this.updateMoveHistory(data.moves);

            // Update player indicators
            if (this.gameId) {
                const players = [
                    { color: this.playerColor, name: this.playerColor === 'white' ? 'White Player' : 'Black Player' },
                    { color: this.playerColor === 'white' ? 'black' : 'white', name: this.playerColor === 'white' ? 'Black Player' : 'White Player' }
                ];
                this.updatePlayerInfo(players);
            }
        });
        
        this.socket.on('error', (message) => {
            this.showModal(message);
        });
        
        this.socket.on('player-disconnected', (data) => {
            this.updateGameStatus('Opponent disconnected');
            this.board.setInteractive(false);
        });

        // Game chat messages
        this.socket.on('game-chat-message', (data) => {
            this.addChatMessage(data);
        });
    }
    
    checkUrlForGame() {
        const urlParams = new URLSearchParams(window.location.search);
        const gameId = urlParams.get('game');
        if (gameId) {
            this.joinGame(gameId);
        }
    }
    
    createGame() {
        this.socket.emit('create-game');
        document.getElementById('new-game-btn').disabled = true;
        document.getElementById('join-game-btn').disabled = true;
    }
    
    joinGame(gameId) {
        const username = localStorage.getItem('chess-username') || '';
        this.socket.emit('join-game', { gameId, username });
        document.getElementById('new-game-btn').disabled = true;
        document.getElementById('join-game-btn').disabled = true;
    }
    
    showJoinGamePrompt() {
        this.showModal('Enter game ID:', { prompt: true }).then(gameId => {
            if (gameId) {
                this.joinGame(gameId);
            }
        });
    }
    
    makeMove(from, to) {
        if (this.playerColor !== this.currentTurn) {
            return false;
        }

        // Send move to server for validation and execution
        // Board will be updated when server responds with 'move-made'
        this.socket.emit('make-move', {
            gameId: this.gameId,
            from,
            to
        });

        return true;
    }
    
    updateGameStatus(status) {
        const gameStatusElement = document.getElementById('game-status');
        
        // Add turn indicator if game is active
        if (this.currentTurn && (status.includes("turn") || status.includes("move"))) {
            const turnColor = this.currentTurn;
            const isYourTurn = turnColor === this.playerColor;
            
            gameStatusElement.innerHTML = `
                ${status}
                <span class="turn-indicator ${turnColor}"></span>
            `;
            
            // Update status text to be more clear
            if (isYourTurn) {
                gameStatusElement.innerHTML = `
                    Your turn (${turnColor})
                    <span class="turn-indicator ${turnColor}"></span>
                `;
            } else {
                gameStatusElement.innerHTML = `
                    Opponent's turn (${turnColor})
                    <span class="turn-indicator ${turnColor}"></span>
                `;
            }
        } else {
            gameStatusElement.textContent = status;
        }
    }
    
    updateBoardTheme(hexColor, contrast = null) {
        // Convert hex to HSL
        const hsl = this.hexToHsl(hexColor);
        
        // Use current contrast if not provided
        if (contrast === null) {
            contrast = parseInt(document.documentElement.style.getPropertyValue('--board-contrast') || '25');
        }
        
        // Calculate lightness values based on contrast
        const baseLight = Math.max(hsl.l + contrast, 60);
        const baseDark = Math.max(hsl.l - contrast, 25);
        
        // Update CSS custom properties
        document.documentElement.style.setProperty('--board-theme-hue', hsl.h);
        document.documentElement.style.setProperty('--board-theme-saturation', hsl.s + '%');
        document.documentElement.style.setProperty('--board-theme-lightness-light', baseLight + '%');
        document.documentElement.style.setProperty('--board-theme-lightness-dark', baseDark + '%');
        
        // Store in localStorage for persistence
        const themeData = {
            color: hexColor,
            contrast: contrast
        };
        localStorage.setItem('chess-board-theme', JSON.stringify(themeData));
    }
    
    updateBoardContrast(contrast) {
        document.documentElement.style.setProperty('--board-contrast', contrast);
        
        // Re-apply current theme with new contrast
        const currentColor = document.getElementById('board-color-picker').value;
        this.updateBoardTheme(currentColor, contrast);
    }
    
    hexToHsl(hex) {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Convert to RGB
        const r = parseInt(hex.substr(0, 2), 16) / 255;
        const g = parseInt(hex.substr(2, 2), 16) / 255;
        const b = parseInt(hex.substr(4, 2), 16) / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const diff = max - min;
        
        let h = 0;
        let s = 0;
        let l = (max + min) / 2;
        
        if (diff !== 0) {
            s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
            
            switch (max) {
                case r:
                    h = (g - b) / diff + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / diff + 2;
                    break;
                case b:
                    h = (r - g) / diff + 4;
                    break;
            }
            h /= 6;
        }
        
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }
    
    loadSavedTheme() {
        const savedThemeData = localStorage.getItem('chess-board-theme');
        let themeColor = '#D4A574';
        let themeContrast = 25;
        
        if (savedThemeData) {
            try {
                // Try to parse as JSON (new format)
                const themeObj = JSON.parse(savedThemeData);
                themeColor = themeObj.color || '#D4A574';
                themeContrast = themeObj.contrast || 25;
            } catch (e) {
                // Fallback to old format (just hex color)
                themeColor = savedThemeData;
                themeContrast = 25;
            }
        }
        
        // Apply the theme
        this.updateBoardTheme(themeColor, themeContrast);
        
        // Update UI controls
        document.getElementById('board-color-picker').value = themeColor;
        document.getElementById('contrast-slider').value = themeContrast;
        
        // Set active preset if it matches
        document.querySelectorAll('.theme-preset').forEach(button => {
            button.classList.toggle('active', button.dataset.color.toLowerCase() === themeColor.toLowerCase());
        });
        
        // If no preset matches, make sure none are active
        if (!document.querySelector('.theme-preset.active')) {
            // Custom color, no preset should be active
        }
    }
    
    togglePanel(panelName) {
        const content = document.getElementById(panelName + '-content');
        const toggle = document.querySelector(`[data-panel="${panelName}"] .panel-toggle`);
        
        if (content.classList.contains('collapsed')) {
            // Expand panel
            content.classList.remove('collapsed');
            content.style.maxHeight = content.scrollHeight + 'px';
            toggle.textContent = '−';
        } else {
            // Collapse panel
            content.classList.add('collapsed');
            content.style.maxHeight = '0px';
            toggle.textContent = '+';
        }
        
        // Save panel state
        localStorage.setItem(`chess-panel-${panelName}`, content.classList.contains('collapsed') ? 'collapsed' : 'expanded');
    }
    
    recalculatePanelHeight(panelName) {
        const content = document.getElementById(panelName + '-content');
        
        // Only recalculate if panel is not collapsed
        if (!content.classList.contains('collapsed')) {
            content.style.maxHeight = content.scrollHeight + 'px';
        }
    }
    
    loadPanelStates() {
        ['controls', 'theme', 'history', 'chat'].forEach(panelName => {
            const state = localStorage.getItem(`chess-panel-${panelName}`);
            const content = document.getElementById(panelName + '-content');
            const toggle = document.querySelector(`[data-panel="${panelName}"] .panel-toggle`);
            
            if (state === 'collapsed') {
                content.classList.add('collapsed');
                content.style.maxHeight = '0px';
                toggle.textContent = '+';
            } else {
                content.style.maxHeight = content.scrollHeight + 'px';
                toggle.textContent = '−';
            }
        });
    }
    
    updatePlayerInfo(players) {
        // Clear both player displays first
        const blackElement = document.getElementById('player-black');
        const whiteElement = document.getElementById('player-white');
        
        // Remove active class from both
        blackElement.classList.remove('active');
        whiteElement.classList.remove('active');
        
        // Find our player and opponent
        const ourPlayer = players.find(p => p.color === this.playerColor);
        const opponentPlayer = players.find(p => p.color !== this.playerColor);
        
        // Show our player on bottom, opponent on top (regardless of color)
        if (ourPlayer) {
            // Our player goes on the bottom (white position in HTML)
            const ourElement = whiteElement;
            const nameSpan = ourElement.querySelector('.player-name');
            const statusSpan = ourElement.querySelector('.player-status');
            nameSpan.textContent = `${ourPlayer.name} (${ourPlayer.color})`;
            statusSpan.textContent = '(You)';
            
            // Highlight if it's our turn
            if (this.currentTurn === ourPlayer.color) {
                ourElement.classList.add('active');
            }
        }
        
        if (opponentPlayer) {
            // Opponent goes on top (black position in HTML)
            const oppElement = blackElement;
            const nameSpan = oppElement.querySelector('.player-name');
            const statusSpan = oppElement.querySelector('.player-status');
            nameSpan.textContent = `${opponentPlayer.name} (${opponentPlayer.color})`;
            statusSpan.textContent = '';
            
            // Highlight if it's opponent's turn
            if (this.currentTurn === opponentPlayer.color) {
                oppElement.classList.add('active');
            }
        }
    }
    
    showGameLink(gameUrl) {
        const gameLinkDiv = document.getElementById('game-link');
        const gameUrlInput = document.getElementById('game-url');
        
        gameUrlInput.value = gameUrl;
        gameLinkDiv.classList.remove('hidden');
        
        // Recalculate panel height after DOM update
        setTimeout(() => {
            this.recalculatePanelHeight('controls');
        }, 10);
    }
    
    copyGameLink() {
        const gameUrlInput = document.getElementById('game-url');
        gameUrlInput.select();
        document.execCommand('copy');
        
        const copyBtn = document.getElementById('copy-link-btn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    }
    
    openGameLink() {
        const gameUrlInput = document.getElementById('game-url');
        const gameUrl = gameUrlInput.value;
        
        if (gameUrl) {
            window.open(gameUrl, '_blank');
            
            // Visual feedback
            const openBtn = document.getElementById('open-link-btn');
            const originalText = openBtn.textContent;
            openBtn.textContent = 'Opened!';
            setTimeout(() => {
                openBtn.textContent = originalText;
            }, 2000);
        }
    }
    
    showHelp() {
        document.getElementById('help-modal').classList.remove('hidden');
    }
    
    hideHelp() {
        document.getElementById('help-modal').classList.add('hidden');
    }
    
    showModal(message, options = {}) {
        return new Promise((resolve) => {
            const modal = document.getElementById('generic-modal');
            const titleEl = document.getElementById('generic-modal-title');
            const msgEl = document.getElementById('generic-modal-message');
            const inputWrap = document.getElementById('generic-modal-input-wrap');
            const inputEl = document.getElementById('generic-modal-input');
            const okBtn = document.getElementById('generic-modal-ok');
            const cancelBtn = document.getElementById('generic-modal-cancel');
            const closeBtn = document.getElementById('close-generic-modal');

            titleEl.textContent = options.title || 'Notice';
            msgEl.textContent = message;

            if (options.prompt) {
                inputWrap.classList.remove('hidden');
                cancelBtn.classList.remove('hidden');
                inputEl.value = '';
            } else {
                inputWrap.classList.add('hidden');
                cancelBtn.classList.add('hidden');
            }

            modal.classList.remove('hidden');
            if (options.prompt) inputEl.focus();

            const cleanup = (value) => {
                modal.classList.add('hidden');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
                resolve(value);
            };

            const onOk = () => cleanup(options.prompt ? inputEl.value : true);
            const onCancel = () => cleanup(options.prompt ? null : false);

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
        });
    }

    sendChatMessage() {
        const input = document.getElementById('game-chat-input');
        const message = input.value.trim();

        if (!message || !this.gameId) return;

        this.socket.emit('game-chat', {
            gameId: this.gameId,
            message: message
        });

        input.value = '';
    }

    addChatMessage(data) {
        const messagesContainer = document.getElementById('game-chat-messages');
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${data.color}`;

        const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageEl.innerHTML = `
            <span class="chat-username">${data.username}</span>
            <span class="chat-time">${time}</span>
            <div class="chat-text">${data.message}</div>
        `;

        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Recalculate panel height if needed
        this.recalculatePanelHeight('chat');
    }

    loadChatHistory(messages) {
        const messagesContainer = document.getElementById('game-chat-messages');
        messagesContainer.innerHTML = '';

        messages.forEach(msg => {
            this.addChatMessage(msg);
        });
    }

    updateMoveHistory(moves) {
        const movesList = document.getElementById('moves-list');
        movesList.innerHTML = '';
        
        for (let i = 0; i < moves.length; i += 2) {
            const moveNumber = Math.floor(i / 2) + 1;
            const whiteMove = moves[i];
            const blackMove = moves[i + 1];
            
            const moveRow = document.createElement('div');
            moveRow.innerHTML = `
                <span>${moveNumber}. ${whiteMove ? whiteMove.from + '-' + whiteMove.to : ''}</span>
                <span>${blackMove ? blackMove.from + '-' + blackMove.to : ''}</span>
            `;
            movesList.appendChild(moveRow);
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});