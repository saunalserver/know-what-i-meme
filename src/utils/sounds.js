// Sound effects utility using Web Audio API
// Generates synthesized sounds without external files

class SoundManager {
  constructor() {
    this.audioContext = null
    this.enabled = true
    this.volume = 0.3
  }

  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    }
    // Resume if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume))
  }

  // Play a tone with given frequency and duration
  playTone(frequency, duration = 0.1, type = 'sine', volumeMultiplier = 1) {
    if (!this.enabled) return
    this.init()

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.audioContext.destination)

    oscillator.frequency.value = frequency
    oscillator.type = type

    const now = this.audioContext.currentTime
    gainNode.gain.setValueAtTime(this.volume * volumeMultiplier, now)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration)

    oscillator.start(now)
    oscillator.stop(now + duration)
  }

  // UI click sound
  click() {
    this.playTone(800, 0.05, 'sine', 0.5)
  }

  // Selection sound (higher pitch)
  select() {
    this.playTone(600, 0.08, 'sine', 0.4)
    setTimeout(() => this.playTone(900, 0.08, 'sine', 0.3), 50)
  }

  // Success/positive sound
  success() {
    this.playTone(523, 0.15, 'sine', 0.5)  // C5
    setTimeout(() => this.playTone(659, 0.15, 'sine', 0.5), 100)  // E5
    setTimeout(() => this.playTone(784, 0.2, 'sine', 0.5), 200)  // G5
  }

  // Error/negative sound
  error() {
    this.playTone(200, 0.2, 'square', 0.3)
    setTimeout(() => this.playTone(150, 0.3, 'square', 0.3), 150)
  }

  // Timer countdown tick
  tick() {
    this.playTone(1000, 0.03, 'sine', 0.3)
  }

  // Timer urgent (10 seconds)
  timerUrgent() {
    this.playTone(800, 0.1, 'triangle', 0.5)
  }

  // Timer critical (5 seconds)
  timerCritical() {
    this.playTone(600, 0.15, 'sawtooth', 0.6)
  }

  // Timer final second
  timerFinal() {
    this.playTone(400, 0.2, 'square', 0.7)
  }

  // Phase transition whoosh
  whoosh() {
    this.init()
    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.audioContext.destination)

    oscillator.type = 'sine'
    const now = this.audioContext.currentTime
    oscillator.frequency.setValueAtTime(300, now)
    oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.15)

    gainNode.gain.setValueAtTime(this.volume * 0.3, now)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

    oscillator.start(now)
    oscillator.stop(now + 0.2)
  }

  // Winner celebration fanfare
  celebration() {
    const notes = [
      { freq: 523, delay: 0 },      // C5
      { freq: 659, delay: 100 },    // E5
      { freq: 784, delay: 200 },    // G5
      { freq: 1047, delay: 300 },   // C6
      { freq: 784, delay: 450 },    // G5
      { freq: 1047, delay: 550 },   // C6
    ]

    notes.forEach(note => {
      setTimeout(() => this.playTone(note.freq, 0.2, 'sine', 0.6), note.delay)
    })
  }

  // Player join sound
  playerJoin() {
    this.playTone(440, 0.1, 'sine', 0.4)
    setTimeout(() => this.playTone(554, 0.1, 'sine', 0.3), 80)
  }

  // Vote received
  voteReceived() {
    this.playTone(700, 0.05, 'sine', 0.3)
  }

  // Round complete
  roundComplete() {
    this.playTone(523, 0.1, 'triangle', 0.4)
    setTimeout(() => this.playTone(659, 0.15, 'triangle', 0.4), 100)
  }

  // Countdown for game start
  countdown(number) {
    const freq = 400 + (number * 100)
    this.playTone(freq, 0.15, 'sine', 0.5)
  }
}

// Export singleton instance
export const soundManager = new SoundManager()

// Hook for React components
export function useSound() {
  return soundManager
}

export default soundManager
