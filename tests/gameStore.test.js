import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gameStore, generateRoomCode } from '../server/data/gameStore.js';
import { GameRoom } from '../server/game/GameRoom.js';

describe('room codes', () => {
  it('is four upper-case letters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z]{4}$/);
    }
  });

  it('never contains I or O, which players misread', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateRoomCode()).not.toMatch(/[IO]/);
    }
  });

  it('produces varied codes', () => {
    const codes = new Set(Array.from({ length: 300 }, generateRoomCode));
    expect(codes.size).toBeGreaterThan(250);
  });
});

describe('gameStore', () => {
  beforeEach(() => {
    gameStore.shutdown();
  });

  afterEach(() => {
    gameStore.shutdown();
    vi.useRealTimers();
  });

  it('stores, finds and deletes rooms', () => {
    const room = new GameRoom('AAAA', 'host');
    gameStore.createRoom('AAAA', room);

    expect(gameStore.hasRoom('AAAA')).toBe(true);
    expect(gameStore.getRoom('AAAA')).toBe(room);

    expect(gameStore.deleteRoom('AAAA')).toBe(true);
    expect(gameStore.hasRoom('AAAA')).toBe(false);
    expect(gameStore.deleteRoom('AAAA')).toBe(false);
  });

  it('stops a room\'s timer when the room is deleted', () => {
    vi.useFakeTimers();
    const io = { to: () => ({ emit: () => {} }) };
    const room = new GameRoom('BBBB', 'host');
    room.addPlayer('p0', 'Ann');
    room.startGame(3);
    gameStore.createRoom('BBBB', room);
    room.startTimer('prompt_vote', io, 'BBBB');

    expect(room.timerInterval).not.toBeNull();
    gameStore.deleteRoom('BBBB');

    // Without this, the interval kept ticking for the life of the process.
    expect(room.timerInterval).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports how many rooms and players are live', () => {
    const lobby = new GameRoom('CCCC', 'host');
    lobby.addPlayer('p0', 'Ann');
    const playing = new GameRoom('DDDD', 'host');
    playing.addPlayer('p1', 'Bo');
    playing.addPlayer('p2', 'Cy');
    playing.startGame(3);

    gameStore.createRoom('CCCC', lobby);
    gameStore.createRoom('DDDD', playing);

    expect(gameStore.getStats()).toEqual({ active: 2, players: 3, inGame: 1 });
  });

  it('lists rooms with their phase and headcount', () => {
    const room = new GameRoom('EEEE', 'host');
    room.addPlayer('p0', 'Ann');
    gameStore.createRoom('EEEE', room);

    expect(gameStore.getAllRooms()).toEqual([
      { code: 'EEEE', playerCount: 1, phase: 'lobby' },
    ]);
  });

  it('tears every room down on shutdown', () => {
    gameStore.createRoom('FFFF', new GameRoom('FFFF', 'host'));
    gameStore.createRoom('GGGG', new GameRoom('GGGG', 'host'));

    gameStore.shutdown();

    expect(gameStore.getStats().active).toBe(0);
  });
});
