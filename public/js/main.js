import { ChessBoard } from './board.js';
import { SocketManager } from './socket.js';

class Game {
    constructor() {
        this.board = new ChessBoard();
        this.socket = new SocketManager();
        this.gameId = null;
        this.playerColor = null;
        this.currentTurn = 'white';
        this.isSpectator = false;

        // History navigation state
        this.initialBoard = null;
        this.moves = [];
        this.viewingMoveIndex = -1; // -1 = live position, 0+ = viewing history

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

        // History navigation buttons
        document.getElementById('nav-first').addEventListener('click', () => this.navigateToMove(0));
        document.getElementById('nav-prev').addEventListener('click', () => this.navigatePrev());
        document.getElementById('nav-next').addEventListener('click', () => this.navigateNext());
        document.getElementById('nav-last').addEventListener('click', () => this.navigateToLive());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Only handle if we have moves and not typing in an input
            if (!this.moves.length || e.target.tagName === 'INPUT') return;

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.navigatePrev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.navigateNext();
            } else if (e.key === 'Home') {
                e.preventDefault();
                this.navigateToMove(0);
            } else if (e.key === 'End') {
                e.preventDefault();
                this.navigateToLive();
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
                this.socket.emit('join-game', { gameId: this.gameId, username, spectate: this.isSpectator });
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
            this.isSpectator = data.spectator || false;

            // Store history data for navigation
            this.initialBoard = data.initialBoard;
            this.moves = data.moves || [];
            this.viewingMoveIndex = -1; // Start at live position

            // Set board orientation (spectators see white's perspective)
            this.board.setPlayerColor(data.color || 'white');
            this.board.castleRights = data.castleRights || null;
            this.board.enPassantTarget = data.enPassantTarget || null;
            this.board.setupBoard(data.board);

            // Restore move history if rejoining
            if (this.moves.length > 0) {
                this.updateMoveHistory(this.moves);
            }
            this.updateNavButtons();

            // Load chat history if available
            if (data.chatHistory && data.chatHistory.length > 0) {
                this.loadChatHistory(data.chatHistory);
            }

            // Handle spectator mode
            if (this.isSpectator) {
                this.updateGameStatus(`Spectating - ${data.currentTurn}'s turn`);
                this.board.setInteractive(false);
                // Show player names for spectators
                if (data.players) {
                    this.updateSpectatorPlayerInfo(data.players);
                }
                return;
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
            // Store moves for history navigation
            this.moves = data.moves || [];

            // Always return to live position when a new move is made
            this.viewingMoveIndex = -1;
            document.body.classList.remove('viewing-history');

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
                    if (this.isSpectator) {
                        statusMessage = `Checkmate! ${data.gameOver.winner} wins!`;
                    } else {
                        const winnerIsMe = data.gameOver.winner === this.playerColor;
                        statusMessage = winnerIsMe ? 'Checkmate! You win!' : 'Checkmate! You lose.';
                    }
                } else if (data.gameOver.type === 'stalemate') {
                    statusMessage = 'Stalemate - Draw!';
                }
                this.updateGameStatus(statusMessage);
                this.board.setInteractive(false);
                this.updateMoveHistory(this.moves);
                this.updateNavButtons();
                return;
            }

            // Check status
            let statusMessage;
            if (this.isSpectator) {
                statusMessage = data.inCheck
                    ? `Check! ${this.currentTurn}'s turn`
                    : `Spectating - ${this.currentTurn}'s turn`;
            } else if (data.inCheck) {
                const isYourTurn = this.currentTurn === this.playerColor;
                statusMessage = isYourTurn ? 'Check! Your king is in danger' : "Check! Opponent's king is in danger";
            } else {
                statusMessage = `${this.currentTurn}'s turn`;
            }

