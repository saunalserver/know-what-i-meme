// Ambient background music utility using Web Audio API
// Generates procedural ambient music for different game phases

class MusicManager {
  constructor() {
    this.audioContext = null
    this.enabled = true
    this.volume = 0.15
    this.currentPhase = null
    this.isPlaying = false
    this.nodes = [] // Active audio nodes to stop when changing phases
  }

  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled
    if (!enabled) {
      this.stop()
    }
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  // Stop all current music
  stop() {
    this.nodes.forEach(node => {
      try {
        node.stop()
      } catch (e) {}
    })
    this.nodes = []
    this.isPlaying = false
    this.currentPhase = null
  }

  // Play ambient music for a specific phase
  play(phase) {
    if (!this.enabled) return
    if (this.currentPhase === phase && this.isPlaying) return

    this.init()
    this.stop()
    this.currentPhase = phase
    this.isPlaying = true

    switch (phase) {
      case 'lobby':
        this.playLobbyMusic()
        break
      case 'prompt_vote':
      case 'gif_search':
        this.playGameMusic()
        break
      case 'voting':
        this.playVotingMusic()
        break
      case 'round_results':
      case 'leaderboard':
        this.playResultsMusic()
        break
      case 'final_results':
        this.playCelebrationMusic()
        break
      default:
        break
    }
  }

  // Create a sustained oscillator with envelope
  createPad(frequency, detune = 0, waveform = 'sine', filterFreq = 800) {
    const osc = this.audioContext.createOscillator()
    const gain = this.audioContext.createGain()
    const filter = this.audioContext.createBiquadFilter()

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.audioContext.destination)

    osc.type = waveform
    osc.frequency.value = frequency
    osc.detune.value = detune

    filter.type = 'lowpass'
    filter.frequency.value = filterFreq
    filter.Q.value = 1

