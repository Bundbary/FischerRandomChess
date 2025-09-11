class ChessLobby {
    constructor() {
        this.socket = io();
        this.username = '';
        this.players = new Map();
        this.challenges = new Map();
        this.activeGames = new Map();
        
        // Fun username generator lists
        this.adjectives = [
            'Fluffy', 'Soggy', 'Bouncy', 'Crispy', 'Sneaky', 'Wobbly', 'Sparkly', 'Grumpy',
            'Sleepy', 'Dizzy', 'Ticklish', 'Giggly', 'Fuzzy', 'Squishy', 'Bubbly', 'Clumsy',
            'Jolly', 'Quirky', 'Zany', 'Wacky', 'Silly', 'Goofy', 'Nutty', 'Loopy',
            'Cranky', 'Peppy', 'Zippy', 'Snappy', 'Funky', 'Chunky', 'Bumpy', 'Lumpy',
            'Frosty', 'Toasty', 'Misty', 'Dusty', 'Rusty', 'Crusty', 'Musty', 'Trusty',
            'Mighty', 'Tiny', 'Shiny', 'Spiny', 'Whiny', 'Brainy', 'Rainy', 'Zesty'
        ];
        
        this.nouns = [
            'Goober', 'Barnacle', 'Pickle', 'Noodle', 'Waffle', 'Muffin', 'Bagel', 'Pretzel',
            'Banana', 'Coconut', 'Walnut', 'Peanut', 'Donut', 'Biscuit', 'Cookie', 'Cracker',
            'Pancake', 'Cupcake', 'Cheesecake', 'Milkshake', 'Snowflake', 'Pancake', 'Fruitcake', 'Beefcake',
            'Turtle', 'Hamster', 'Giraffe', 'Penguin', 'Platypus', 'Octopus', 'Walrus', 'Narwhal',
            'Llama', 'Alpaca', 'Koala', 'Panda', 'Sloth', 'Otter', 'Beaver', 'Badger',
            'Squirrel', 'Chipmunk', 'Hedgehog', 'Porcupine', 'Armadillo', 'Iguana', 'Gecko', 'Newt'
        ];
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupSocketListeners();
        this.loadPanelStates();
    }
    
    setupEventListeners() {
        // Username
        document.getElementById('set-username-btn').addEventListener('click', () => {
            this.setUsername();
        });
        
        document.getElementById('username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.setUsername();
            }
        });
        
        document.getElementById('anonymous-btn').addEventListener('click', () => {
            this.generateAnonymousUsername();
        });
        
        // Challenges
        document.getElementById('create-challenge-btn').addEventListener('click', () => {
            this.showChallengeModal();
        });
        
        document.getElementById('quick-play-btn').addEventListener('click', () => {
            this.quickPlay();
        });
        
        // Challenge Modal
        document.getElementById('close-challenge-modal').addEventListener('click', () => {
            this.hideChallengeModal();
        });
        
        document.getElementById('confirm-challenge-btn').addEventListener('click', () => {
            this.createChallenge();
        });
        
        document.getElementById('cancel-challenge-btn').addEventListener('click', () => {
            this.hideChallengeModal();
        });
        
        // Challenge type radio buttons
        document.querySelectorAll('input[name="challenge-type"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const selectPlayer = document.getElementById('challenge-player-select');
                selectPlayer.disabled = radio.value === 'anyone';
            });
        });
        
        // Chat
        document.getElementById('send-chat-btn').addEventListener('click', () => {
            this.sendChatMessage();
        });
        
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // Help
        document.getElementById('help-btn').addEventListener('click', () => {
            this.showHelp();
        });
        
        document.getElementById('close-help').addEventListener('click', () => {
            this.hideHelp();
        });
        
        // Modal backdrop clicks
        document.getElementById('challenge-modal').addEventListener('click', (e) => {
            if (e.target.id === 'challenge-modal') {
                this.hideChallengeModal();
            }
        });
        
        document.getElementById('help-modal').addEventListener('click', (e) => {
            if (e.target.id === 'help-modal') {
                this.hideHelp();
            }
        });
        
        // Panel toggles
        document.querySelectorAll('.panel-header').forEach(header => {
            header.addEventListener('click', () => {
                this.togglePanel(header.dataset.panel);
            });
        });
        
        // ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
            }
        });
        
        // Warn before leaving if user is signed in
        window.addEventListener('beforeunload', (e) => {
            if (this.username) {
                e.preventDefault();
                e.returnValue = 'You are currently signed into the lobby. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }
    
    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to lobby');
        });
        
        this.socket.on('players-update', (players) => {
            this.updatePlayersList(players);
        });
        
        this.socket.on('challenges-update', (challenges) => {
            this.updateChallengesList(challenges);
        });
        
        this.socket.on('active-games-update', (games) => {
            this.updateActiveGamesList(games);
        });
        
        this.socket.on('chat-message', (data) => {
            this.addChatMessage(data);
        });
        
        this.socket.on('player-count', (count) => {
            this.updatePlayerCount(count);
        });
        
        this.socket.on('challenge-accepted', (data) => {
            // Open game in new window
            window.open(`/?game=${data.gameId}`, '_blank');
        });
        
        this.socket.on('error', (message) => {
            this.showError(message);
        });
    }
    
    setUsername() {
        const usernameInput = document.getElementById('username');
        const username = usernameInput.value.trim();
        
        if (username.length < 2) {
            this.showError('Username must be at least 2 characters');
            return;
        }
        
        if (username.length > 20) {
            this.showError('Username must be less than 20 characters');
            return;
        }
        
        this.username = username;
        this.socket.emit('set-username', username);
        
        // Update UI
        usernameInput.disabled = true;
        document.getElementById('set-username-btn').textContent = 'Change';
        document.getElementById('set-username-btn').onclick = () => {
            usernameInput.disabled = false;
            usernameInput.focus();
            document.getElementById('set-username-btn').textContent = 'Set Name';
            document.getElementById('set-username-btn').onclick = () => this.setUsername();
        };
    }
    
    generateAnonymousUsername() {
        const randomAdjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
        const randomNoun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
        const anonymousName = `${randomAdjective} ${randomNoun}`;
        
        // Set the generated name in the input and trigger username setting
        const usernameInput = document.getElementById('username');
        usernameInput.value = anonymousName;
        this.setUsername();
    }
    
    showChallengeModal() {
        if (!this.username) {
            this.showError('Please set your username first');
            return;
        }
        
        // Update player select options
        const select = document.getElementById('challenge-player-select');
        select.innerHTML = '<option value="">Select player...</option>';
        
        this.players.forEach((player, socketId) => {
            if (player.username !== this.username) {
                const option = document.createElement('option');
                option.value = socketId;
                option.textContent = player.username;
                select.appendChild(option);
            }
        });
        
        document.getElementById('challenge-modal').classList.remove('hidden');
    }
    
    hideChallengeModal() {
        document.getElementById('challenge-modal').classList.add('hidden');
        // Reset form
        document.querySelector('input[name="challenge-type"][value="anyone"]').checked = true;
        document.getElementById('challenge-player-select').disabled = true;
    }
    
    createChallenge() {
        const challengeType = document.querySelector('input[name="challenge-type"]:checked').value;
        const targetPlayer = challengeType === 'specific' ? 
            document.getElementById('challenge-player-select').value : null;
        
        if (challengeType === 'specific' && !targetPlayer) {
            this.showError('Please select a player to challenge');
            return;
        }
        
        this.socket.emit('create-challenge', { type: challengeType, targetPlayer });
        this.hideChallengeModal();
    }
    
    quickPlay() {
        if (!this.username) {
            this.showError('Please set your username first');
            return;
        }
        
        this.socket.emit('quick-play');
    }
    
    acceptChallenge(challengeId) {
        this.socket.emit('accept-challenge', challengeId);
    }
    
    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        if (!this.username) {
            this.showError('Please set your username first');
            return;
        }
        
        this.socket.emit('chat-message', message);
        input.value = '';
    }
    
    addChatMessage(data) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        
        if (data.type === 'system') {
            messageDiv.className = 'chat-message system';
            messageDiv.textContent = data.message;
        } else {
            messageDiv.className = `chat-message ${data.username === this.username ? 'user' : 'other'}`;
            
            if (data.username !== this.username) {
                const usernameDiv = document.createElement('div');
                usernameDiv.className = 'chat-username';
                usernameDiv.textContent = data.username;
                messageDiv.appendChild(usernameDiv);
            }
            
            const contentDiv = document.createElement('div');
            contentDiv.textContent = data.message;
            messageDiv.appendChild(contentDiv);
        }
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    updatePlayersList(players) {
        this.players = new Map(Object.entries(players));
        const playersList = document.getElementById('players-list');
        
        if (this.players.size === 0) {
            playersList.innerHTML = '<div class="no-players">No players online</div>';
            return;
        }
        
        playersList.innerHTML = '';
        this.players.forEach((player, socketId) => {
            if (!player.username) return;
            
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            
            const infoDiv = document.createElement('div');
            const nameDiv = document.createElement('div');
            nameDiv.className = 'player-name';
            nameDiv.textContent = player.username;
            
            const statusDiv = document.createElement('div');
            statusDiv.className = 'player-status';
            statusDiv.textContent = player.status || 'Available';
            
            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(statusDiv);
            
            const actionsDiv = document.createElement('div');
            if (player.username !== this.username && this.username) {
                const challengeBtn = document.createElement('button');
                challengeBtn.className = 'challenge-btn';
                challengeBtn.textContent = 'Challenge';
                challengeBtn.onclick = () => this.challengePlayer(socketId, player.username);
                actionsDiv.appendChild(challengeBtn);
            }
            
            playerDiv.appendChild(infoDiv);
            playerDiv.appendChild(actionsDiv);
            playersList.appendChild(playerDiv);
        });
    }
    
    updateChallengesList(challenges) {
        this.challenges = new Map(Object.entries(challenges));
        const challengesList = document.getElementById('challenges-list');
        
        if (this.challenges.size === 0) {
            challengesList.innerHTML = '<div class="no-challenges">No open challenges</div>';
            return;
        }
        
        challengesList.innerHTML = '';
        this.challenges.forEach((challenge, challengeId) => {
            // Don't show our own challenges
            if (challenge.challenger === this.username) return;
            
            // Don't show specific challenges not meant for us
            if (challenge.type === 'specific' && challenge.targetPlayer !== this.socket.id) return;
            
            const challengeDiv = document.createElement('div');
            challengeDiv.className = 'challenge-item';
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'challenge-info';
            
            const titleDiv = document.createElement('h4');
            titleDiv.textContent = `${challenge.challenger}'s Challenge`;
            
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'challenge-details';
            detailsDiv.textContent = challenge.type === 'anyone' ? 'Open to anyone' : 'Private challenge';
            
            infoDiv.appendChild(titleDiv);
            infoDiv.appendChild(detailsDiv);
            
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'accept-btn';
            acceptBtn.textContent = 'Accept';
            acceptBtn.onclick = () => this.acceptChallenge(challengeId);
            
            challengeDiv.appendChild(infoDiv);
            challengeDiv.appendChild(acceptBtn);
            challengesList.appendChild(challengeDiv);
        });
    }
    
    updateActiveGamesList(games) {
        this.activeGames = new Map(Object.entries(games));
        const gamesList = document.getElementById('active-games-list');
        
        if (this.activeGames.size === 0) {
            gamesList.innerHTML = '<div class="no-games">No active games</div>';
            return;
        }
        
        gamesList.innerHTML = '';
        this.activeGames.forEach((game, gameId) => {
            const gameDiv = document.createElement('div');
            gameDiv.className = 'game-item';
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'game-info';
            
            const titleDiv = document.createElement('h4');
            titleDiv.textContent = `Game ${gameId.slice(0, 8)}`;
            
            const playersDiv = document.createElement('div');
            playersDiv.className = 'game-players';
            const players = Object.values(game.players);
            playersDiv.textContent = players.length >= 2 ? 
                `${players[0].name} vs ${players[1].name}` : 
                `${players[0]?.name || 'Player'} waiting...`;
            
            infoDiv.appendChild(titleDiv);
            infoDiv.appendChild(playersDiv);
            
            const spectateBtn = document.createElement('button');
            spectateBtn.className = 'spectate-btn';
            spectateBtn.textContent = 'Watch';
            spectateBtn.onclick = () => window.open(`/?game=${gameId}&spectate=true`, '_blank');
            
            gameDiv.appendChild(infoDiv);
            gameDiv.appendChild(spectateBtn);
            gamesList.appendChild(gameDiv);
        });
    }
    
    challengePlayer(socketId, username) {
        this.socket.emit('create-challenge', { 
            type: 'specific', 
            targetPlayer: socketId 
        });
        
        this.addChatMessage({
            type: 'system',
            message: `Challenge sent to ${username}!`
        });
    }
    
    updatePlayerCount(count) {
        document.getElementById('player-count').textContent = `${count} player${count !== 1 ? 's' : ''} online`;
    }
    
    showError(message) {
        // Add error message to chat
        this.addChatMessage({
            type: 'system',
            message: `Error: ${message}`
        });
    }
    
    showHelp() {
        document.getElementById('help-modal').classList.remove('hidden');
    }
    
    hideHelp() {
        document.getElementById('help-modal').classList.add('hidden');
    }
    
    hideAllModals() {
        this.hideHelp();
        this.hideChallengeModal();
    }
    
    togglePanel(panelName) {
        const content = document.getElementById(panelName + '-content');
        const toggle = document.querySelector(`[data-panel="${panelName}"] .panel-toggle`);
        
        if (content.classList.contains('collapsed')) {
            // Expand panel
            content.classList.remove('collapsed');
            toggle.textContent = '−';
        } else {
            // Collapse panel
            content.classList.add('collapsed');
            toggle.textContent = '+';
        }
        
        // Save panel state
        localStorage.setItem(`chess-lobby-panel-${panelName}`, content.classList.contains('collapsed') ? 'collapsed' : 'expanded');
    }
    
    loadPanelStates() {
        ['players', 'challenges', 'chat', 'games'].forEach(panelName => {
            const state = localStorage.getItem(`chess-lobby-panel-${panelName}`);
            const content = document.getElementById(panelName + '-content');
            const toggle = document.querySelector(`[data-panel="${panelName}"] .panel-toggle`);
            
            if (state === 'collapsed') {
                content.classList.add('collapsed');
                toggle.textContent = '+';
            } else {
                toggle.textContent = '−';
            }
        });
    }
}

// Initialize lobby when page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChessLobby();
});