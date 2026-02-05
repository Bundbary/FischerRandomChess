// AudioManager - Handles game sound effects
export class AudioManager {
    constructor() {
        this.sounds = {};        // Loaded Audio objects
        this.soundPack = null;   // Current sound pack config
        this.volume = 0.5;       // Volume 0-1
        this.enabled = true;     // Master enable/disable

        // Load saved preferences
        this.loadPreferences();
    }

    loadPreferences() {
        try {
            const saved = localStorage.getItem('chess-audio-prefs');
            if (saved) {
                const prefs = JSON.parse(saved);
                this.volume = prefs.volume ?? 0.5;
                this.enabled = prefs.enabled ?? true;
            }
        } catch (e) {
            console.warn('Failed to load audio preferences:', e);
        }
    }

    savePreferences() {
        try {
            localStorage.setItem('chess-audio-prefs', JSON.stringify({
                volume: this.volume,
                enabled: this.enabled,
                packId: this.soundPack?.id
            }));
        } catch (e) {
            console.warn('Failed to save audio preferences:', e);
        }
    }

    // Set the active sound pack
    setSoundPack(pack) {
        this.soundPack = pack;
        this.sounds = {}; // Clear cached sounds

        if (!pack || pack.id === 'none' || !pack.sounds) {
            return;
        }

        // Preload all sounds in the pack
        for (const [name, path] of Object.entries(pack.sounds)) {
            this.preloadSound(name, path);
        }

        this.savePreferences();
    }

    // Preload a single sound
    preloadSound(name, path) {
        const audio = new Audio(path);
        audio.preload = 'auto';
        audio.volume = this.volume;
        this.sounds[name] = audio;
    }

    // Play a sound by name
    play(name) {
        if (!this.enabled || !this.soundPack || this.soundPack.id === 'none') {
            return;
        }

        const sound = this.sounds[name];
        if (!sound) {
            // Sound not in this pack, that's OK
            return;
        }

        // Clone the audio to allow overlapping plays
        const clone = sound.cloneNode();
        clone.volume = this.volume;
        clone.play().catch(e => {
            // Autoplay might be blocked until user interaction
            // This is normal, just ignore
        });
    }

    // Set volume (0-1)
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));

        // Update volume on all cached sounds
        for (const sound of Object.values(this.sounds)) {
            sound.volume = this.volume;
        }

        this.savePreferences();
    }

    // Enable/disable sounds
    setEnabled(enabled) {
        this.enabled = enabled;
        this.savePreferences();
    }

    // Get the saved pack ID (for restoring selection on load)
    getSavedPackId() {
        try {
            const saved = localStorage.getItem('chess-audio-prefs');
            if (saved) {
                return JSON.parse(saved).packId;
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    // Play appropriate sound for a move
    playMoveSound(moveData) {
        if (moveData.isCheckmate || moveData.isStalemate) {
            this.play('game-end');
        } else if (moveData.isCheck) {
            this.play('check');
        } else if (moveData.isCastle) {
            this.play('castle');
        } else if (moveData.captured) {
            this.play('capture');
        } else {
            this.play('move');
        }
    }
}