    return { osc, gain, filter }
  }

  // Create an LFO for modulation
  createLFO(frequency, min, max) {
    const lfo = this.audioContext.createOscillator()
    const lfoGain = this.audioContext.createGain()

    lfo.connect(lfoGain)
    lfo.type = 'sine'
    lfo.frequency.value = frequency
    lfoGain.gain.value = (max - min) / 2

    return { lfo, lfoGain }
  }

  // LOBBY: Calm, inviting ambient pad
  playLobbyMusic() {
    const baseFreq = 110 // A2
    const chords = [
      [1, 1.25, 1.5],      // A - C# - E
      [1, 1.2, 1.5],       // A - C - E
      [0.833, 1, 1.25],    // G# - A - C#
    ]

    let chordIndex = 0
    const playChord = () => {
      if (!this.isPlaying || this.currentPhase !== 'lobby') return

      const chord = chords[chordIndex % chords.length]
      chord.forEach((mult, i) => {
        const { osc, gain, filter } = this.createPad(baseFreq * mult, i * 5, 'sine', 600)

        // Fade in
        gain.gain.setValueAtTime(0, this.audioContext.currentTime)
        gain.gain.linearRampToValueAtTime(this.volume * 0.3, this.audioContext.currentTime + 2)
        // Fade out before next chord
        gain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 7)

        osc.start()
        osc.stop(this.audioContext.currentTime + 8)
        this.nodes.push(osc)
      })

      chordIndex++
      setTimeout(playChord, 8000)
    }

    playChord()
  }

  // GAME (prompt_vote, gif_search): More energetic, mysterious
  playGameMusic() {
    const baseFreq = 82.41 // E2
    const notes = [1, 1.125, 1.25, 1.333, 1.5] // Pentatonic feel

    // Bass drone
    const { osc: bass, gain: bassGain } = this.createPad(baseFreq, 0, 'sine', 400)
    bassGain.gain.setValueAtTime(this.volume * 0.4, this.audioContext.currentTime)
    bass.start()
    this.nodes.push(bass)

    // Arpeggiated high notes
    let noteIndex = 0
    const playNote = () => {
      if (!this.isPlaying || !['prompt_vote', 'gif_search'].includes(this.currentPhase)) return

      const freq = baseFreq * 2 * notes[noteIndex % notes.length]
      const { osc, gain } = this.createPad(freq, Math.random() * 10 - 5, 'triangle', 2000)

      gain.gain.setValueAtTime(this.volume * 0.15, this.audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.8)

      osc.start()
      osc.stop(this.audioContext.currentTime + 1)
      this.nodes.push(osc)

      noteIndex++
      setTimeout(playNote, 400 + Math.random() * 200)
    }

    playNote()
  }

  // VOTING: Tense, anticipatory
  playVotingMusic() {
    const baseFreq = 130.81 // C3

    // Tense drone with slight dissonance
    const { osc: drone1, gain: gain1 } = this.createPad(baseFreq, 0, 'sine', 500)
    const { osc: drone2, gain: gain2 } = this.createPad(baseFreq * 1.02, 0, 'sine', 500) // Slightly sharp

    gain1.gain.setValueAtTime(this.volume * 0.25, this.audioContext.currentTime)
    gain2.gain.setValueAtTime(this.volume * 0.2, this.audioContext.currentTime)

    drone1.start()
    drone2.start()
    this.nodes.push(drone1, drone2)

    // Occasional tension stabs
    const playStab = () => {
      if (!this.isPlaying || this.currentPhase !== 'voting') return

      const { osc, gain } = this.createPad(baseFreq * 2, 0, 'sawtooth', 3000)
      gain.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3)

      osc.start()
      osc.stop(this.audioContext.currentTime + 0.4)
      this.nodes.push(osc)

      setTimeout(playStab, 2000 + Math.random() * 2000)
    }

    setTimeout(playStab, 1500)
  }

  // RESULTS: Uplifting, celebratory but chill
  playResultsMusic() {
    const baseFreq = 196 // G3
    const melody = [1, 1.25, 1.5, 1.25, 1.333, 1.5, 1.667, 1.5]

    let noteIndex = 0
    const playNote = () => {
      if (!this.isPlaying || !['round_results', 'leaderboard'].includes(this.currentPhase)) return

      const freq = baseFreq * melody[noteIndex % melody.length]
      const { osc, gain } = this.createPad(freq, 0, 'sine', 1500)

      gain.gain.setValueAtTime(this.volume * 0.2, this.audioContext.currentTime)
      gain.gain.linearRampToValueAtTime(this.volume * 0.1, this.audioContext.currentTime + 0.3)
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.6)

      osc.start()
      osc.stop(this.audioContext.currentTime + 0.7)
      this.nodes.push(osc)

      noteIndex++
      setTimeout(playNote, 350)
    }

    // Add a soft pad underneath
    const { osc: pad, gain: padGain } = this.createPad(baseFreq * 0.5, 0, 'sine', 400)
    padGain.gain.setValueAtTime(this.volume * 0.2, this.audioContext.currentTime)
    pad.start()
    this.nodes.push(pad)

    playNote()
  }

  // CELEBRATION: Winner announcement, fanfare-like
  playCelebrationMusic() {
    const baseFreq = 261.63 // C4
    const triumphMelody = [1, 1.25, 1.5, 2, 1.5, 2, 2.5, 2]

    let noteIndex = 0
    const playNote = () => {
      if (!this.isPlaying || this.currentPhase !== 'final_results') return

      const freq = baseFreq * triumphMelody[noteIndex % triumphMelody.length]
      const { osc, gain, filter } = this.createPad(freq, 0, 'triangle', 2500)

      // Brighter sound for celebration
      filter.Q.value = 2

      gain.gain.setValueAtTime(this.volume * 0.25, this.audioContext.currentTime)
      gain.gain.linearRampToValueAtTime(this.volume * 0.15, this.audioContext.currentTime + 0.2)
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5)

      osc.start()
      osc.stop(this.audioContext.currentTime + 0.6)
      this.nodes.push(osc)

      noteIndex++
      setTimeout(playNote, 250)
    }

    // Shimmer pad
    const { osc: shimmer, gain: shimmerGain } = this.createPad(baseFreq * 2, 0, 'sine', 3000)
    shimmerGain.gain.setValueAtTime(this.volume * 0.15, this.audioContext.currentTime)
    shimmer.start()
    this.nodes.push(shimmer)

    playNote()
  }
}

// Export singleton instance
export const musicManager = new MusicManager()

// Hook for React components
export function useMusic() {
  return musicManager
}

export default musicManager
