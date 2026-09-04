import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameRoom, NO_GIF_PLACEHOLDER, isUsableGifUrl } from '../server/game/GameRoom.js';
import { pickAvatarColor } from '../server/game/Player.js';

// Minimal stand-in for socket.io: records what would have been broadcast.
function makeIo() {
  const emitted = [];
  return {
    emitted,
    to: () => ({
      emit: (event, payload) => emitted.push({ event, payload }),
    }),
    events: (name) => emitted.filter(e => e.event === name),
    lastPhase: () => emitted.filter(e => e.event === 'game:phase').at(-1)?.payload.phase,
  };
}

function roomWithPlayers(count = 3) {
  const room = new GameRoom('TEST', 'host-socket');
  for (let i = 0; i < count; i++) {
    room.addPlayer(`p${i}`, `Player${i}`);
  }
  return room;
}

describe('GameRoom - players', () => {
  it('adds and finds players', () => {
    const room = roomWithPlayers(2);
    expect(room.players).toHaveLength(2);
    expect(room.getPlayer('p1').name).toBe('Player1');
  });

  it('removes a player and everything keyed to them', () => {
    const room = roomWithPlayers(3);
    room.startGame(3);
    room.submitGif('p1', 'https://example.com/a.gif');
    room.presentationOrder = ['p0', 'p1', 'p2'];
    room.castVote('p0', 'p1');

    room.removePlayer('p1');

    expect(room.getPlayer('p1')).toBeUndefined();
    expect(room.presentationOrder).toEqual(['p0', 'p2']);
    expect(room.submissions.has('p1')).toBe(false);
    // The vote cast for the departed player is withdrawn, not left dangling.
    expect(room.votes.get('p0')).toBeUndefined();
    expect(room.getPlayer('p0').hasVoted).toBe(false);
  });

  it('keeps the presentation index inside the shortened order', () => {
    const room = roomWithPlayers(3);
    room.startGame(3);
    room.presentationOrder = ['p0', 'p1', 'p2'];
    room.presentationIndex = 2;

    room.removePlayer('p2');

    expect(room.presentationIndex).toBe(1);
    expect(room.presentationIndex).toBeLessThan(room.presentationOrder.length);
  });

  it('does not wait on disconnected players', () => {
    const room = roomWithPlayers(3);
    room.startGame(3);

    room.voteForPrompt('p0', 0);
    room.voteForPrompt('p1', 0);
    expect(room.allPlayersVotedForPrompt()).toBe(false);

    room.getPlayer('p2').markDisconnected();
    expect(room.allPlayersVotedForPrompt()).toBe(true);
  });

  it('is not "everyone ready" when nobody is connected', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    room.players.forEach(p => p.markDisconnected());

    expect(room.allPlayersVotedForPrompt()).toBe(false);
    expect(room.allPlayersSubmitted()).toBe(false);
    expect(room.allPlayersVoted()).toBe(false);
  });
});

describe('GameRoom - prompt voting', () => {
  let room;
  beforeEach(() => {
    room = roomWithPlayers(3);
    room.startGame(3);
  });

  it('offers three prompts and counts votes', () => {
    expect(room.currentPromptOptions).toHaveLength(3);

    room.voteForPrompt('p0', 1);
    room.voteForPrompt('p1', 1);

    expect(room.promptVotes.get(1)).toBe(2);
    expect(room.getPlayer('p0').promptVote).toBe(1);
  });

  it('moves a vote rather than double-counting it', () => {
    room.voteForPrompt('p0', 0);
    room.voteForPrompt('p0', 2);

    expect(room.promptVotes.get(0)).toBe(0);
    expect(room.promptVotes.get(2)).toBe(1);
  });

  it('clears the vote when the same prompt is tapped again', () => {
    room.voteForPrompt('p0', 0);
    room.voteForPrompt('p0', 0);

    expect(room.promptVotes.get(0)).toBe(0);
    expect(room.getPlayer('p0').promptVote).toBeNull();
  });

  it('rejects an out-of-range or non-integer prompt index', () => {
    for (const bad of [3, -1, 99, '1', 1.5, null, undefined, {}]) {
      expect(room.voteForPrompt('p0', bad)).toBe(false);
    }
    // A rejected vote must not leave a phantom entry behind.
    expect([...room.promptVotes.keys()].sort()).toEqual([0, 1, 2]);
  });

  it('always resolves to one of the offered prompts, even with no votes', () => {
    const winner = room.resolvePromptVote();
    expect(room.currentPromptOptions).toContain(winner);
    expect(winner).toBeTruthy();
  });

  it('picks the most-voted prompt', () => {
    room.voteForPrompt('p0', 2);
    room.voteForPrompt('p1', 2);
    room.voteForPrompt('p2', 0);

    expect(room.resolvePromptVote()).toBe(room.currentPromptOptions[2]);
  });

  it('breaks ties across the tied options rather than always picking the first', () => {
    // Two options tied at one vote each, resolved many times.
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const r = roomWithPlayers(2);
      r.startGame(3);
      r.voteForPrompt('p0', 0);
      r.voteForPrompt('p1', 1);
      seen.add(r.currentPromptOptions.indexOf(r.resolvePromptVote()));
    }
    expect(seen).toContain(0);
    expect(seen).toContain(1);
  });

  it('does not repeat prompts within a game', () => {
    const r = roomWithPlayers(2);
    r.startGame(15);
    const all = [];
    for (let round = 0; round < 15; round++) {
      all.push(...r.currentPromptOptions);
      r.preparePromptVoting();
    }
    // Placeholders are filled per round, so compare the raw picks.
    expect(new Set(r.usedPrompts).size).toBe(r.usedPrompts.size);
    expect(all.length).toBe(45);
  });
});

