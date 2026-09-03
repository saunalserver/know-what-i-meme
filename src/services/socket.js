import { io } from 'socket.io-client';

// Where the socket connects, mirroring how the page itself was served:
//   - HTTPS (behind the reverse proxy): same origin, proxy forwards /socket.io
//   - HTTP: straight to the backend on :3002
function getSocketConfig() {
  const { protocol, hostname, origin } = window.location;
  const secure = protocol === 'https:';

  return {
    url: secure ? origin : `${protocol}//${hostname}:3002`,
    options: {
      autoConnect: false,
      path: '/socket.io',
      // Through a proxy, websocket first avoids a slow polling handshake.
      transports: secure ? ['websocket', 'polling'] : ['polling', 'websocket'],
      reconnection: true,
      // Keep trying: a phone that was asleep for a while should still recover.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    },
  };
}

let _socket = null;

function getSocketInstance() {
  if (!_socket) {
    const config = getSocketConfig();
    _socket = io(config.url, config.options);
    _socket.on('connect_error', (error) => {
      console.warn('Socket connection error:', error.message);
    });
  }
  return _socket;
}

// Thin facade so callers never touch the instance before it exists.
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
  if (!s.connected) s.connect();
};

export const disconnectSocket = () => {
  const s = getSocketInstance();
  if (s.connected) s.disconnect();
};

export default socket;
