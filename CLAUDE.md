# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time multiplayer Fischer Random Chess (Chess960) web application built with Node.js and Socket.IO. It features all 960 possible starting positions, complete chess rule enforcement, and a modern Chess.com-style interface.

## Architecture

### Backend Structure
- **Main Server**: `server.js` - Express.js server with Socket.IO for real-time multiplayer communication
- **Game Logic**: Server-side chess engine with complete move validation, check detection, and special moves
- **In-Memory Storage**: Games stored in Map for real-time performance (no database persistence)

### Frontend Structure
- **Main Entry Point**: `index.html` - Modern HTML5 interface with responsive design
- **Core Game Controller**: `public/js/main.js` - Manages game state, UI interactions, and event handling
- **Chess Board Logic**: `public/js/board.js` - Handles board rendering, piece movement, and visual feedback
- **WebSocket Communication**: `public/js/socket.js` - Manages real-time server communication via Socket.IO
- **Styling**: `public/css/style.css` - Chess.com-inspired dark theme with responsive layout
- **Chess Pieces**: `public/pieces/` - High-quality SVG graphics (Cburnett set from Wikimedia)

### Key Features

1. **Fischer Random Generation**: Server generates all 960 possible starting positions with proper constraints:
   - King between rooks
   - Bishops on opposite colors
   - Mirrored black/white setup

2. **Real-time Multiplayer**: 
   - WebSocket-based communication via Socket.IO
   - Instant move synchronization
   - Player connection/disconnection handling
   - Game sharing via URLs

3. **Complete Chess Engine**:
   - Server-side move validation and rule enforcement
   - Check/checkmate detection with visual indicators
   - Special moves: castling (Fischer Random rules), en passant
   - Turn management and game state tracking

4. **Modern UI/UX**:
   - Board orientation (each player sees their pieces at bottom)
   - Visual move highlighting and piece selection
   - Responsive design for desktop and mobile
   - Built-in help system with comprehensive rules

## Development Commands

This is a Node.js project with Express and Socket.IO.

### Installation and Setup
```bash
npm install          # Install dependencies
```

### Running the Application
```bash
npm start           # Start production server on port 3000
npm run dev         # Start development server with nodemon
```

### Project Structure
```
/
├── server.js              # Main Node.js server with game logic
├── index.html             # Main application entry point
├── package.json           # Dependencies and scripts
├── public/                # Static files served by Express
│   ├── css/
│   │   └── style.css      # Game styling (Chess.com-inspired)
│   ├── js/               # Client-side JavaScript modules
│   │   ├── main.js        # Game controller and UI management
│   │   ├── board.js       # Chess board rendering and interaction
│   │   └── socket.js      # WebSocket communication layer
│   └── pieces/           # SVG chess piece graphics
└── README.md              # Detailed project documentation
```

## Technical Implementation

### Server-Side Game Logic
- Complete chess move validation including check detection
- Fischer Random position generation algorithm
- Special move handling (castling, en passant) adapted for Fischer Random
- Real-time game state synchronization via Socket.IO events

### Client-Side Architecture
- ES6 modules with no build step required
- Modular design: Game controller, Board renderer, Socket manager
- Event-driven architecture for UI interactions
- Responsive design with CSS Grid and Flexbox

### Communication Protocol
Key Socket.IO events:
- `create-game` / `game-created` - Game creation flow
- `join-game` / `game-joined` - Player joining flow  
- `make-move` / `move-made` - Move validation and broadcast
- `game-updated` - Game state synchronization
- Error handling for invalid moves and game states

## Development Notes

- Game state is stored in memory (resets on server restart)
- No database required for basic functionality
- Vanilla JavaScript frontend (no build tools needed)
- Server validates all moves to prevent cheating
- Board flips automatically based on player color
- Complete Fischer Random castling implementation