describe('GameRoom - submissions and votes', () => {
  let room;
  beforeEach(() => {
    room = roomWithPlayers(3);
    room.startGame(3);
    room.presentationOrder = ['p0', 'p1', 'p2'];
  });

  it('accepts a valid GIF URL and allows changing it', () => {
    expect(room.submitGif('p0', 'https://example.com/a.gif')).toBe(true);
    expect(room.submitGif('p0', 'https://example.com/b.gif')).toBe(true);
    expect(room.getPlayer('p0').currentGif).toBe('https://example.com/b.gif');
    expect(room.submissions.get('p0')).toBe('https://example.com/b.gif');
  });

  it('accepts a GIF served from this server\'s own local pool', () => {
    // Offline fallback submissions are same-origin paths, not absolute URLs.
    expect(room.submitGif('p0', '/kwim/api/gif/local/abc123.gif')).toBe(true);
    expect(room.getPlayer('p0').currentGif).toBe('/kwim/api/gif/local/abc123.gif');
    expect(isUsableGifUrl('/api/gif/local/abc123.gif')).toBe(true);
  });

  it('rejects anything that is neither an http(s) URL nor a pooled file', () => {
    const bad = [
      'javascript:alert(1)', 'data:image/gif;base64,x', '', null, 42,
      '/etc/passwd',
      '/api/gif/local/../../../etc/passwd',
      '/api/gif/local/abc.gif/../../secret',
      'api/gif/local/abc.gif',          // must be rooted
      '//evil.example/api/gif/local/a.gif', // protocol-relative: off-origin
    ];
    for (const value of bad) {
      expect(room.submitGif('p0', value)).toBe(false);
    }
    expect(room.getPlayer('p0').hasSubmitted).toBe(false);
  });

  it('refuses self-votes and votes for players not in the round', () => {
    expect(room.castVote('p0', 'p0')).toBe(false);
    expect(room.castVote('p0', 'ghost')).toBe(false);
    expect(room.castVote('p0', 'p1')).toBe(true);
  });

  it('lets a player change their vote without adding a second one', () => {
    room.castVote('p0', 'p1');
    room.castVote('p0', 'p2');
    expect(room.votes.size).toBe(1);
    expect(room.votes.get('p0')).toBe('p2');
  });

  it('scores a round by votes received', () => {
    room.castVote('p0', 'p1');
    room.castVote('p2', 'p1');
    room.castVote('p1', 'p0');

    const results = room.calculateRoundResults();

    expect(room.getPlayer('p1').score).toBe(2);
    expect(room.getPlayer('p0').score).toBe(1);
    expect(room.getPlayer('p2').score).toBe(0);
    // Sorted, winner first, with a breakdown of who voted for whom.
    expect(results[0].playerId).toBe('p1');
    expect(results[0].voters.map(v => v.voterId).sort()).toEqual(['p0', 'p2']);
  });

  it('doubles points in the final round', () => {
    room.currentRound = 3; // totalRounds is 3
    expect(room.isFinalRound()).toBe(true);
    expect(room.getPointsMultiplier()).toBe(2);

    room.castVote('p0', 'p1');
    room.calculateRoundResults();

    expect(room.getPlayer('p1').score).toBe(2);
  });
});