            this.updateGameStatus(statusMessage);
            // Spectators can never interact with the board
            this.board.setInteractive(!this.isSpectator && this.playerColor === this.currentTurn);
            this.updateMoveHistory(this.moves);
            this.updateNavButtons();

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
        const spectate = urlParams.get('spectate') === 'true';
        if (gameId) {
            this.joinGame(gameId, spectate);
        }
    }
    
    createGame() {
        this.socket.emit('create-game');
        document.getElementById('new-game-btn').disabled = true;
        document.getElementById('join-game-btn').disabled = true;
    }
    
    joinGame(gameId, spectate = false) {
        this.isSpectator = spectate;
        const username = localStorage.getItem('chess-username') || '';
        this.socket.emit('join-game', { gameId, username, spectate });
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

            // Spectators get their own status format
            if (this.isSpectator) {
                gameStatusElement.innerHTML = `
                    ${status}
                    <span class="turn-indicator ${turnColor}"></span>
                `;
            } else {
                const isYourTurn = turnColor === this.playerColor;

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

    updateSpectatorPlayerInfo(players) {
        // Spectators see white on bottom, black on top (standard orientation)
        const blackElement = document.getElementById('player-black');
        const whiteElement = document.getElementById('player-white');

        blackElement.classList.remove('active');
        whiteElement.classList.remove('active');

        const whitePlayer = players.find(p => p.color === 'white');
        const blackPlayer = players.find(p => p.color === 'black');

        if (whitePlayer) {
            const nameSpan = whiteElement.querySelector('.player-name');
            const statusSpan = whiteElement.querySelector('.player-status');
            nameSpan.textContent = `${whitePlayer.name} (white)`;
            statusSpan.textContent = '';
            if (this.currentTurn === 'white') {
                whiteElement.classList.add('active');
            }
        }

        if (blackPlayer) {
            const nameSpan = blackElement.querySelector('.player-name');
            const statusSpan = blackElement.querySelector('.player-status');
            nameSpan.textContent = `${blackPlayer.name} (black)`;
            statusSpan.textContent = '';
            if (this.currentTurn === 'black') {
                blackElement.classList.add('active');
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
            const newWindow = window.open(gameUrl, '_blank');

            // Check if popup was blocked
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                this.showModal('Popup blocked! Please allow popups for this site, or copy the link and paste it in a new tab.');
                return;
            }

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

            // Move number
            const numSpan = document.createElement('span');
            numSpan.className = 'move-number';
            numSpan.textContent = `${moveNumber}.`;
            moveRow.appendChild(numSpan);

            // White move (clickable)
            const whiteSpan = document.createElement('span');
            whiteSpan.className = 'move-entry';
            whiteSpan.dataset.moveIndex = i;
            whiteSpan.textContent = whiteMove ? `${whiteMove.from}-${whiteMove.to}` : '';
            if (whiteMove) {
                whiteSpan.addEventListener('click', () => this.navigateToMove(i + 1));
            }
            moveRow.appendChild(whiteSpan);

            // Black move (clickable)
            const blackSpan = document.createElement('span');
            blackSpan.className = 'move-entry';
            blackSpan.dataset.moveIndex = i + 1;
            blackSpan.textContent = blackMove ? `${blackMove.from}-${blackMove.to}` : '';
            if (blackMove) {
                blackSpan.addEventListener('click', () => this.navigateToMove(i + 2));
            }
            moveRow.appendChild(blackSpan);

            movesList.appendChild(moveRow);
        }

        this.highlightCurrentMove();
    }

    // ============ History Navigation ============

    navigateToMove(moveIndex) {
        // Check if history navigation is available
        if (!this.initialBoard) {
            this.showModal('History navigation not available for this game (created before this feature).');
            return;
        }

        // moveIndex: 0 = initial position, 1 = after move 1, etc.
        if (moveIndex < 0) moveIndex = 0;
        if (moveIndex > this.moves.length) moveIndex = this.moves.length;

        if (moveIndex === this.moves.length) {
            // Go to live position
            this.navigateToLive();
            return;
        }

        this.viewingMoveIndex = moveIndex;
        const board = this.reconstructBoardAtMove(moveIndex);
        this.board.setupBoard(board);
        this.board.setInteractive(false); // Can't move while viewing history

        document.body.classList.add('viewing-history');
        this.updateGameStatus(`Viewing move ${moveIndex} of ${this.moves.length}`);
        this.highlightCurrentMove();
        this.updateNavButtons();
    }

    navigatePrev() {
        if (this.viewingMoveIndex === -1) {
            // Currently at live, go to last move
            this.navigateToMove(this.moves.length - 1);
        } else if (this.viewingMoveIndex > 0) {
            this.navigateToMove(this.viewingMoveIndex - 1);
        }
    }

    navigateNext() {
        if (this.viewingMoveIndex === -1) return; // Already at live

        if (this.viewingMoveIndex < this.moves.length - 1) {
            this.navigateToMove(this.viewingMoveIndex + 1);
        } else {
            this.navigateToLive();
        }
    }

    navigateToLive() {
        this.viewingMoveIndex = -1;
        document.body.classList.remove('viewing-history');

        // Restore live board state by reconstructing from all moves
        if (this.initialBoard) {
            const liveBoard = this.reconstructBoardAtMove(this.moves.length);
            this.board.setupBoard(liveBoard);
        }
        // If no initialBoard, the board is already showing the live state

        // Restore interactivity based on turn
        const isMyTurn = this.currentTurn === this.playerColor;
        this.board.setInteractive(!this.isSpectator && isMyTurn);

        // Restore status
        if (this.isSpectator) {
            this.updateGameStatus(`Spectating - ${this.currentTurn}'s turn`);
        } else {
            this.updateGameStatus(isMyTurn ? 'Your turn!' : "Opponent's turn");
        }

        this.highlightCurrentMove();
        this.updateNavButtons();
    }

    reconstructBoardAtMove(moveIndex) {
        // Start from initial board
        const board = JSON.parse(JSON.stringify(this.initialBoard));

        // Apply moves up to moveIndex
        for (let i = 0; i < moveIndex && i < this.moves.length; i++) {
            const move = this.moves[i];
            this.applyMoveToBoard(board, move);
        }

        return board;
    }

    applyMoveToBoard(board, move) {
        // Handle castling
        if (move.castling) {
            // Move king
            board[move.to] = board[move.from];
            delete board[move.from];
            // Move rook
            board[move.castling.rookTo] = board[move.castling.rookFrom];
            delete board[move.castling.rookFrom];
            return;
        }

        // Handle en passant
        if (move.enPassantCapture) {
            board[move.to] = board[move.from];
            delete board[move.from];
            delete board[move.enPassantCapture];
            return;
        }

        // Regular move
        board[move.to] = board[move.from];
        delete board[move.from];

        // Handle promotion
        if (move.promotion) {
            board[move.to] = { piece: move.promotion, color: move.color };
        }
    }

    highlightCurrentMove() {
        // Remove all current highlights
        document.querySelectorAll('#moves-list .move-entry.current').forEach(el => {
            el.classList.remove('current');
        });

        if (this.viewingMoveIndex === -1) {
            // At live position - highlight last move
            const lastIndex = this.moves.length - 1;
            if (lastIndex >= 0) {
                const el = document.querySelector(`#moves-list .move-entry[data-move-index="${lastIndex}"]`);
                if (el) el.classList.add('current');
            }
        } else if (this.viewingMoveIndex > 0) {
            // Highlight the move we're viewing (moveIndex - 1 because moveIndex is position AFTER the move)
            const el = document.querySelector(`#moves-list .move-entry[data-move-index="${this.viewingMoveIndex - 1}"]`);
            if (el) el.classList.add('current');
        }
    }

    updateNavButtons() {
        const firstBtn = document.getElementById('nav-first');
        const prevBtn = document.getElementById('nav-prev');
        const nextBtn = document.getElementById('nav-next');
        const lastBtn = document.getElementById('nav-last');

        const atStart = this.viewingMoveIndex === 0;
        const atLive = this.viewingMoveIndex === -1;
        const noMoves = this.moves.length === 0;
        const noHistory = !this.initialBoard; // Can't navigate without initial board

        firstBtn.disabled = atStart || noMoves || noHistory;
        prevBtn.disabled = atStart || noMoves || noHistory;
        nextBtn.disabled = atLive || noMoves || noHistory;
        lastBtn.disabled = atLive || noMoves || noHistory;
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});