import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Avatars are never shown larger than a couple of hundred pixels, and every
// photo is rebroadcast to every device inside the game state -- so the capture
// is cropped square and scaled down before it leaves the phone.
const AVATAR_SIZE = 256
const JPEG_QUALITY = 0.75

function CameraModal({ isOpen, onClose, onCapture }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  // The live stream lives in a ref as well as state: cleanup runs with the
  // values captured when the effect ran, and a state-only stream was still
  // null there -- which left the camera light on after closing the modal.
  const streamRef = useRef(null)
  const [videoReady, setVideoReady] = useState(false)
  const [error, setError] = useState(null)
  const [facingMode, setFacingMode] = useState('user')

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      return
    }

    let cancelled = false
    // Set from the video element's own events, never from this effect body.

    const startCamera = async () => {
      setError(null)
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        })

        // The modal may have closed while the permission prompt was up.
        if (cancelled) {
          mediaStream.getTracks().forEach(track => track.stop())
          return
        }

        streamRef.current = mediaStream
        if (videoRef.current) videoRef.current.srcObject = mediaStream
      } catch (err) {
        if (cancelled) return
        console.error('Camera error:', err)
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access.')
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.')
        } else if (err.name === 'NotReadableError') {
          setError('Camera is already in use by another app.')
        } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
          setError('The camera needs HTTPS. Open the game over its https:// address.')
        } else {
          setError(`Camera error: ${err.message}`)
        }
      }
    }

    startCamera()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [isOpen, facingMode, stopCamera])

  const handleCapture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return

    // Centre-crop to a square, then scale to avatar size.
    const side = Math.min(video.videoWidth, video.videoHeight)
    const sx = (video.videoWidth - side) / 2
    const sy = (video.videoHeight - side) / 2

    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    canvas.getContext('2d').drawImage(video, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)

    stopCamera()
    onCapture(dataUrl)
    onClose()
  }

  const handleClose = () => {
    stopCamera()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-dark-secondary rounded-2xl overflow-hidden max-w-md w-full"
          >
            <div className="flex items-center justify-between p-4 border-b border-dark-tertiary">
              <h2 className="text-xl font-bold text-white">Take a Photo</h2>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="text-text-secondary hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="relative bg-black aspect-square">
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                  <div>
                    <div className="text-5xl mb-4">📷</div>
                    <p className="text-error mb-2">{error}</p>
                    <p className="text-text-muted text-sm">
                      No problem — you'll get a coloured initial instead.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onCanPlay={() => setVideoReady(true)}
                    onEmptied={() => setVideoReady(false)}
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-8 border-2 border-white/30 rounded-full" />
                  </div>
                </>
              )}
            </div>

            <div className="p-4 flex items-center justify-center gap-6">
              <button
                onClick={() => setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'))}
                disabled={!!error}
                aria-label="Flip camera"
                className="w-12 h-12 rounded-full bg-dark-tertiary flex items-center justify-center text-xl disabled:opacity-50"
              >
                🔄
              </button>

              <button
                onClick={handleCapture}
                disabled={!!error || !videoReady}
                aria-label="Take photo"
                className="w-16 h-16 rounded-full bg-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-12 h-12 rounded-full border-4 border-dark-primary" />
              </button>

              <button
                onClick={handleClose}
                aria-label="Cancel"
                className="w-12 h-12 rounded-full bg-dark-tertiary flex items-center justify-center text-xl"
              >
                ✕
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CameraModal