describe('GameRoom - phases and timers', () => {
  let io;

  beforeEach(() => {
    vi.useFakeTimers();
    io = makeIo();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts state, phase and a countdown on entering a phase', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    room.enterPhase('prompt_vote', io, 'TEST');

    expect(io.lastPhase()).toBe('prompt_vote');
    expect(io.events('game:state')).toHaveLength(1);
    expect(io.events('timer:update')[0].payload).toEqual({
      phase: 'prompt_vote',
      seconds: 30,
      total: 30,
    });
  });

  it('counts down and advances when the prompt timer expires', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    room.enterPhase('prompt_vote', io, 'TEST');

    vi.advanceTimersByTime(30_000);

    expect(room.phase).toBe('gif_search');
    expect(room.currentPrompt).toBeTruthy();
    expect(room.timerPhase).toBe('gif_search');
  });

  it('gives non-submitters a placeholder when the GIF timer expires', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    room.submitGif('p0', 'https://example.com/a.gif');
    room.enterPhase('gif_search', io, 'TEST');

    vi.advanceTimersByTime(60_000);

    expect(room.getPlayer('p1').currentGif).toBe(NO_GIF_PLACEHOLDER);
    expect(room.phase).toBe('presentation');
  });

  it('auto-advances through every meme and then into voting', () => {
    const room = roomWithPlayers(3);
    room.startGame(3);
    room.enterPhase('presentation', io, 'TEST');

    expect(room.presentationIndex).toBe(0);
    vi.advanceTimersByTime(5_000);
    expect(room.presentationIndex).toBe(1);
    vi.advanceTimersByTime(5_000);
    expect(room.presentationIndex).toBe(2);
    vi.advanceTimersByTime(5_000);

    expect(room.phase).toBe('voting');
    expect(room.presentationIndex).toBe(0);
  });

  it('runs a whole 3-round game to the final results on timers alone', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    room.enterPhase('prompt_vote', io, 'TEST');

    // 30s prompt + 60s gifs + 2x5s presentation + 30s vote + 8s results
    for (let round = 0; round < 3; round++) {
      vi.advanceTimersByTime(30_000 + 60_000 + 10_000 + 30_000 + 8_000);
    }

    expect(room.phase).toBe('final_results');
    expect(room.currentRound).toBe(3);
  });

  it('shows the leaderboard every third round of a long game', () => {
    const room = roomWithPlayers(2);
    room.startGame(6);
    room.currentRound = 3;
    room.phase = 'round_results';

    room.advanceAfterResults(io, 'TEST');
    expect(room.phase).toBe('leaderboard');

    // The leaderboard times out into the next round.
    vi.advanceTimersByTime(10_000);
    expect(room.phase).toBe('prompt_vote');
    expect(room.currentRound).toBe(4);
  });

  it('has no leaderboard in a short game', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    room.currentRound = 3;
    expect(room.shouldShowLeaderboard()).toBe(false);
  });

  it('stops its timer when destroyed', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    room.enterPhase('prompt_vote', io, 'TEST');

    room.destroy();
    const emittedAfterDestroy = io.emitted.length;
    vi.advanceTimersByTime(60_000);

    expect(io.emitted.length).toBe(emittedAfterDestroy);
    expect(room.timerInterval).toBeNull();
  });

  it('replaces the running timer rather than stacking two', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    room.startTimer('prompt_vote', io, 'TEST');
    room.startTimer('voting', io, 'TEST');

    vi.advanceTimersByTime(1_000);
    // One tick from one timer, not two.
    const ticks = io.events('timer:update').filter(e => e.payload.seconds === 29);
    expect(ticks).toHaveLength(1);
  });
});

describe('GameRoom - lifecycle', () => {
  it('clamps the round count to a sane range', () => {
    const room = roomWithPlayers(2);
    room.startGame(999);
    expect(room.totalRounds).toBe(15);
    room.startGame(0);
    expect(room.totalRounds).toBe(3);
    room.startGame('abc');
    expect(room.totalRounds).toBe(3);
  });

  it('resets to the lobby keeping the players but clearing scores', () => {
    const room = roomWithPlayers(3);
    room.startGame(3);
    room.getPlayer('p0').addScore(5);
    room.submitGif('p1', 'https://example.com/a.gif');

    room.resetToLobby();

    expect(room.phase).toBe('lobby');
    expect(room.players).toHaveLength(3);
    expect(room.getPlayer('p0').score).toBe(0);
    expect(room.getPlayer('p1').hasSubmitted).toBe(false);
    expect(room.submissions.size).toBe(0);
  });

  it('serialises everything the client needs', () => {
    const room = roomWithPlayers(2);
    room.startGame(3);
    const json = room.toJSON();

    for (const key of [
      'code', 'phase', 'players', 'currentRound', 'totalRounds',
      'currentPromptOptions', 'promptVoteCounts', 'presentationOrder',
      'timerSeconds', 'timerPhase', 'isFinalRound', 'pointsMultiplier',
    ]) {
      expect(json).toHaveProperty(key);
    }
    // Player state the UI reads must survive serialisation.
    expect(json.players[0]).toHaveProperty('promptVote');
    expect(json.players[0]).toHaveProperty('connected');
  });
});

describe('avatar colours', () => {
  it('gives every player in a full room a different colour', () => {
    const room = new GameRoom('COLR', 'host');
    for (let i = 0; i < 9; i++) room.addPlayer(`p${i}`, `Player${i}`);

    const colors = room.players.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('skips colours already taken', () => {
    const first = pickAvatarColor([]);
    expect(pickAvatarColor([first])).not.toBe(first);
  });

  it('still returns a colour once every one is taken', () => {
    const room = new GameRoom('COLR', 'host');
    for (let i = 0; i < 9; i++) room.addPlayer(`p${i}`, `Player${i}`);
    const taken = room.players.map((p) => p.color);

    expect(typeof pickAvatarColor([...taken, ...taken])).toBe('string');
  });
});
