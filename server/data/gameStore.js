// In-memory game storage
const rooms = new Map();

const CLEANUP_INTERVAL = 5 * 60 * 1000;
const EMPTY_ROOM_TTL = 60 * 60 * 1000;   // Room created but nobody ever joined
const IDLE_ROOM_TTL = 4 * 60 * 60 * 1000; // Game abandoned mid-way

export const gameStore = {
  createRoom(code, room) {
    rooms.set(code, room);
    console.log(`🏠 Room created: ${code}`);
    return room;
  },

  getRoom(code) {
    return rooms.get(code);
  },

  // Always go through here: a room dropped without destroy() leaves its
  // countdown interval running and emitting for the life of the process.
  deleteRoom(code) {
    const room = rooms.get(code);
    if (!room) return false;
    room.destroy();
    rooms.delete(code);
    console.log(`🗑️ Room deleted: ${code}`);
    return true;
  },

  hasRoom(code) {
    return rooms.has(code);
  },

  getAllRooms() {
    return Array.from(rooms.entries()).map(([code, room]) => ({
      code,
      playerCount: room.players.length,
      phase: room.phase,
    }));
  },

  getStats() {
    const all = Array.from(rooms.values());
    return {
      active: all.length,
      players: all.reduce((sum, room) => sum + room.players.length, 0),
      inGame: all.filter(room => room.phase !== 'lobby').length,
    };
  },

  // Test/shutdown helper: tear every room down cleanly.
  shutdown() {
    for (const code of Array.from(rooms.keys())) this.deleteRoom(code);
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  },
};

// Generate a random 4-character room code
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I or O: too easy to misread
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Reap rooms nobody is coming back to.
let cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const empty = room.players.length === 0 && now - room.createdAt > EMPTY_ROOM_TTL;
    const idle = now - (room.lastActivityAt || room.createdAt) > IDLE_ROOM_TTL;
    if (empty || idle) {
      gameStore.deleteRoom(code);
      console.log(`🧹 Cleaned up ${empty ? 'empty' : 'idle'} room: ${code}`);
    }
  }
}, CLEANUP_INTERVAL);

// Don't hold the process open for the sake of the reaper.
cleanupTimer.unref?.();

export default gameStore;
