export class SocketManager {
    constructor() {
        this.socket = io();
        this.listeners = new Map();
    }
    
    emit(event, data) {
        this.socket.emit(event, data);
    }
    
    on(event, callback) {
        this.socket.on(event, callback);
        
        // Store listeners for potential cleanup
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    off(event, callback) {
        this.socket.off(event, callback);
        
        // Remove from stored listeners
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    disconnect() {
        this.socket.disconnect();
    }
}