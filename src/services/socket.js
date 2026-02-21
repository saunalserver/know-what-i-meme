import { io } from 'socket.io-client';

// CRITICAL: Get the actual hostname from the browser's location
const getSocketConfig = () => {
  const currentHost = window.location.hostname;
  const currentProtocol = window.location.protocol;
  const socketUrl = `${currentProtocol}//${currentHost}:3002`;

  console.log('🔌 Socket config - URL:', socketUrl, '| Host:', currentHost);

  return {
    url: socketUrl,
    options: {
      autoConnect: false,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    }
  };
};

// Create socket instance lazily
let _socket = null;

function getSocketInstance() {
  if (!_socket) {
    const config = getSocketConfig();
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
