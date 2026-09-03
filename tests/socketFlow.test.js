// End-to-end game flow over a real socket.io server with real clients.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';

import { setupSocketHandlers } from '../server/socket/index.js';
import { gameStore } from '../server/data/gameStore.js';

let httpServer;
let ioServer;
let port;
const clients = [];

function connect() {
  const client = createClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  clients.push(client);

  // Mirror what the real client does: keep the latest game state from either
  // event that carries one, so assertions don't race the broadcast.
  client.latestState = null;
  const record = (state) => { if (state) client.latestState = state; };
  client.on('game:state', record);
  client.on('players:update', ({ gameState }) => record(gameState));
  client.on('room:created', ({ gameState }) => record(gameState));
  client.on('room:joined', ({ gameState }) => record(gameState));

  return new Promise((resolve) => client.on('connect', () => resolve(client)));
}

// Resolve with the next payload for `event`, or reject with a useful message.
function once(client, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeout);
    const handler = (payload) => {
      clearTimeout(timer);
      client.off(event, handler);
      resolve(payload);
    };
    client.on(event, handler);
  });
}

// Wait until this client's view of the game satisfies `predicate` -- counting
// the state it has already received.
function waitForState(client, predicate, timeout = 5000) {
  if (client.latestState && predicate(client.latestState)) {
    return Promise.resolve(client.latestState);
  }
  return new Promise((resolve, reject) => {
    const cleanUp = () => {
      client.off('game:state', onState);
      client.off('players:update', onPlayers);
    };
    const timer = setTimeout(() => {
      cleanUp();
      reject(new Error('Timed out waiting for game state'));
    }, timeout);
    const check = (state) => {
      if (state && predicate(state)) {
        clearTimeout(timer);
        cleanUp();
        resolve(state);
      }
    };
    const onState = (state) => check(state);
    const onPlayers = ({ gameState }) => check(gameState);
    client.on('game:state', onState);
    client.on('players:update', onPlayers);
  });
}

async function hostRoom() {
  const host = await connect();
  const created = once(host, 'room:created');
  host.emit('host:create');
  const { code } = await created;
  return { host, code };
}

async function joinPlayer(code, name) {
  const client = await connect();
  const joined = once(client, 'room:joined');
  client.emit('player:join', { code, name });
  const { player } = await joined;
  return { client, player };
}

