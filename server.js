const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

// Games persistence folder
const GAMES_DIR = path.join(__dirname, 'games');

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

// ============ Game Persistence Functions ============

// Ensure games directory exists
function ensureGamesDir() {
    if (!fs.existsSync(GAMES_DIR)) {
        fs.mkdirSync(GAMES_DIR, { recursive: true });
        console.log('Created games directory:', GAMES_DIR);
    }
}

// Generate game ID from player names (White_Black)
function generateGameId(whiteName, blackName) {
    const baseId = `${whiteName}_${blackName}`;

    // Check if this game ID already exists, if so add a number
    let gameId = baseId;
    let counter = 2;

    while (fs.existsSync(path.join(GAMES_DIR, gameId))) {
        gameId = `${baseId}_${counter}`;
        counter++;
    }

    return gameId;
}

// Save game to disk
function saveGame(game) {
    const gameDir = path.join(GAMES_DIR, game.id);

    // Create game folder if it doesn't exist
    if (!fs.existsSync(gameDir)) {
        fs.mkdirSync(gameDir, { recursive: true });
    }

    // Update timestamp
    game.updatedAt = new Date().toISOString();

    // Save game.json
    const gamePath = path.join(gameDir, 'game.json');
    fs.writeFileSync(gamePath, JSON.stringify(game, null, 2));
}

// Load a single game from disk
function loadGame(gameId) {
    const gamePath = path.join(GAMES_DIR, gameId, 'game.json');

    if (fs.existsSync(gamePath)) {
        const data = fs.readFileSync(gamePath, 'utf-8');
        return JSON.parse(data);
    }

    return null;
}

