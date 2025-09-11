export class ChessBoard {
    constructor() {
        this.boardElement = document.getElementById('chess-board');
        this.selectedSquare = null;
        this.interactive = false;
        this.board = {};
        this.playerColor = 'white'; // Default to white, will be set when joining game
        this.enPassantTarget = null; // Track en passant target square
        
        // Chess piece SVG files
        this.pieceImages = {
            'white': {
                'k': '/pieces/wK.svg',
                'q': '/pieces/wQ.svg', 
                'r': '/pieces/wR.svg',
                'b': '/pieces/wB.svg',
                'n': '/pieces/wN.svg',
                'p': '/pieces/wP.svg'
            },
            'black': {
                'k': '/pieces/bK.svg',
                'q': '/pieces/bQ.svg',
                'r': '/pieces/bR.svg', 
                'b': '/pieces/bB.svg',
                'n': '/pieces/bN.svg',
                'p': '/pieces/bP.svg'
            }
        };
        
        this.createBoard();
    }
    
    createBoard() {
        this.boardElement.innerHTML = '';
        
        // Create squares based on player color orientation
        // White player sees ranks 8->1 (normal), Black player sees ranks 1->8 (flipped)
        const startRank = this.playerColor === 'white' ? 8 : 1;
        const endRank = this.playerColor === 'white' ? 1 : 8;
        const rankStep = this.playerColor === 'white' ? -1 : 1;
        
        // File order also flips for black
        const startFile = this.playerColor === 'white' ? 0 : 7;
        const endFile = this.playerColor === 'white' ? 7 : 0;
        const fileStep = this.playerColor === 'white' ? 1 : -1;
        
        for (let rank = startRank; this.playerColor === 'white' ? rank >= endRank : rank <= endRank; rank += rankStep) {
            for (let file = startFile; this.playerColor === 'white' ? file <= endFile : file >= endFile; file += fileStep) {
                const square = document.createElement('div');
                const squareName = String.fromCharCode(97 + file) + rank; // a-h + 1-8
                
                square.classList.add('square');
                square.classList.add((rank + file) % 2 === 0 ? 'dark' : 'light');
                square.dataset.square = squareName;
                
                square.addEventListener('click', (e) => this.handleSquareClick(e));
                
                this.boardElement.appendChild(square);
            }
        }
    }
    
    setPlayerColor(color) {
        this.playerColor = color;
        this.createBoard(); // Recreate board with new orientation
        this.renderBoard(); // Re-render pieces
    }
    
    setupBoard(boardState) {
        this.board = boardState;
        this.renderBoard();
    }
    
    renderBoard() {
        // Clear all squares
        const squares = this.boardElement.querySelectorAll('.square');
        squares.forEach(square => {
            square.innerHTML = '';
            square.classList.remove('selected', 'possible-move', 'highlighted');
        });
        
        // Place pieces
        Object.entries(this.board).forEach(([square, piece]) => {
            const squareElement = this.boardElement.querySelector(`[data-square="${square}"]`);
            if (squareElement && piece) {
                const imageSrc = this.pieceImages[piece.color][piece.piece];
                squareElement.innerHTML = `<img class="piece" src="${imageSrc}" alt="${piece.color} ${piece.piece}" draggable="false">`;
            }
        });
        
        // Update check indicators
        this.updateCheckIndicator();
    }
    
    handleSquareClick(event) {
        if (!this.interactive) return;
        
        const square = event.currentTarget;
        const squareName = square.dataset.square;
        
        if (this.selectedSquare) {
            // Try to make a move
            const from = this.selectedSquare.dataset.square;
            const to = squareName;
            
            if (from === to) {
                // Clicking same square - deselect
                this.deselectSquare();
                return;
            }
            
            // Check if this is a legal move
            if (this.isLegalMove(from, to)) {
                // Attempt the move
                if (window.game && window.game.makeMove(from, to)) {
                    this.deselectSquare();
                } else {
                    // Move failed on server, try selecting new piece
                    this.deselectSquare();
                    if (this.canSelectSquare(square)) {
                        this.selectSquare(square);
                    }
                }
            } else {
                // Not a legal move, try selecting new piece instead
                this.deselectSquare();
                if (this.canSelectSquare(square)) {
                    this.selectSquare(square);
                }
            }
        } else {
            // Select a piece
            if (this.canSelectSquare(square)) {
                this.selectSquare(square);
            }
        }
    }
    
    isLegalMove(from, to) {
        const piece = this.board[from];
        if (!piece) return false;
        
        // Get legal moves (which excludes moves that leave king in check)
        const legalMoves = this.getLegalMoves(from, piece);
        
        // Check if the destination is in the list of legal moves
        return legalMoves.includes(to);
    }
    
    isCastlingMove(from, to) {
        const piece = this.board[from];
        if (!piece || piece.piece !== 'k') return false;
        
        const rank = parseInt(from[1]);
        const startRank = piece.color === 'white' ? 1 : 8;
        
        return rank === startRank && (to === 'c' + rank || to === 'g' + rank);
    }
    
    executeCastling(from, to) {
        const piece = this.board[from];
        const color = piece.color;
        const rank = parseInt(to[1]);
        
        if (to[0] === 'g') {
            // Kingside castling
            // Find the kingside rook
            let kingsideRook = null;
            for (let f = 7; f >= 0; f--) {
                const square = String.fromCharCode(97 + f) + rank;
                const rookPiece = this.board[square];
                if (rookPiece && rookPiece.piece === 'r' && rookPiece.color === color) {
                    kingsideRook = square;
                    break;
                }
            }
            
            if (kingsideRook) {
                // Move king to g-file, rook to f-file
                this.board['g' + rank] = piece;
                this.board['f' + rank] = this.board[kingsideRook];
                delete this.board[from];
                delete this.board[kingsideRook];
            }
        } else if (to[0] === 'c') {
            // Queenside castling
            // Find the queenside rook
            let queensideRook = null;
            for (let f = 0; f < 8; f++) {
                const square = String.fromCharCode(97 + f) + rank;
                const rookPiece = this.board[square];
                if (rookPiece && rookPiece.piece === 'r' && rookPiece.color === color) {
                    queensideRook = square;
                    break;
                }
            }
            
            if (queensideRook) {
                // Move king to c-file, rook to d-file
                this.board['c' + rank] = piece;
                this.board['d' + rank] = this.board[queensideRook];
                delete this.board[from];
                delete this.board[queensideRook];
            }
        }
    }
    
    isEnPassantMove(from, to) {
        const piece = this.board[from];
        if (!piece || piece.piece !== 'p') return false;
        
        return this.enPassantTarget === to;
    }
    
    executeEnPassant(from, to) {
        const piece = this.board[from];
        const direction = piece.color === 'white' ? -1 : 1;
        const capturedPawnSquare = to[0] + (parseInt(to[1]) + direction);
        
        // Move the pawn
        this.board[to] = piece;
        delete this.board[from];
        
        // Remove the captured pawn
        delete this.board[capturedPawnSquare];
    }
    
    updateEnPassantTarget(from, to, piece) {
        // Clear previous en passant target
        this.enPassantTarget = null;
        
        // Check if a pawn moved two squares
        if (piece.piece === 'p') {
            const fromRank = parseInt(from[1]);
            const toRank = parseInt(to[1]);
            
            if (Math.abs(toRank - fromRank) === 2) {
                // Set en passant target square (the square the pawn "passed over")
                const targetRank = (fromRank + toRank) / 2;
                this.enPassantTarget = to[0] + targetRank;
            }
        }
    }
    
    canSelectSquare(square) {
        const squareName = square.dataset.square;
        const piece = this.board[squareName];
        
        if (!piece) return false;
        
        // Only allow selecting pieces of your own color
        return piece.color === this.playerColor;
    }
    
    selectSquare(square) {
        this.deselectSquare(); // Clear previous selection
        
        this.selectedSquare = square;
        square.classList.add('selected');
        
        // Highlight possible moves (basic implementation)
        this.highlightPossibleMoves(square.dataset.square);
    }
    
    deselectSquare() {
        if (this.selectedSquare) {
            this.selectedSquare.classList.remove('selected');
            this.selectedSquare = null;
        }
        
        // Remove all move highlights
        const squares = this.boardElement.querySelectorAll('.square');
        squares.forEach(square => {
            square.classList.remove('possible-move', 'highlighted', 'has-piece');
        });
    }
    
    highlightPossibleMoves(squareName) {
        const piece = this.board[squareName];
        if (!piece) return;
        
        // Get legal moves (excluding those that leave king in check)
        const legalMoves = this.getLegalMoves(squareName, piece);
        
        legalMoves.forEach(moveTo => {
            const targetSquare = this.boardElement.querySelector(`[data-square="${moveTo}"]`);
            if (targetSquare) {
                targetSquare.classList.add('possible-move');
                // Add different styling for captures vs empty squares
                if (this.board[moveTo]) {
                    targetSquare.classList.add('has-piece');
                }
            }
        });
    }
    
    calculatePossibleMoves(from, piece, skipCastling = false) {
        const moves = [];
        const file = from.charCodeAt(0) - 97; // a=0, b=1, etc.
        const rank = parseInt(from[1]);
        
        switch (piece.piece) {
            case 'p': // Pawn
                this.calculatePawnMoves(moves, file, rank, piece.color);
                break;
            case 'r': // Rook
                this.calculateRookMoves(moves, file, rank, piece.color);
                break;
            case 'n': // Knight
                this.calculateKnightMoves(moves, file, rank, piece.color);
                break;
            case 'b': // Bishop
                this.calculateBishopMoves(moves, file, rank, piece.color);
                break;
            case 'q': // Queen
                this.calculateQueenMoves(moves, file, rank, piece.color);
                break;
            case 'k': // King
                this.calculateKingMoves(moves, file, rank, piece.color, skipCastling);
                break;
        }
        
        return moves;
    }
    
    calculatePawnMoves(moves, file, rank, color) {
        const direction = color === 'white' ? 1 : -1;
        const startRank = color === 'white' ? 2 : 7;
        
        // Forward move
        const oneForward = String.fromCharCode(97 + file) + (rank + direction);
        if (this.isValidSquare(file, rank + direction) && !this.board[oneForward]) {
            moves.push(oneForward);
            
            // Two squares forward from starting position
            if (rank === startRank) {
                const twoForward = String.fromCharCode(97 + file) + (rank + 2 * direction);
                if (!this.board[twoForward]) {
                    moves.push(twoForward);
                }
            }
        }
        
        // Captures (including en passant)
        [-1, 1].forEach(fileOffset => {
            const newFile = file + fileOffset;
            const newRank = rank + direction;
            if (this.isValidSquare(newFile, newRank)) {
                const square = String.fromCharCode(97 + newFile) + newRank;
                
                // Regular capture
                if (this.board[square] && this.board[square].color !== color) {
                    moves.push(square);
                }
                
                // En passant capture
                if (this.enPassantTarget === square) {
                    moves.push(square);
                }
            }
        });
    }
    
    calculateRookMoves(moves, file, rank, color) {
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        this.calculateSlidingMoves(moves, file, rank, color, directions);
    }
    
    calculateBishopMoves(moves, file, rank, color) {
        const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        this.calculateSlidingMoves(moves, file, rank, color, directions);
    }
    
    calculateQueenMoves(moves, file, rank, color) {
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        this.calculateSlidingMoves(moves, file, rank, color, directions);
    }
    
    calculateSlidingMoves(moves, file, rank, color, directions) {
        directions.forEach(([fileDir, rankDir]) => {
            for (let i = 1; i < 8; i++) {
                const newFile = file + i * fileDir;
                const newRank = rank + i * rankDir;
                
                if (!this.isValidSquare(newFile, newRank)) break;
                
                const square = String.fromCharCode(97 + newFile) + newRank;
                
                if (this.board[square]) {
                    if (this.board[square].color !== color) {
                        moves.push(square);
                    }
                    break; // Blocked by piece
                }
                
                moves.push(square);
            }
        });
    }
    
    calculateKnightMoves(moves, file, rank, color) {
        const knightMoves = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        
        knightMoves.forEach(([fileOffset, rankOffset]) => {
            const newFile = file + fileOffset;
            const newRank = rank + rankOffset;
            
            if (this.isValidSquare(newFile, newRank)) {
                const square = String.fromCharCode(97 + newFile) + newRank;
                if (!this.board[square] || this.board[square].color !== color) {
                    moves.push(square);
                }
            }
        });
    }
    
    calculateKingMoves(moves, file, rank, color, skipCastling = false) {
        const kingMoves = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ];
        
        kingMoves.forEach(([fileOffset, rankOffset]) => {
            const newFile = file + fileOffset;
            const newRank = rank + rankOffset;
            
            if (this.isValidSquare(newFile, newRank)) {
                const square = String.fromCharCode(97 + newFile) + newRank;
                if (!this.board[square] || this.board[square].color !== color) {
                    moves.push(square);
                }
            }
        });
        
        // Add castling moves only if not checking for attacks (to prevent recursion)
        if (!skipCastling) {
            this.addCastlingMoves(moves, file, rank, color);
        }
    }
    
    addCastlingMoves(moves, file, rank, color) {
        // Only check castling from king's starting rank
        const startRank = color === 'white' ? 1 : 8;
        if (rank !== startRank) return;
        
        const kingSquare = String.fromCharCode(97 + file) + rank;
        
        // Check if king has moved (in a real implementation, we'd track this)
        // For now, assume pieces on starting squares haven't moved
        if (!this.hasKingMoved(color) && !this.isKingInCheck(color)) {
            // Kingside castling (final positions: King on g-file, Rook on f-file)
            if (this.canCastleKingside(color)) {
                const kingsideTarget = 'g' + rank;
                moves.push(kingsideTarget);
            }
            
            // Queenside castling (final positions: King on c-file, Rook on d-file)
            if (this.canCastleQueenside(color)) {
                const queensideTarget = 'c' + rank;
                moves.push(queensideTarget);
            }
        }
    }
    
    hasKingMoved(color) {
        // Simple implementation: assume king hasn't moved if it's on the back rank
        // In a full implementation, we'd track piece movements
        const startRank = color === 'white' ? 1 : 8;
        const kingSquare = this.findKing(color);
        return kingSquare ? parseInt(kingSquare[1]) !== startRank : true;
    }
    
    canCastleKingside(color) {
        const rank = color === 'white' ? 1 : 8;
        const fSquare = 'f' + rank;
        const gSquare = 'g' + rank;
        const hSquare = 'h' + rank;
        
        // Find the rook on the kingside (rightmost rook)
        let kingsideRook = null;
        for (let f = 7; f >= 0; f--) {
            const square = String.fromCharCode(97 + f) + rank;
            const piece = this.board[square];
            if (piece && piece.piece === 'r' && piece.color === color) {
                kingsideRook = square;
                break;
            }
        }
        
        if (!kingsideRook) return false;
        
        // Check if final positions are clear (f and g files)
        if (this.board[fSquare] || this.board[gSquare]) return false;
        
        // Check if squares between king and rook are clear
        const kingSquare = this.findKing(color);
        if (!kingSquare) return false;
        
        const kingFile = kingSquare.charCodeAt(0) - 97;
        const rookFile = kingsideRook.charCodeAt(0) - 97;
        
        for (let f = Math.min(kingFile + 1, rookFile); f < Math.max(kingFile, rookFile); f++) {
            const square = String.fromCharCode(97 + f) + rank;
            if (square !== kingSquare && square !== kingsideRook && this.board[square]) {
                return false;
            }
        }
        
        // Check if king passes through check
        return !this.wouldPassThroughCheck(kingSquare, gSquare, color);
    }
    
    canCastleQueenside(color) {
        const rank = color === 'white' ? 1 : 8;
        const cSquare = 'c' + rank;
        const dSquare = 'd' + rank;
        
        // Find the rook on the queenside (leftmost rook)
        let queensideRook = null;
        for (let f = 0; f < 8; f++) {
            const square = String.fromCharCode(97 + f) + rank;
            const piece = this.board[square];
            if (piece && piece.piece === 'r' && piece.color === color) {
                queensideRook = square;
                break;
            }
        }
        
        if (!queensideRook) return false;
        
        // Check if final positions are clear (c and d files)
        if (this.board[cSquare] || this.board[dSquare]) return false;
        
        // Check if squares between king and rook are clear
        const kingSquare = this.findKing(color);
        if (!kingSquare) return false;
        
        const kingFile = kingSquare.charCodeAt(0) - 97;
        const rookFile = queensideRook.charCodeAt(0) - 97;
        
        for (let f = Math.min(kingFile, rookFile) + 1; f < Math.max(kingFile, rookFile); f++) {
            const square = String.fromCharCode(97 + f) + rank;
            if (square !== kingSquare && square !== queensideRook && this.board[square]) {
                return false;
            }
        }
        
        // Check if king passes through check
        return !this.wouldPassThroughCheck(kingSquare, cSquare, color);
    }
    
    wouldPassThroughCheck(from, to, color) {
        const fromFile = from.charCodeAt(0) - 97;
        const toFile = to.charCodeAt(0) - 97;
        const rank = parseInt(from[1]);
        
        // Check each square the king passes through
        const start = Math.min(fromFile, toFile);
        const end = Math.max(fromFile, toFile);
        
        for (let f = start; f <= end; f++) {
            const square = String.fromCharCode(97 + f) + rank;
            if (this.isSquareUnderAttack(square, color)) {
                return true;
            }
        }
        
        return false;
    }
    
    isValidSquare(file, rank) {
        return file >= 0 && file < 8 && rank >= 1 && rank <= 8;
    }
    
    // Find the king of a given color
    findKing(color) {
        for (const [square, piece] of Object.entries(this.board)) {
            if (piece && piece.piece === 'k' && piece.color === color) {
                return square;
            }
        }
        return null;
    }
    
    // Check if a king is in check
    isKingInCheck(color) {
        const kingSquare = this.findKing(color);
        if (!kingSquare) return false;
        
        return this.isSquareUnderAttack(kingSquare, color);
    }
    
    // Check if a square is under attack by the opposite color
    isSquareUnderAttack(square, defendingColor) {
        const attackingColor = defendingColor === 'white' ? 'black' : 'white';
        
        // Check all pieces of the attacking color
        for (const [fromSquare, piece] of Object.entries(this.board)) {
            if (piece && piece.color === attackingColor) {
                // For attack calculation, use basic moves without castling to avoid recursion
                const possibleMoves = this.calculatePossibleMoves(fromSquare, piece, true);
                if (possibleMoves.includes(square)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // Check if a move would leave the king in check
    wouldMoveLeaveKingInCheck(from, to, color) {
        // Create a temporary board state
        const originalPiece = this.board[to];
        const movingPiece = this.board[from];
        
        // Make the move temporarily
        this.board[to] = movingPiece;
        delete this.board[from];
        
        // Check if king is in check
        const kingInCheck = this.isKingInCheck(color);
        
        // Restore the original board state
        this.board[from] = movingPiece;
        if (originalPiece) {
            this.board[to] = originalPiece;
        } else {
            delete this.board[to];
        }
        
        return kingInCheck;
    }
    
    // Get all legal moves (excluding those that leave king in check)
    getLegalMoves(from, piece) {
        const possibleMoves = this.calculatePossibleMoves(from, piece);
        const legalMoves = [];
        
        for (const to of possibleMoves) {
            if (!this.wouldMoveLeaveKingInCheck(from, to, piece.color)) {
                legalMoves.push(to);
            }
        }
        
        return legalMoves;
    }
    
    // Update the visual check indicator
    updateCheckIndicator() {
        // Remove previous check indicators
        const squares = this.boardElement.querySelectorAll('.square');
        squares.forEach(square => {
            square.classList.remove('king-in-check');
        });
        
        // Check if either king is in check
        const whiteKingSquare = this.findKing('white');
        const blackKingSquare = this.findKing('black');
        
        if (whiteKingSquare && this.isKingInCheck('white')) {
            const kingElement = this.boardElement.querySelector(`[data-square="${whiteKingSquare}"]`);
            if (kingElement) {
                kingElement.classList.add('king-in-check');
            }
        }
        
        if (blackKingSquare && this.isKingInCheck('black')) {
            const kingElement = this.boardElement.querySelector(`[data-square="${blackKingSquare}"]`);
            if (kingElement) {
                kingElement.classList.add('king-in-check');
            }
        }
    }
    
    setInteractive(interactive) {
        this.interactive = interactive;
        if (!interactive) {
            this.deselectSquare();
        }
    }
}