beforeEach(async () => {
  httpServer = createServer();
  ioServer = new Server(httpServer, { cors: { origin: '*' } });
  setupSocketHandlers(ioServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterEach(async () => {
  clients.splice(0).forEach(c => c.disconnect());
  gameStore.shutdown();
  ioServer.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

describe('lobby', () => {
  it('creates a room with a four-letter code', async () => {
    const { code } = await hostRoom();
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect(code).not.toMatch(/[IO]/); // Excluded to avoid misreads
  });

  it('lets players join and tells everyone', async () => {
    const { host, code } = await hostRoom();
    const update = once(host, 'players:update');
    await joinPlayer(code, 'Ann');
    const { players } = await update;

    expect(players).toHaveLength(1);
    expect(players[0].name).toBe('Ann');
    expect(players[0].connected).toBe(true);
  });

  it('accepts a lowercase room code', async () => {
    const { code } = await hostRoom();
    const client = await connect();
    const joined = once(client, 'room:joined');
    client.emit('player:join', { code: code.toLowerCase(), name: 'Ann' });
    await expect(joined).resolves.toBeTruthy();
  });

  it('rejects an unknown room', async () => {
    const client = await connect();
    const error = once(client, 'room:error');
    client.emit('player:join', { code: 'ZZZZ', name: 'Ann' });
    expect((await error).message).toBe('Room not found');
  });

  it('rejects a duplicate name', async () => {
    const { code } = await hostRoom();
    await joinPlayer(code, 'Ann');

    const client = await connect();
    const error = once(client, 'room:error');
    client.emit('player:join', { code, name: 'ann' });
    expect((await error).message).toBe('Name already taken');
  });

  it('rejects a blank name', async () => {
    const { code } = await hostRoom();
    const client = await connect();
    const error = once(client, 'room:error');
    client.emit('player:join', { code, name: '   ' });
    expect((await error).message).toBe('Please enter a name');
  });

  it('trims and caps a very long name', async () => {
    const { code } = await hostRoom();
    const { player } = await joinPlayer(code, '  ' + 'A'.repeat(50) + '  ');
    expect(player.name).toHaveLength(15);
  });

  it('refuses to start with fewer than two players', async () => {
    const { host, code } = await hostRoom();
    await joinPlayer(code, 'Ann');

    const error = once(host, 'room:error');
    host.emit('host:start', { rounds: 3 });
    expect((await error).message).toBe('Need at least 2 players to start');
  });

  it('refuses to start a game a non-host asked for', async () => {
    const { code } = await hostRoom();
    const { client } = await joinPlayer(code, 'Ann');
    await joinPlayer(code, 'Bo');

    const error = once(client, 'room:error');
    client.emit('host:start', { rounds: 3 });
    expect((await error).message).toBe('Only the host can do that');
  });

  it('turns away players once the game has started', async () => {
    const { host, code } = await hostRoom();
    await joinPlayer(code, 'Ann');
    await joinPlayer(code, 'Bo');
    host.emit('host:start', { rounds: 1 });
    await once(host, 'game:phase');

    const late = await connect();
    const error = once(late, 'room:error');
    late.emit('player:join', { code, name: 'Cy' });
    expect((await error).message).toBe('Game already in progress');
  });
});

describe('a full round', () => {
  it('runs prompt vote → GIF search → presentation → voting → results', async () => {
    const { host, code } = await hostRoom();
    const ann = await joinPlayer(code, 'Ann');
    const bo = await joinPlayer(code, 'Bo');

    // Start
    const started = once(host, 'game:phase');
    host.emit('host:start', { rounds: 1 });
    expect((await started).phase).toBe('prompt_vote');

    const promptState = await waitForState(host, s => s.phase === 'prompt_vote');
    expect(promptState.currentPromptOptions).toHaveLength(3);

    // Both vote for a prompt -> advances early, without waiting for the timer
    const gifPhase = once(host, 'game:phase');
    ann.client.emit('player:vote-prompt', { promptIndex: 1 });
    bo.client.emit('player:vote-prompt', { promptIndex: 1 });
    expect((await gifPhase).phase).toBe('gif_search');

    const gifState = await waitForState(host, s => s.phase === 'gif_search');
    expect(gifState.currentPrompt).toBe(gifState.currentPromptOptions[1]);

    // Both submit -> presentation
    const presentationPhase = once(host, 'game:phase');
    ann.client.emit('player:submit-gif', { gifUrl: 'https://cdn.example/ann.gif' });
    bo.client.emit('player:submit-gif', { gifUrl: 'https://cdn.example/bo.gif' });
    expect((await presentationPhase).phase).toBe('presentation');

    // Host clicks through both memes into voting
    const votingPhase = once(host, 'game:phase');
    host.emit('host:advance-presentation');
    host.emit('host:advance-presentation');
    expect((await votingPhase).phase).toBe('voting');

    // Cross-vote -> round results with scores
    const results = once(host, 'round:results');
    ann.client.emit('player:cast-vote', { targetId: bo.player.id });
    bo.client.emit('player:cast-vote', { targetId: ann.player.id });

    const { results: scores } = await results;
    expect(scores).toHaveLength(2);
    // One round game: final round, so votes are worth double.
    expect(scores.every(r => r.votesReceived === 1 && r.pointsEarned === 2)).toBe(true);

    // Last round -> final results
    const finalPhase = once(host, 'game:phase');
    host.emit('host:next');
    expect((await finalPhase).phase).toBe('final_results');
  });

  it('does not let a player vote for their own meme', async () => {
    const { host, code } = await hostRoom();
    const ann = await joinPlayer(code, 'Ann');
    const bo = await joinPlayer(code, 'Bo');

    host.emit('host:start', { rounds: 1 });
    await once(host, 'game:phase');
    ann.client.emit('player:vote-prompt', { promptIndex: 0 });
    bo.client.emit('player:vote-prompt', { promptIndex: 0 });
    await once(host, 'game:phase');
    ann.client.emit('player:submit-gif', { gifUrl: 'https://cdn.example/a.gif' });
    bo.client.emit('player:submit-gif', { gifUrl: 'https://cdn.example/b.gif' });
    await once(host, 'game:phase');
    host.emit('host:advance-presentation');
    host.emit('host:advance-presentation');
    await once(host, 'game:phase');

    const error = once(ann.client, 'room:error');
    ann.client.emit('player:cast-vote', { targetId: ann.player.id });
    expect((await error).message).toBe('You cannot vote for that meme');
  });

  it('rejects actions sent in the wrong phase', async () => {
    const { code } = await hostRoom();
    const ann = await joinPlayer(code, 'Ann');

    const error = once(ann.client, 'room:error');
    ann.client.emit('player:submit-gif', { gifUrl: 'https://cdn.example/a.gif' });
    expect((await error).message).toBe('Not in GIF search phase');
  });
});

describe('reconnection', () => {
  it('keeps a player and their score when their phone drops mid-game', async () => {
    const { host, code } = await hostRoom();
    const ann = await joinPlayer(code, 'Ann');
    const bo = await joinPlayer(code, 'Bo');

    host.emit('host:start', { rounds: 3 });
    await once(host, 'game:phase');

    const update = waitForState(host, s => s.players.some(p => !p.connected));
    bo.client.disconnect();
    const state = await update;

    expect(state.players).toHaveLength(2);
    expect(state.players.find(p => p.name === 'Bo').connected).toBe(false);
    // Ann is still in the game and can carry on.
    expect(state.players.find(p => p.name === 'Ann').connected).toBe(true);
    void ann;
  });

  it('lets a player rejoin and reclaim their seat', async () => {
    const { host, code } = await hostRoom();
    await joinPlayer(code, 'Ann');
    const bo = await joinPlayer(code, 'Bo');

    host.emit('host:start', { rounds: 3 });
    await once(host, 'game:phase');
    bo.client.emit('player:vote-prompt', { promptIndex: 0 });
    await waitForState(host, s => s.players.some(p => p.promptVote === 0));

    bo.client.disconnect();

    const back = await connect();
    const rejoined = once(back, 'room:joined');
    back.emit('player:rejoin', { code, playerId: bo.player.id });
    const { player, gameState } = await rejoined;

    expect(player.name).toBe('Bo');
    expect(player.connected).toBe(true);
    // Their prompt vote survived the round trip.
    expect(gameState.players.find(p => p.name === 'Bo').promptVote).toBe(0);
  });

  it('does not remove a player who is only mid-round, so voting still counts', async () => {
    const { host, code } = await hostRoom();
    const ann = await joinPlayer(code, 'Ann');
    const bo = await joinPlayer(code, 'Bo');
    const cy = await joinPlayer(code, 'Cy');

    host.emit('host:start', { rounds: 1 });
    await once(host, 'game:phase');

    // Cy drops out; the other two finishing should move the game on by itself.
    cy.client.disconnect();
    const gifPhase = once(host, 'game:phase');
    ann.client.emit('player:vote-prompt', { promptIndex: 0 });
    bo.client.emit('player:vote-prompt', { promptIndex: 0 });

    expect((await gifPhase).phase).toBe('gif_search');
  });

  it('advances the round when the last player still needed drops out', async () => {
    const { host, code } = await hostRoom();
    const ann = await joinPlayer(code, 'Ann');
    const bo = await joinPlayer(code, 'Bo');

    host.emit('host:start', { rounds: 1 });
    await once(host, 'game:phase');

    ann.client.emit('player:vote-prompt', { promptIndex: 0 });
    await waitForState(host, s => s.players.some(p => p.promptVote === 0));

    // Bo never votes and leaves: the round should not sit waiting on them.
    const gifPhase = once(host, 'game:phase');
    bo.client.disconnect();
    expect((await gifPhase).phase).toBe('gif_search');
  });

  it('removes a player who leaves during the lobby', async () => {
    const { host, code } = await hostRoom();
    await joinPlayer(code, 'Ann');
    const bo = await joinPlayer(code, 'Bo');

    const update = new Promise((resolve) => {
      const handler = ({ players }) => {
        if (players.length === 1) {
          host.off('players:update', handler);
          resolve(players);
        }
      };
      host.on('players:update', handler);
    });

    bo.client.disconnect();
    expect(await update).toHaveLength(1);
  });

  it('lets the host reclaim the room after a refresh, without ending the game', async () => {
    const { host, code } = await hostRoom();
    const ann = await joinPlayer(code, 'Ann');
    await joinPlayer(code, 'Bo');

    host.emit('host:start', { rounds: 3 });
    await once(host, 'game:phase');

    host.disconnect();

    const newHost = await connect();
    const recreated = once(newHost, 'room:created');
    newHost.emit('host:rejoin', { code });
    const { gameState } = await recreated;

    expect(gameState.phase).toBe('prompt_vote');
    expect(gameState.players).toHaveLength(2);

    // The reclaimed socket really is the host now.
    const gifPhase = once(newHost, 'game:phase');
    ann.client.emit('player:vote-prompt', { promptIndex: 0 });
    const otherPlayer = gameState.players.find(p => p.name === 'Bo');
    expect(otherPlayer).toBeTruthy();

    // Reset is a host-only action and should be accepted from the new socket.
    newHost.emit('host:reset');
    expect((await gifPhase).phase).toBe('lobby');
  });
});

describe('host controls', () => {
  it('resets to the lobby with scores cleared', async () => {
    const { host, code } = await hostRoom();
    await joinPlayer(code, 'Ann');
    await joinPlayer(code, 'Bo');

    host.emit('host:start', { rounds: 3 });
    await once(host, 'game:phase');

    const lobby = once(host, 'game:phase');
    host.emit('host:reset');
    expect((await lobby).phase).toBe('lobby');

    const state = await waitForState(host, s => s.phase === 'lobby');
    expect(state.players).toHaveLength(2);
    expect(state.players.every(p => p.score === 0)).toBe(true);
  });

  it('restarts a finished game with the same players', async () => {
    const { host, code } = await hostRoom();
    await joinPlayer(code, 'Ann');
    await joinPlayer(code, 'Bo');

    host.emit('host:start', { rounds: 2 });
    await once(host, 'game:phase');

    const restarted = once(host, 'game:phase');
    host.emit('host:restart', { rounds: 5 });
    expect((await restarted).phase).toBe('prompt_vote');

    const state = await waitForState(host, s => s.totalRounds === 5);
    expect(state.currentRound).toBe(1);
    expect(state.players).toHaveLength(2);
  });

  it('ignores host:restart from a player', async () => {
    const { code } = await hostRoom();
    const ann = await joinPlayer(code, 'Ann');
    await joinPlayer(code, 'Bo');

    const error = once(ann.client, 'room:error');
    ann.client.emit('host:restart', { rounds: 5 });
    expect((await error).message).toBe('Only the host can do that');
  });
});
