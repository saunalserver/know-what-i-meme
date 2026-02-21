import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function CameraModal({ isOpen, onClose, onCapture }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [facingMode, setFacingMode] = useState('user') // 'user' for front camera, 'environment' for back

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [isOpen, facingMode])

  const startCamera = async () => {
    setError(null)
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (err) {
      console.error('Camera error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access.')
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.')
      } else if (err.name === 'NotReadableError') {
        setError('Camera is already in use by another application.')
      } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        setError('Camera requires HTTPS. Please access the game via HTTPS URL.')
      } else {
        setError(`Camera error: ${err.message}`)
      }
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // Set canvas size to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to data URL (base64)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)

    // Stop camera and close modal
    stopCamera()
    onCapture(dataUrl)
    onClose()
  }

  const toggleCamera = () => {
    stopCamera()
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
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
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-dark-tertiary">
              <h2 className="text-xl font-bold text-white">Take a Photo</h2>
              <button
                onClick={handleClose}
                className="text-text-secondary hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Camera view */}
            <div className="relative bg-black aspect-[3/4]">
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                  <div>
                    <div className="text-5xl mb-4">📷</div>
                    <p className="text-error mb-2">{error}</p>
                    <p className="text-text-muted text-sm">
                      You can still use a URL instead
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
                    className="w-full h-full object-cover"
                    onCanPlay={() => {
                      if (videoRef.current) {
                        videoRef.current.play()
                      }
                    }}
                  />
                  {/* Hidden canvas for capturing */}
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Camera overlay guide */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-8 border-2 border-white/30 rounded-full" />
                  </div>
                </>
              )}
            </div>

            {/* Controls */}
            <div className="p-4 flex items-center justify-center gap-6">
              {/* Flip camera button */}
              <button
                onClick={toggleCamera}
                disabled={!!error}
                className="w-12 h-12 rounded-full bg-dark-tertiary flex items-center justify-center text-xl disabled:opacity-50"
                title="Flip camera"
              >
                🔄
              </button>

              {/* Capture button */}
              <button
                onClick={handleCapture}
                disabled={!!error || !stream}
                className="w-16 h-16 rounded-full bg-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                title="Take photo"
              >
                <div className="w-12 h-12 rounded-full border-4 border-dark-primary" />
              </button>

              {/* Cancel button */}
              <button
                onClick={handleClose}
                className="w-12 h-12 rounded-full bg-dark-tertiary flex items-center justify-center text-xl"
                title="Cancel"
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
