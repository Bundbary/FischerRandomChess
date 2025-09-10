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