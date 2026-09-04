// Player class

// Avatar colours, in the order they are handed out. The old list was picked
// from at random, so with five players a repeat was more likely than not and
// two people ended up indistinguishable on the big screen. It also held three
// mints, two pale yellows and two lilacs, so even distinct picks could look
// alike. These are ordered to walk the colour wheel: consecutive players are
// always far apart in hue, and there are enough for a full room (MAX_PLAYERS).
const AVATAR_COLORS = [
  '#FF6B6B', // red
  '#4ECDC4', // teal
  '#FFD166', // amber
  '#BB8FCE', // lilac
  '#7BC950', // green
  '#45B7D1', // blue
  '#F78FB3', // pink
  '#F79256', // orange
  '#98A0F5', // periwinkle
  '#3FBF9F', // jade
];

/**
 * The first colour nobody in the room is already using, so avatars stay
 * distinguishable. Falls back to walking the list once every colour is taken.
 */
export function pickAvatarColor(takenColors = []) {
  const taken = new Set(takenColors);
  return (
    AVATAR_COLORS.find((c) => !taken.has(c)) ??
    AVATAR_COLORS[taken.size % AVATAR_COLORS.length]
  );
}

export class Player {
  constructor(id, name, photo = null, color = AVATAR_COLORS[0]) {
    this.id = id;
    this.name = name;
    this.photo = photo; // Base64 data URL or image URL
    this.color = color;
    this.score = 0;
    this.currentGif = null;
    this.hasVoted = false;
    this.hasSubmitted = false;
    this.promptVote = null;
    // A phone that locks or loses wifi stays in the game as a disconnected
    // player, keeping its score and submission until it rejoins.
    this.connected = true;
    this.disconnectedAt = null;
  }

  resetForNewRound() {
    this.currentGif = null;
    this.hasVoted = false;
    this.hasSubmitted = false;
    this.promptVote = null;
  }

  addScore(points) {
    this.score += points;
  }

  markDisconnected() {
    this.connected = false;
    this.disconnectedAt = Date.now();
  }

  markConnected(newId) {
    this.id = newId;
    this.connected = true;
    this.disconnectedAt = null;
  }

  // Every field the client reads must be here: anything missing arrives as
  // `undefined` and silently fails checks like `promptVote !== null`.
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      photo: this.photo,
      color: this.color,
      score: this.score,
      currentGif: this.currentGif,
      hasVoted: this.hasVoted,
      hasSubmitted: this.hasSubmitted,
      promptVote: this.promptVote,
      connected: this.connected,
    };
  }
}

export default Player;
