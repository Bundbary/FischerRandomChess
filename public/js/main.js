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
    }
    
    setupSocketListeners() {
        this.socket.on('game-created', (data) => {
            this.gameId = data.gameId;
            this.playerColor = data.color;
            this.board.setPlayerColor(data.color); // Set board orientation
            this.board.setupBoard(data.board);
            this.updateGameStatus('Waiting for opponent...');
            this.showGameLink(data.gameUrl);
        });
        
        this.socket.on('game-joined', (data) => {
            this.gameId = data.gameId;
            this.playerColor = data.color;
            this.board.setPlayerColor(data.color); // Set board orientation
            this.board.setupBoard(data.board);
            this.updateGameStatus('Game joined! Waiting for white to move...');
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
            if (data.enPassantTarget) {
                this.board.enPassantTarget = data.enPassantTarget;
            } else {
                this.board.enPassantTarget = null;
            }
            
            // Check for check status and update game status accordingly
            const isInCheck = this.board.isKingInCheck(this.currentTurn);
            let statusMessage;
            
            if (isInCheck) {
                const isYourTurn = this.currentTurn === this.playerColor;
                if (isYourTurn) {
                    statusMessage = `Check! Your king is in danger`;
                } else {
                    statusMessage = `Check! Opponent's king is in danger`;
                }
            } else {
                statusMessage = `${this.currentTurn}'s turn`;
            }
            
            this.updateGameStatus(statusMessage);
            this.board.setInteractive(this.playerColor === this.currentTurn);
            this.updateMoveHistory(data.moves);
            
            // Update player indicators to show whose turn it is
            if (this.gameId) {
                // Simulate player data for turn highlighting
                const players = [
                    { color: this.playerColor, name: this.playerColor === 'white' ? 'White Player' : 'Black Player' },
                    { color: this.playerColor === 'white' ? 'black' : 'white', name: this.playerColor === 'white' ? 'Black Player' : 'White Player' }
                ];
                this.updatePlayerInfo(players);
            }
        });
        
        this.socket.on('error', (message) => {
            alert(message);
        });
        
        this.socket.on('player-disconnected', (data) => {
            this.updateGameStatus('Opponent disconnected');
            this.board.setInteractive(false);
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
        this.socket.emit('join-game', gameId);
        document.getElementById('new-game-btn').disabled = true;
        document.getElementById('join-game-btn').disabled = true;
    }
    
    showJoinGamePrompt() {
        const gameId = prompt('Enter game ID:');
        if (gameId) {
            this.joinGame(gameId);
        }
    }
    
    makeMove(from, to) {
        if (this.playerColor !== this.currentTurn) {
            return false;
        }
        
        const piece = this.board.board[from];
        
        // Check if this is a special move and execute it locally first
        if (this.board.isCastlingMove(from, to)) {
            this.board.executeCastling(from, to);
        } else if (this.board.isEnPassantMove(from, to)) {
            this.board.executeEnPassant(from, to);
        }
        
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
        ['controls', 'theme', 'history'].forEach(panelName => {
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