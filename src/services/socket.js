import { io } from 'socket.io-client';

// CRITICAL: Get the socket URL based on current protocol/host
// When on HTTPS (via Caddy), use same origin including port (Vite proxies to backend)
// When on HTTP, connect directly to backend on port 3002
const getSocketConfig = () => {
  const currentHost = window.location.hostname;
  const currentPort = window.location.port;
  const currentProtocol = window.location.protocol;

  // If we're on HTTPS, use same origin (Vite proxy handles the backend)
  // If we're on HTTP, connect directly to the backend
  let socketUrl;
  if (currentProtocol === 'https:') {
    // Use same origin including port - Vite proxy will forward to backend
    socketUrl = currentPort
      ? `${currentProtocol}//${currentHost}:${currentPort}`
      : `${currentProtocol}//${currentHost}`;
    console.log('🔌 Socket config - HTTPS mode, using same origin:', socketUrl);
  } else {
    // HTTP mode - connect directly to backend
    socketUrl = `${currentProtocol}//${currentHost}:3002`;
    console.log('🔌 Socket config - HTTP mode, direct to backend:', socketUrl);
  }

  return {
    url: socketUrl,
    options: {
      autoConnect: false,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      path: '/socket.io', // Explicit path for Socket.io
    }
  };
};

// Create socket instance lazily
let _socket = null;

function getSocketInstance() {
  if (!_socket) {
    const config = getSocketConfig();
    console.log('🔧 Creating new socket instance with config:', config);
    _socket = io(config.url, config.options);

    _socket.on('connect', () => {
      console.log('✅ Socket connected:', _socket.id);
    });

    _socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
    });

    _socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
    });
  }
  return _socket;
}

// Export a getter that ensures socket is initialized
export const socket = {
  get connected() { return getSocketInstance().connected; },
  get id() { return getSocketInstance().id; },
  connect() { return getSocketInstance().connect(); },
  disconnect() { return getSocketInstance().disconnect(); },
  emit(event, ...args) { return getSocketInstance().emit(event, ...args); },
  on(event, fn) { return getSocketInstance().on(event, fn); },
  once(event, fn) { return getSocketInstance().once(event, fn); },
  off(event, fn) { return getSocketInstance().off(event, fn); },
  removeAllListeners(event) { return getSocketInstance().removeAllListeners(event); },
};

export const connectSocket = () => {
  const s = getSocketInstance();
  if (!s.connected) {
    console.log('🔌 Connecting to socket...');
    s.connect();
  }
};

export const disconnectSocket = () => {
  const s = getSocketInstance();
  if (s.connected) {
    s.disconnect();
  }
};

export default socket;
