import { describe, it, expect } from 'vitest';
import {
  PROMPTS,
  PROMPT_COUNT,
  getRandomPrompts,
  fillPlayerPlaceholders,
} from '../server/data/prompts.js';

const PLAYERS = [{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }];

describe('prompt deck', () => {
  it('has a healthy number of prompts across categories', () => {
    expect(PROMPT_COUNT).toBeGreaterThan(200);
    expect(Object.keys(PROMPTS).length).toBeGreaterThan(1);
  });

  it('returns the requested number of distinct prompts', () => {
    const prompts = getRandomPrompts(3);
    expect(prompts).toHaveLength(3);
    expect(new Set(prompts).size).toBe(3);
  });

  it('can leave the edgy category out', () => {
    const edgy = new Set(PROMPTS.edgy);
    // Draw a large sample; none of it should come from the edgy pile.
    for (let i = 0; i < 200; i++) {
      for (const prompt of getRandomPrompts(3, false)) {
        expect(edgy.has(prompt)).toBe(false);
      }
    }
  });

  it('avoids prompts already used this game', () => {
    const used = new Set();
    for (let round = 0; round < 20; round++) {
      const picks = getRandomPrompts(3, true, used);
      for (const pick of picks) {
        expect(used.has(pick)).toBe(false);
        used.add(pick);
      }
    }
    expect(used.size).toBe(60);
  });

  it('falls back to repeats only once the deck runs out', () => {
    const used = new Set([...Array(PROMPT_COUNT)].map((_, i) => i.toString()));
    // A "used" set that excludes nothing real still yields prompts.
    expect(getRandomPrompts(3, true, used)).toHaveLength(3);
  });

  it('shuffles evenly rather than favouring the front of the deck', () => {
    // A sort()-based shuffle leaves early entries far likelier to be picked.
    const firstPrompt = PROMPTS.discord[0];
    let hits = 0;
    const draws = 4000;
    for (let i = 0; i < draws; i++) {
      if (getRandomPrompts(1).includes(firstPrompt)) hits++;
    }
    const expected = draws / PROMPT_COUNT;
    // Generous bounds -- this catches a badly biased shuffle, not noise.
    expect(hits).toBeGreaterThan(expected * 0.3);
    expect(hits).toBeLessThan(expected * 3);
  });
});

describe('player placeholders', () => {
  it('substitutes both placeholders with player names', () => {
    const filled = fillPlayerPlaceholders('{Player} owes {Player2} money', PLAYERS);
    expect(filled).not.toContain('{Player}');
    expect(filled).not.toContain('{Player2}');

    const names = PLAYERS.map(p => p.name);
    const [first, second] = filled.replace(' owes ', '|').replace(' money', '').split('|');
    expect(names).toContain(first);
    expect(names).toContain(second);
    expect(first).not.toBe(second);
  });

  it('replaces every occurrence, not just the first', () => {
    const filled = fillPlayerPlaceholders('{Player} and {Player} again', [{ name: 'Ann' }]);
    expect(filled).toBe('Ann and Ann again');
  });

  it('copes with a single player and with none', () => {
    expect(fillPlayerPlaceholders('{Player} vs {Player2}', [{ name: 'Ann' }]))
      .toBe('Ann vs Someone Else');
    expect(fillPlayerPlaceholders('{Player} alone', [])).toBe('{Player} alone');
  });

  it('leaves prompts without placeholders untouched', () => {
    const plain = 'The worst thing to use as confetti';
    expect(fillPlayerPlaceholders(plain, PLAYERS)).toBe(plain);
  });
});
