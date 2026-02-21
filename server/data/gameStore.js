// In-memory game storage
const rooms = new Map();

export const gameStore = {
  createRoom(code, room) {
    rooms.set(code, room);
    console.log(`🏠 Room created: ${code}`);
    return room;
  },

  getRoom(code) {
    return rooms.get(code);
  },

  deleteRoom(code) {
    rooms.delete(code);
    console.log(`🗑️ Room deleted: ${code}`);
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
};

// Generate a random 4-character room code
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluded I and O to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Clean up empty rooms periodically
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    // Delete rooms with no players that are older than 1 hour
    if (room.players.length === 0 && Date.now() - room.createdAt > 3600000) {
      rooms.delete(code);
      console.log(`🧹 Cleaned up empty room: ${code}`);
    }
  }
}, 300000); // Check every 5 minutes

export default gameStore;
