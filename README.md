# Fischer Random Chess (Chess960)

A real-time multiplayer implementation of Fischer Random Chess (also known as Chess960) with a modern web interface, featuring all 960 possible starting positions and complete chess rule enforcement.

## Features

- **Real-time Multiplayer**: Play against opponents from different locations using WebSocket connections
- **Fischer Random Setup**: All 960 possible starting positions with proper constraints (king between rooks, bishops on opposite colors)
- **Advanced Chess Rules**: Complete implementation including castling, en passant, and check detection
- **Board Orientation**: Each player sees their pieces on the bottom of the board
- **Chess.com-style UI**: Compact dark theme interface with professional SVG pieces
- **Move Validation**: Server-side validation prevents illegal moves and cheating
- **Game Sharing**: Share game links to invite opponents instantly
- **Visual Indicators**: Turn highlighting, check warnings, move possibilities, and player status
- **Help System**: Built-in comprehensive rules guide

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Play the game:**
   - Open http://localhost:3000 in your browser
   - Click "New Game" to create a game
   - Share the generated link with your opponent
   - Your opponent clicks the link or enters the game ID

## How to Play

### Basic Controls

- **New Game**: Creates a new Fischer Random game and generates a shareable link
- **Join Game**: Enter a game ID to join an existing game
- **Move Pieces**: Click a piece to select it, then click a highlighted square to move
- **Help**: Click the "?" button for detailed rules and instructions
- **Copy Link**: Copy the game URL to share with your opponent
- **Open Link**: Open the game link in a new window

### Fischer Random Chess Rules

Fischer Random Chess follows standard chess rules with these key differences:

- **Random Starting Position**: The back rank pieces are placed randomly, following these constraints:
  - King must be between the two rooks
  - Bishops must be on opposite colored squares
  - This creates exactly 960 possible starting positions

- **Castling**: Works similarly to regular chess but with different final positions:
  - King moves to c1/c8 (queenside) or g1/g8 (kingside)
  - Rook moves to d1/d8 (queenside) or f1/f8 (kingside) respectively
  - Same conditions apply: king and rook must not have moved, no pieces between, king not in check

- **All other rules**: En passant, pawn promotion, checkmate, and stalemate work exactly as in regular chess

### Game Features

- **Board Orientation**: Each player always sees their pieces on the bottom, regardless of color
- **Turn Indicators**: Clear visual indicators show whose turn it is
- **Check Detection**: Kings in check are highlighted with a red glow and pulsing animation
- **Move Validation**: Only legal moves are allowed; illegal moves are prevented
- **Move History**: Complete game notation is displayed in the side panel

## Technical Details

### Architecture

- **Frontend**: Vanilla JavaScript with ES6 modules (no build step required)
- **Backend**: Node.js with Express and Socket.IO
- **Real-time Communication**: WebSocket connections for instant move synchronization
- **Chess Pieces**: High-quality SVG graphics from Wikimedia Commons (Cburnett set)
- **Styling**: Chess.com-inspired dark theme with responsive design

### Project Structure

```
├── server.js              # Main server and game logic
├── index.html             # Game interface
├── package.json           # Dependencies and scripts
├── public/
│   ├── css/
│   │   └── style.css      # Game styling
│   ├── js/
│   │   ├── main.js        # Game controller
│   │   ├── board.js       # Chess board logic
│   │   └── socket.js      # WebSocket management
│   └── pieces/            # SVG chess piece graphics
└── README.md              # This file
```

### Key Implementation Features

- **Fischer Random Generation**: Algorithm ensures all 960 positions are possible with proper constraints
- **Board Flipping**: Each player sees their pieces on the bottom regardless of color assignment
- **Move Validation**: Both client and server validate moves to prevent cheating and ensure rule compliance
- **Special Moves**: Complete implementation of castling and en passant for Fischer Random positions
- **Check Detection**: Real-time check detection with visual indicators and move restrictions
- **Turn Management**: Synchronized turn management with clear visual feedback
- **Game State Sync**: Robust WebSocket communication maintains game state across all clients

## Development

The game uses vanilla JavaScript to avoid build complexity while maintaining modern ES6 module syntax. The server handles game state management and move validation, while the client focuses on user interface and real-time updates.

### Available Scripts

- `npm start` - Start the production server
- `npm install` - Install all dependencies

### Running Locally

The server automatically serves static files from the `public` directory and handles WebSocket connections on the same port (3000) for simplicity. Game state is stored in memory, so games will reset when the server restarts.

For production deployment, consider:
- Adding database persistence for game state
- Implementing reconnection handling
- Adding player authentication
- Scaling with Redis for multi-server deployments

## Contributing

Feel free to submit issues and enhancement requests! Areas for potential improvement:
- Pawn promotion interface
- Game result detection (checkmate/stalemate)
- Player rating system
- Game replay functionality
- Mobile touch improvements

## License

This project is open source and available under the MIT License.