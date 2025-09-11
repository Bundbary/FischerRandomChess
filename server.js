const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve lobby as default page
app.get('/', (req, res) => {
    if (req.query.game) {
        // If there's a game parameter, serve the game
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        // Otherwise serve the lobby
        res.sendFile(path.join(__dirname, 'lobby.html'));
    }
});

// Explicit game route
app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static files from public directory and root
app.use(express.static('public'));
app.use(express.static('.'));

// Store active games in memory
const games = new Map();

// Store lobby data
const lobbyPlayers = new Map(); // socketId -> { username, status, socketId }
const lobbyChallenges = new Map(); // challengeId -> { challenger, type, targetPlayer, challengerId }
const lobbyChatHistory = [];

// Server-side move validation (simplified version of client logic)
function isValidMove(board, from, to, piece) {
    const possibleMoves = calculatePossibleMoves(board, from, piece);
    return possibleMoves.includes(to);
}

function calculatePossibleMoves(board, from, piece, enPassantTarget = null) {
    const moves = [];
    const file = from.charCodeAt(0) - 97; // a=0, b=1, etc.
    const rank = parseInt(from[1]);
    
    switch (piece.piece) {
        case 'p': // Pawn
            calculatePawnMoves(board, moves, file, rank, piece.color, enPassantTarget);
            break;
        case 'r': // Rook
            calculateSlidingMoves(board, moves, file, rank, piece.color, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
            break;
        case 'n': // Knight
            calculateKnightMoves(board, moves, file, rank, piece.color);
            break;
        case 'b': // Bishop
            calculateSlidingMoves(board, moves, file, rank, piece.color, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
            break;
        case 'q': // Queen
            calculateSlidingMoves(board, moves, file, rank, piece.color, [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
            break;
        case 'k': // King
            calculateKingMoves(board, moves, file, rank, piece.color);
            break;
    }
    
    return moves;
}

function calculatePawnMoves(board, moves, file, rank, color, enPassantTarget) {
    const direction = color === 'white' ? 1 : -1;
    const startRank = color === 'white' ? 2 : 7;
    
    // Forward move
    const oneForward = String.fromCharCode(97 + file) + (rank + direction);
    if (isValidSquare(file, rank + direction) && !board[oneForward]) {
        moves.push(oneForward);
        
        // Two squares forward from starting position
        if (rank === startRank) {
            const twoForward = String.fromCharCode(97 + file) + (rank + 2 * direction);
            if (!board[twoForward]) {
                moves.push(twoForward);
            }
        }
    }
    
    // Captures (including en passant)
    [-1, 1].forEach(fileOffset => {
        const newFile = file + fileOffset;
        const newRank = rank + direction;
        if (isValidSquare(newFile, newRank)) {
            const square = String.fromCharCode(97 + newFile) + newRank;
            
            // Regular capture
            if (board[square] && board[square].color !== color) {
                moves.push(square);
            }
            
            // En passant capture
            if (enPassantTarget === square) {
                moves.push(square);
            }
        }
    });
}

function calculateSlidingMoves(board, moves, file, rank, color, directions) {
    directions.forEach(([fileDir, rankDir]) => {
        for (let i = 1; i < 8; i++) {
            const newFile = file + i * fileDir;
            const newRank = rank + i * rankDir;
            
            if (!isValidSquare(newFile, newRank)) break;
            
            const square = String.fromCharCode(97 + newFile) + newRank;
            
            if (board[square]) {
                if (board[square].color !== color) {
                    moves.push(square);
                }
                break; // Blocked by piece
            }
            
            moves.push(square);
        }
    });
}

function calculateKnightMoves(board, moves, file, rank, color) {
    const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    
    knightMoves.forEach(([fileOffset, rankOffset]) => {
        const newFile = file + fileOffset;
        const newRank = rank + rankOffset;
        
        if (isValidSquare(newFile, newRank)) {
            const square = String.fromCharCode(97 + newFile) + newRank;
            if (!board[square] || board[square].color !== color) {
                moves.push(square);
            }
        }
    });
}

function calculateKingMoves(board, moves, file, rank, color) {
    const kingMoves = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];
    
    kingMoves.forEach(([fileOffset, rankOffset]) => {
        const newFile = file + fileOffset;
        const newRank = rank + rankOffset;
        
        if (isValidSquare(newFile, newRank)) {
            const square = String.fromCharCode(97 + newFile) + newRank;
            if (!board[square] || board[square].color !== color) {
                moves.push(square);
            }
        }
    });
}

function isValidSquare(file, rank) {
    return file >= 0 && file < 8 && rank >= 1 && rank <= 8;
}

// Find the king of a given color
function findKing(board, color) {
    for (const [square, piece] of Object.entries(board)) {
        if (piece && piece.piece === 'k' && piece.color === color) {
            return square;
        }
    }
    return null;
}

// Check if a king is in check
function isKingInCheck(board, color) {
    const kingSquare = findKing(board, color);
    if (!kingSquare) return false;
    
    return isSquareUnderAttack(board, kingSquare, color);
}

// Check if a square is under attack by the opposite color
function isSquareUnderAttack(board, square, defendingColor) {
    const attackingColor = defendingColor === 'white' ? 'black' : 'white';
    
    // Check all pieces of the attacking color
    for (const [fromSquare, piece] of Object.entries(board)) {
        if (piece && piece.color === attackingColor) {
            const possibleMoves = calculatePossibleMoves(board, fromSquare, piece);
            if (possibleMoves.includes(square)) {
                return true;
            }
        }
    }
    
    return false;
}

// Check if a move would leave the king in check
function wouldMoveLeaveKingInCheck(board, from, to, color) {
    // Create a temporary board state
    const tempBoard = JSON.parse(JSON.stringify(board));
    const movingPiece = tempBoard[from];
    
    // Make the move temporarily
    tempBoard[to] = movingPiece;
    delete tempBoard[from];
    
    // Check if king is in check
    return isKingInCheck(tempBoard, color);
}

// Enhanced move validation including check
function isValidMoveEnhanced(board, from, to, piece, enPassantTarget = null) {
    // First check basic move validity
    const possibleMoves = calculatePossibleMoves(board, from, piece, enPassantTarget);
    if (!possibleMoves.includes(to)) {
        return false;
    }
    
    // Then check if move would leave king in check
    return !wouldMoveLeaveKingInCheck(board, from, to, piece.color);
}

function isCastlingMove(from, to) {
    const rank = parseInt(from[1]);
    const startRank = from[1] === '1' ? 1 : 8;
    
    return rank === startRank && (to === 'c' + rank || to === 'g' + rank);
}

function executeCastling(board, from, to, color) {
    const piece = board[from];
    const rank = parseInt(to[1]);
    
    if (to[0] === 'g') {
        // Kingside castling
        // Find the kingside rook
        let kingsideRook = null;
        for (let f = 7; f >= 0; f--) {
            const square = String.fromCharCode(97 + f) + rank;
            const rookPiece = board[square];
            if (rookPiece && rookPiece.piece === 'r' && rookPiece.color === color) {
                kingsideRook = square;
                break;
            }
        }
        
        if (kingsideRook) {
            // Move king to g-file, rook to f-file
            board['g' + rank] = piece;
            board['f' + rank] = board[kingsideRook];
            delete board[from];
            delete board[kingsideRook];
        }
    } else if (to[0] === 'c') {
        // Queenside castling
        // Find the queenside rook
        let queensideRook = null;
        for (let f = 0; f < 8; f++) {
            const square = String.fromCharCode(97 + f) + rank;
            const rookPiece = board[square];
            if (rookPiece && rookPiece.piece === 'r' && rookPiece.color === color) {
                queensideRook = square;
                break;
            }
        }
        
        if (queensideRook) {
            // Move king to c-file, rook to d-file
            board['c' + rank] = piece;
            board['d' + rank] = board[queensideRook];
            delete board[from];
            delete board[queensideRook];
        }
    }
}

function isEnPassantMove(from, to, enPassantTarget) {
    return enPassantTarget === to;
}

function executeEnPassant(board, from, to, color) {
    const piece = board[from];
    const direction = color === 'white' ? -1 : 1;
    const capturedPawnSquare = to[0] + (parseInt(to[1]) + direction);
    
    // Move the pawn
    board[to] = piece;
    delete board[from];
    
    // Remove the captured pawn
    delete board[capturedPawnSquare];
}

function updateEnPassantTarget(game, from, to, piece) {
    // Clear previous en passant target
    game.enPassantTarget = null;
    
    // Check if a pawn moved two squares
    if (piece.piece === 'p') {
        const fromRank = parseInt(from[1]);
        const toRank = parseInt(to[1]);
        
        if (Math.abs(toRank - fromRank) === 2) {
            // Set en passant target square (the square the pawn "passed over")
            const targetRank = (fromRank + toRank) / 2;
            game.enPassantTarget = to[0] + targetRank;
        }
    }
}

// Generate random game ID
function generateGameId() {
    return Math.random().toString(36).substr(2, 9);
}

// Generate Fischer Random starting position
function generateFischerRandomPosition() {
    const pieces = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    
    // Place bishops on opposite colors
    const lightSquares = [1, 3, 5, 7];
    const darkSquares = [0, 2, 4, 6];
    
    const lightBishop = lightSquares[Math.floor(Math.random() * lightSquares.length)];
    const darkBishop = darkSquares[Math.floor(Math.random() * darkSquares.length)];
    
    const position = new Array(8);
    position[lightBishop] = 'B';
    position[darkBishop] = 'B';
    
    // Place queen randomly in remaining spots
    const remaining = [];
    for (let i = 0; i < 8; i++) {
        if (!position[i]) remaining.push(i);
    }
    
    const queenPos = remaining[Math.floor(Math.random() * remaining.length)];
    position[queenPos] = 'Q';
    remaining.splice(remaining.indexOf(queenPos), 1);
    
    // Place knights randomly
    const knight1 = remaining[Math.floor(Math.random() * remaining.length)];
    position[knight1] = 'N';
    remaining.splice(remaining.indexOf(knight1), 1);
    
    const knight2 = remaining[Math.floor(Math.random() * remaining.length)];
    position[knight2] = 'N';
    remaining.splice(remaining.indexOf(knight2), 1);
    
    // Place king between rooks
    remaining.sort((a, b) => a - b);
    position[remaining[0]] = 'R';
    position[remaining[1]] = 'K';
    position[remaining[2]] = 'R';
    
    return position;
}

// Create initial game state
function createGame(gameId) {
    const backRank = generateFischerRandomPosition();
    
    const game = {
        id: gameId,
        players: {},
        currentTurn: 'white',
        board: createInitialBoard(backRank),
        moves: [],
        status: 'waiting', // waiting, active, finished
        enPassantTarget: null // Track en passant target square
    };
    
    return game;
}

function createInitialBoard(backRank) {
    const board = {};
    
    // Place white pieces
    const whiteBackRank = ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1'];
    const whitePawnRank = ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'];
    
    backRank.forEach((piece, index) => {
        board[whiteBackRank[index]] = { piece: piece.toLowerCase(), color: 'white' };
    });
    
    whitePawnRank.forEach(square => {
        board[square] = { piece: 'p', color: 'white' };
    });
    
    // Place black pieces
    const blackBackRank = ['a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8'];
    const blackPawnRank = ['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7'];
    
    backRank.forEach((piece, index) => {
        board[blackBackRank[index]] = { piece: piece.toLowerCase(), color: 'black' };
    });
    
    blackPawnRank.forEach(square => {
        board[square] = { piece: 'p', color: 'black' };
    });
    
    return board;
}

// Lobby helper functions
function broadcastLobbyUpdate() {
    io.emit('players-update', Object.fromEntries(lobbyPlayers));
    io.emit('challenges-update', Object.fromEntries(lobbyChallenges));
    io.emit('active-games-update', Object.fromEntries(games));
    io.emit('player-count', lobbyPlayers.size);
}

function generateChallengeId() {
    return Math.random().toString(36).substr(2, 9);
}

function addSystemMessage(message) {
    const systemMessage = {
        type: 'system',
        message: message,
        timestamp: new Date().toISOString()
    };
    lobbyChatHistory.push(systemMessage);
    io.emit('chat-message', systemMessage);
    
    // Keep only last 50 messages
    if (lobbyChatHistory.length > 50) {
        lobbyChatHistory.shift();
    }
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Add to lobby players
    lobbyPlayers.set(socket.id, {
        socketId: socket.id,
        username: '',
        status: 'Available'
    });
    
    // Send current state to new player
    socket.emit('players-update', Object.fromEntries(lobbyPlayers));
    socket.emit('challenges-update', Object.fromEntries(lobbyChallenges));
    socket.emit('active-games-update', Object.fromEntries(games));
    socket.emit('player-count', lobbyPlayers.size);
    
    // Send chat history
    lobbyChatHistory.slice(-10).forEach(message => {
        socket.emit('chat-message', message);
    });
    
    // Lobby event handlers
    socket.on('set-username', (username) => {
        const player = lobbyPlayers.get(socket.id);
        if (player) {
            const oldUsername = player.username;
            player.username = username.trim().substring(0, 20);
            
            if (oldUsername) {
                addSystemMessage(`${oldUsername} is now known as ${player.username}`);
            } else {
                addSystemMessage(`${player.username} joined the lobby`);
            }
            
            broadcastLobbyUpdate();
        }
    });
    
    socket.on('chat-message', (message) => {
        const player = lobbyPlayers.get(socket.id);
        if (player && player.username) {
            const chatMessage = {
                type: 'user',
                username: player.username,
                message: message.trim().substring(0, 200),
                timestamp: new Date().toISOString()
            };
            
            lobbyChatHistory.push(chatMessage);
            io.emit('chat-message', chatMessage);
            
            // Keep only last 50 messages
            if (lobbyChatHistory.length > 50) {
                lobbyChatHistory.shift();
            }
        }
    });
    
    socket.on('create-challenge', (challengeData) => {
        const player = lobbyPlayers.get(socket.id);
        if (!player || !player.username) {
            socket.emit('error', 'Please set your username first');
            return;
        }
        
        const challengeId = generateChallengeId();
        const challenge = {
            id: challengeId,
            challenger: player.username,
            challengerId: socket.id,
            type: challengeData.type,
            targetPlayer: challengeData.targetPlayer,
            timestamp: new Date().toISOString()
        };
        
        lobbyChallenges.set(challengeId, challenge);
        broadcastLobbyUpdate();
        
        const targetName = challengeData.type === 'specific' ? 
            lobbyPlayers.get(challengeData.targetPlayer)?.username || 'Unknown' : 
            'anyone';
        
        addSystemMessage(`${player.username} created a challenge against ${targetName}`);
    });
    
    socket.on('accept-challenge', (challengeId) => {
        const challenge = lobbyChallenges.get(challengeId);
        const player = lobbyPlayers.get(socket.id);
        
        if (!challenge || !player || !player.username) {
            socket.emit('error', 'Challenge not found or no username set');
            return;
        }
        
        // Create game
        const gameId = generateGameId();
        const game = createGame(gameId);
        games.set(gameId, game);
        
        // Set up players
        game.players[challenge.challengerId] = {
            color: 'white',
            id: challenge.challengerId,
            name: challenge.challenger
        };
        
        game.players[socket.id] = {
            color: 'black',
            id: socket.id,
            name: player.username
        };
        
        game.status = 'active';
        
        // Remove challenge
        lobbyChallenges.delete(challengeId);
        
        // Notify players
        const challengerSocket = io.sockets.sockets.get(challenge.challengerId);
        if (challengerSocket) {
            challengerSocket.emit('challenge-accepted', { gameId });
        }
        socket.emit('challenge-accepted', { gameId });
        
        addSystemMessage(`${player.username} accepted ${challenge.challenger}'s challenge!`);
        broadcastLobbyUpdate();
    });
    
    socket.on('quick-play', () => {
        const player = lobbyPlayers.get(socket.id);
        if (!player || !player.username) {
            socket.emit('error', 'Please set your username first');
            return;
        }
        
        // Find any open challenge
        const openChallenge = Array.from(lobbyChallenges.values())
            .find(c => c.type === 'anyone' && c.challengerId !== socket.id);
        
        if (openChallenge) {
            // Accept the first available challenge
            socket.emit('accept-challenge', openChallenge.id);
        } else {
            // Create an open challenge
            socket.emit('create-challenge', { type: 'anyone' });
        }
    });

    socket.on('create-game', () => {
        const gameId = generateGameId();
        const game = createGame(gameId);
        games.set(gameId, game);
        
        socket.join(gameId);
        game.players[socket.id] = { 
            color: 'white', 
            id: socket.id,
            name: 'White Player'
        };
        
        socket.emit('game-created', { 
            gameId, 
            color: 'white',
            board: game.board,
            gameUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/?game=${gameId}`
        });
        
        console.log(`Game created: ${gameId}`);
    });

    socket.on('join-game', (gameId) => {
        const game = games.get(gameId);
        
        if (!game) {
            socket.emit('error', 'Game not found');
            return;
        }
        
        if (Object.keys(game.players).length >= 2) {
            socket.emit('error', 'Game is full');
            return;
        }
        
        socket.join(gameId);
        game.players[socket.id] = { 
            color: 'black', 
            id: socket.id,
            name: 'Black Player'
        };
        
        if (Object.keys(game.players).length === 2) {
            game.status = 'active';
        }
        
        socket.emit('game-joined', { 
            gameId, 
            color: 'black',
            board: game.board
        });
        
        // Notify all players in the game
        io.to(gameId).emit('game-updated', {
            players: Object.values(game.players),
            status: game.status,
            currentTurn: game.currentTurn
        });
        
        console.log(`Player joined game: ${gameId}`);
    });

    socket.on('make-move', ({ gameId, from, to }) => {
        const game = games.get(gameId);
        
        if (!game || game.status !== 'active') {
            socket.emit('error', 'Invalid game state');
            return;
        }
        
        const player = game.players[socket.id];
        if (!player || player.color !== game.currentTurn) {
            socket.emit('error', 'Not your turn');
            return;
        }
        
        // Basic move validation
        const piece = game.board[from];
        if (!piece || piece.color !== player.color) {
            socket.emit('error', 'Invalid piece selection');
            return;
        }
        
        // Check if move is legal using enhanced validation (includes check detection)
        if (!isValidMoveEnhanced(game.board, from, to, piece, game.enPassantTarget)) {
            socket.emit('error', 'Illegal move - cannot leave king in check');
            return;
        }
        
        // Check if this is a special move
        if (piece.piece === 'k' && isCastlingMove(from, to)) {
            executeCastling(game.board, from, to, piece.color);
        } else if (piece.piece === 'p' && isEnPassantMove(from, to, game.enPassantTarget)) {
            executeEnPassant(game.board, from, to, piece.color);
        } else {
            // Regular move
            game.board[to] = game.board[from];
            delete game.board[from];
        }
        
        // Update en passant target
        updateEnPassantTarget(game, from, to, piece);
        
        // Add move to history
        game.moves.push({ from, to, piece: piece.piece, color: piece.color });
        
        // Switch turns
        game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';
        
        // Notify all players
        io.to(gameId).emit('move-made', {
            from,
            to,
            board: game.board,
            currentTurn: game.currentTurn,
            moves: game.moves,
            enPassantTarget: game.enPassantTarget
        });
        
        console.log(`Move made in game ${gameId}: ${from} to ${to}`);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        // Remove from lobby
        const player = lobbyPlayers.get(socket.id);
        if (player && player.username) {
            addSystemMessage(`${player.username} left the lobby`);
        }
        lobbyPlayers.delete(socket.id);
        
        // Remove any challenges created by this player
        const challengesToRemove = [];
        for (const [challengeId, challenge] of lobbyChallenges.entries()) {
            if (challenge.challengerId === socket.id) {
                challengesToRemove.push(challengeId);
            }
        }
        challengesToRemove.forEach(id => lobbyChallenges.delete(id));
        
        // Broadcast lobby updates
        broadcastLobbyUpdate();
        
        // Remove player from any games
        for (const [gameId, game] of games.entries()) {
            if (game.players[socket.id]) {
                delete game.players[socket.id];
                
                // If game is empty, remove it
                if (Object.keys(game.players).length === 0) {
                    games.delete(gameId);
                    console.log(`Game ${gameId} removed - no players`);
                } else {
                    // Notify remaining players
                    io.to(gameId).emit('player-disconnected', {
                        players: Object.values(game.players)
                    });
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to play`);
});