// Load all games from disk on startup
function loadAllGames() {
    ensureGamesDir();

    const gameFolders = fs.readdirSync(GAMES_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    let loaded = 0;
    for (const gameId of gameFolders) {
        const game = loadGame(gameId);
        if (game) {
            // Reset connected players (they'll reconnect)
            game.players = {};
            games.set(gameId, game);
            loaded++;
        }
    }

    console.log(`Loaded ${loaded} games from disk`);
}

// Delete a game from disk
function deleteGame(gameId) {
    const gameDir = path.join(GAMES_DIR, gameId);
    if (fs.existsSync(gameDir)) {
        // Remove all files in the folder
        const files = fs.readdirSync(gameDir);
        for (const file of files) {
            fs.unlinkSync(path.join(gameDir, file));
        }
        fs.rmdirSync(gameDir);
        console.log(`Deleted game: ${gameId}`);
        return true;
    }
    return false;
}

// ============ Game Chat Functions ============

// Load chat history for a game
function loadGameChat(gameId) {
    const chatPath = path.join(GAMES_DIR, gameId, 'chat.json');
    if (fs.existsSync(chatPath)) {
        const data = fs.readFileSync(chatPath, 'utf-8');
        return JSON.parse(data);
    }
    return [];
}

// Save a chat message to disk
function saveGameChatMessage(gameId, message) {
    const gameDir = path.join(GAMES_DIR, gameId);
    if (!fs.existsSync(gameDir)) {
        return false;
    }

    const chatPath = path.join(gameDir, 'chat.json');
    const messages = loadGameChat(gameId);
    messages.push(message);

    // Keep only last 100 messages
    if (messages.length > 100) {
        messages.splice(0, messages.length - 100);
    }

    fs.writeFileSync(chatPath, JSON.stringify(messages, null, 2));
    return true;
}

// Get games for a specific username
function getGamesForUser(username) {
    const userGames = [];

    for (const [gameId, game] of games.entries()) {
        if (game.white?.name === username || game.black?.name === username) {
            userGames.push({
                id: game.id,
                white: game.white?.name,
                black: game.black?.name,
                currentTurn: game.currentTurn,
                status: game.status,
                result: game.result,
                moveCount: game.moves?.length || 0,
                updatedAt: game.updatedAt
            });
        }
    }

    return userGames;
}

// ============ End Game Persistence ============

// HTML escape to prevent XSS
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Validate chess square notation
function isValidSquareNotation(square) {
    return typeof square === 'string' && /^[a-h][1-8]$/.test(square);
}

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

// Check if the given color has any legal moves
function hasLegalMoves(board, color, enPassantTarget, castleRights) {
    for (const [square, piece] of Object.entries(board)) {
        if (piece && piece.color === color) {
            const moves = calculatePossibleMoves(board, square, piece, enPassantTarget);
            // Add castling moves for king
            if (piece.piece === 'k' && castleRights) {
                const castlingMoves = getCastlingMoves(board, square, color, castleRights);
                moves.push(...castlingMoves);
            }
            for (const to of moves) {
                if (!wouldMoveLeaveKingInCheck(board, square, to, color)) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Get available castling destination squares for the king
function getCastlingMoves(board, kingSquare, color, castleRights) {
    const moves = [];
    const rank = color === 'white' ? 1 : 8;
    const rights = castleRights[color];

    if (!rights || isKingInCheck(board, color)) return moves;

    // Kingside
    if (rights.kingsideRook) {
        const rookSquare = rights.kingsideRook;
        if (board[rookSquare] && board[rookSquare].piece === 'r' && board[rookSquare].color === color) {
            if (isCastlingPathClear(board, kingSquare, rookSquare, 'g' + rank, 'f' + rank) &&
                !wouldPassThroughCheck(board, kingSquare, 'g' + rank, color)) {
                moves.push('g' + rank);
            }
        }
    }

    // Queenside
    if (rights.queensideRook) {
        const rookSquare = rights.queensideRook;
        if (board[rookSquare] && board[rookSquare].piece === 'r' && board[rookSquare].color === color) {
            if (isCastlingPathClear(board, kingSquare, rookSquare, 'c' + rank, 'd' + rank) &&
                !wouldPassThroughCheck(board, kingSquare, 'c' + rank, color)) {
                moves.push('c' + rank);
            }
        }
    }

    return moves;
}

// Check if squares between king and rook (and destination squares) are clear
function isCastlingPathClear(board, kingSquare, rookSquare, kingDest, rookDest) {
    const rank = kingSquare[1];
    const kingFile = kingSquare.charCodeAt(0) - 97;
    const rookFile = rookSquare.charCodeAt(0) - 97;
    const kingDestFile = kingDest.charCodeAt(0) - 97;
    const rookDestFile = rookDest.charCodeAt(0) - 97;

    // All squares the king and rook will travel through or land on must be empty
    // (except for the king and rook themselves)
    const minFile = Math.min(kingFile, rookFile, kingDestFile, rookDestFile);
    const maxFile = Math.max(kingFile, rookFile, kingDestFile, rookDestFile);

    for (let f = minFile; f <= maxFile; f++) {
        const sq = String.fromCharCode(97 + f) + rank;
        if (sq === kingSquare || sq === rookSquare) continue;
        if (board[sq]) return false;
    }
    return true;
}

// Check if king would pass through check during castling
function wouldPassThroughCheck(board, kingSquare, kingDest, color) {
    const rank = parseInt(kingSquare[1]);
    const fromFile = kingSquare.charCodeAt(0) - 97;
    const toFile = kingDest.charCodeAt(0) - 97;
    const step = fromFile < toFile ? 1 : -1;

    for (let f = fromFile; f !== toFile + step; f += step) {
        const sq = String.fromCharCode(97 + f) + rank;
        if (isSquareUnderAttack(board, sq, color)) {
            return true;
        }
    }
    return false;
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
            const rookDest = 'f' + rank;
            const kingDest = 'g' + rank;
            const rookPiece = board[kingsideRook];
            delete board[from];
            delete board[kingsideRook];
            board[kingDest] = piece;
            board[rookDest] = rookPiece;
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
            const rookDest = 'd' + rank;
            const kingDest = 'c' + rank;
            const rookPiece = board[queensideRook];
            delete board[from];
            delete board[queensideRook];
            board[kingDest] = piece;
            board[rookDest] = rookPiece;
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

// Note: generateGameId(whiteName, blackName) is defined earlier for name-based IDs

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
function createGame(gameId, whiteName = null, blackName = null) {
    const backRank = generateFischerRandomPosition();

    // Find rook and king positions for castle rights
    let kingFile = null;
    let leftRookFile = null;
    let rightRookFile = null;
    for (let i = 0; i < 8; i++) {
        if (backRank[i] === 'K') kingFile = i;
        if (backRank[i] === 'R') {
            if (leftRookFile === null) leftRookFile = i;
            else rightRookFile = i;
        }
    }

    const leftRookSquareW = String.fromCharCode(97 + leftRookFile) + '1';
    const rightRookSquareW = String.fromCharCode(97 + rightRookFile) + '1';
    const leftRookSquareB = String.fromCharCode(97 + leftRookFile) + '8';
    const rightRookSquareB = String.fromCharCode(97 + rightRookFile) + '8';

    const now = new Date().toISOString();

    const game = {
        id: gameId,
        white: whiteName ? { name: whiteName } : null,
        black: blackName ? { name: blackName } : null,
        players: {}, // Socket connections (transient)
        currentTurn: 'white',
        board: createInitialBoard(backRank),
        moves: [],
        status: 'waiting', // waiting, active, finished
        enPassantTarget: null, // Track en passant target square
        castleRights: {
            white: { queensideRook: leftRookSquareW, kingsideRook: rightRookSquareW },
            black: { queensideRook: leftRookSquareB, kingsideRook: rightRookSquareB }
        },
        result: null, // null, 'white', 'black', 'draw'
        createdAt: now,
        updatedAt: now
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
            player.username = escapeHtml(username.trim().substring(0, 20));
            
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
                message: escapeHtml(message.trim().substring(0, 200)),
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
        
        // Create game with player names (challenger = white, accepter = black)
        const whiteName = challenge.challenger;
        const blackName = player.username;
        const gameId = generateGameId(whiteName, blackName);
        const game = createGame(gameId, whiteName, blackName);
        games.set(gameId, game);
        saveGame(game);
        console.log(`Game ${gameId} created and saved to disk`);

        // Remove challenge
        lobbyChallenges.delete(challengeId);

        // Notify both players to open the game page
        const challengerSocket = io.sockets.sockets.get(challenge.challengerId);
        if (challengerSocket) {
            challengerSocket.emit('challenge-accepted', { gameId });
        }
        socket.emit('challenge-accepted', { gameId });
        
        addSystemMessage(`${player.username} accepted ${challenge.challenger}'s challenge!`);
        broadcastLobbyUpdate();
    });
    
    socket.on('get-my-games', (username) => {
        if (!username) {
            socket.emit('my-games', []);
            return;
        }
        const userGames = getGamesForUser(username);
        socket.emit('my-games', userGames);
    });

    socket.on('delete-game', (gameId) => {
        const game = games.get(gameId);
        if (!game) {
            socket.emit('error', 'Game not found');
            return;
        }

        // Remove from memory
        games.delete(gameId);

        // Remove from disk
        deleteGame(gameId);

        // Notify the player
        socket.emit('game-deleted', { gameId });

        // Update lobby
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
            castleRights: game.castleRights,
            gameUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/?game=${gameId}`
        });
        
        console.log(`Game created: ${gameId}`);
    });

    socket.on('join-game', ({ gameId, username, spectate }) => {
        const game = games.get(gameId);

        if (!game) {
            socket.emit('error', 'Game not found');
            return;
        }

        socket.join(gameId);

        // Handle spectator mode
        if (spectate) {
            // Spectators can watch but not play
            // Build player list for spectators to see names
            const players = [];
            if (game.white?.name) {
                players.push({ color: 'white', name: game.white.name });
            }
            if (game.black?.name) {
                players.push({ color: 'black', name: game.black.name });
            }

            socket.emit('game-joined', {
                gameId,
                color: null,
                spectator: true,
                board: game.board,
                castleRights: game.castleRights,
                moves: game.moves,
                currentTurn: game.currentTurn,
                enPassantTarget: game.enPassantTarget,
                status: game.status,
                result: game.result,
                chatHistory: loadGameChat(gameId),
                players: players
            });
            console.log(`Spectator joined game: ${gameId}`);
            return;
        }

        // Determine color by username (for rejoining persisted games)
        let color = null;
        let name = null;

        // Check if user is already assigned to this game
        if (game.white?.name === username) {
            color = 'white';
            name = username;
        } else if (game.black?.name === username) {
            color = 'black';
            name = username;
        } else if (!game.white?.name && Object.keys(game.players).length === 0) {
            // First player slot available
            color = 'white';
            name = username || 'White Player';
            game.white = { name };
        } else if (!game.black?.name && Object.keys(game.players).length <= 1) {
            // Second player slot available
            color = 'black';
            name = username || 'Black Player';
            game.black = { name };
        }

        if (!color) {
            // Game is full and user is not one of the players
            socket.emit('error', 'Game is full');
            return;
        }

        // Check if this player (same username) is already connected with an active socket
        const existingConnection = Object.entries(game.players).find(
            ([sid, p]) => p.color === color && p.name === username
        );
        if (existingConnection) {
            const [existingSocketId] = existingConnection;
            const existingSocket = io.sockets.sockets.get(existingSocketId);

            // If the existing socket is still connected, reject this connection
            if (existingSocket && existingSocket.connected) {
                socket.emit('error', `${username} is already connected to this game in another window`);
                return;
            }

            // Old socket is disconnected, remove it
            delete game.players[existingSocketId];
        }

        game.players[socket.id] = { color, id: socket.id, name };

        if (Object.keys(game.players).length === 2 && game.status === 'waiting') {
            game.status = 'active';
            saveGame(game);
        }

        socket.emit('game-joined', {
            gameId,
            color,
            spectator: false,
            board: game.board,
            castleRights: game.castleRights,
            moves: game.moves,
            currentTurn: game.currentTurn,
            enPassantTarget: game.enPassantTarget,
            status: game.status,
            result: game.result,
            chatHistory: loadGameChat(gameId)
        });

        // Notify all players in the game
        io.to(gameId).emit('game-updated', {
            players: Object.values(game.players),
            status: game.status,
            currentTurn: game.currentTurn
        });

        console.log(`Player ${name} joined game: ${gameId} as ${color}`);
    });

    // Game chat handler
    socket.on('game-chat', ({ gameId, message }) => {
        const game = games.get(gameId);
        if (!game) {
            socket.emit('error', 'Game not found');
            return;
        }

        const player = game.players[socket.id];
        if (!player) {
            socket.emit('error', 'You are not in this game');
            return;
        }

        const chatMessage = {
            username: player.name,
            color: player.color,
            message: escapeHtml(message.trim().substring(0, 200)),
            timestamp: new Date().toISOString()
        };

        // Save to disk
        saveGameChatMessage(gameId, chatMessage);

        // Broadcast to all players in the game
        io.to(gameId).emit('game-chat-message', chatMessage);
    });

    socket.on('make-move', ({ gameId, from, to }) => {
        // Input validation
        if (!isValidSquareNotation(from) || !isValidSquareNotation(to)) {
            socket.emit('error', 'Invalid move coordinates');
            return;
        }

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

        // Castling move: validate with castle rights
        const isCastle = piece.piece === 'k' && isCastlingMove(from, to);
        if (isCastle) {
            const castlingMoves = getCastlingMoves(game.board, from, piece.color, game.castleRights);
            if (!castlingMoves.includes(to)) {
                socket.emit('error', 'Illegal castling move');
                return;
            }
        } else {
            // Check if move is legal using enhanced validation (includes check detection)
            if (!isValidMoveEnhanced(game.board, from, to, piece, game.enPassantTarget)) {
                socket.emit('error', 'Illegal move');
                return;
            }
        }

        // Execute the move
        if (isCastle) {
            executeCastling(game.board, from, to, piece.color);
        } else if (piece.piece === 'p' && isEnPassantMove(from, to, game.enPassantTarget)) {
            executeEnPassant(game.board, from, to, piece.color);
        } else {
            // Regular move
            game.board[to] = game.board[from];
            delete game.board[from];
        }

        // Pawn promotion (auto-queen)
        if (piece.piece === 'p') {
            const destRank = parseInt(to[1]);
            if ((piece.color === 'white' && destRank === 8) || (piece.color === 'black' && destRank === 1)) {
                game.board[to] = { piece: 'q', color: piece.color };
            }
        }

        // Update castle rights
        // King moved - lose both castling rights
        if (piece.piece === 'k') {
            game.castleRights[piece.color] = { queensideRook: null, kingsideRook: null };
        }
        // Rook moved or captured - lose that side's castling right
        for (const color of ['white', 'black']) {
            const rights = game.castleRights[color];
            if (rights.queensideRook && (rights.queensideRook === from || rights.queensideRook === to)) {
                rights.queensideRook = null;
            }
            if (rights.kingsideRook && (rights.kingsideRook === from || rights.kingsideRook === to)) {
                rights.kingsideRook = null;
            }
        }

        // Update en passant target
        updateEnPassantTarget(game, from, to, piece);

        // Add move to history
        game.moves.push({ from, to, piece: piece.piece, color: piece.color });

        // Switch turns
        game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';

        // Check for checkmate or stalemate
        const opponentColor = game.currentTurn;
        const inCheck = isKingInCheck(game.board, opponentColor);
        const hasLegal = hasLegalMoves(game.board, opponentColor, game.enPassantTarget, game.castleRights);

        let gameOver = null;
        if (!hasLegal) {
            if (inCheck) {
                // Checkmate
                game.status = 'finished';
                game.result = piece.color; // the player who just moved wins
                gameOver = { type: 'checkmate', winner: piece.color };
            } else {
                // Stalemate
                game.status = 'finished';
                game.result = 'draw';
                gameOver = { type: 'stalemate' };
            }
        }

        // Notify all players
        io.to(gameId).emit('move-made', {
            from,
            to,
            board: game.board,
            currentTurn: game.currentTurn,
            moves: game.moves,
            enPassantTarget: game.enPassantTarget,
            castleRights: game.castleRights,
            inCheck,
            gameOver
        });

        // Save game state to disk
        saveGame(game);

        console.log(`Move made in game ${gameId}: ${from} to ${to}`);
        if (gameOver) {
            console.log(`Game ${gameId} ended: ${gameOver.type}${gameOver.winner ? ' - ' + gameOver.winner + ' wins' : ''}`);
        }
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
        
        // Remove player from any games (but keep persisted games)
        for (const [gameId, game] of games.entries()) {
            if (game.players[socket.id]) {
                delete game.players[socket.id];

                // Notify remaining players
                if (Object.keys(game.players).length > 0) {
                    io.to(gameId).emit('player-disconnected', {
                        players: Object.values(game.players)
                    });
                }
                // Note: We don't delete games from memory anymore - they persist on disk
                break;
            }
        }
    });
});

// Load persisted games on startup
loadAllGames();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to play`);
});