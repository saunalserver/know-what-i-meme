// Where to send players who scan the QR code.
//
// Preference order:
//   1. VITE_PUBLIC_URL, if the deployment has a public address configured.
//      Players' phones may be on mobile data, and the camera for profile
//      pictures only works over HTTPS.
//   2. Whatever origin the host is already viewing -- correct for LAN and
//      Tailscale play, and for any deployment that never set the variable.
const CONFIGURED_BASE = import.meta.env.VITE_PUBLIC_URL?.trim()

export function getJoinBaseUrl() {
  if (CONFIGURED_BASE) return CONFIGURED_BASE.replace(/\/+$/, '')

  const { origin } = window.location
  // BASE_URL is '/kwim/' in production builds, '/' in dev.
  return `${origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '')
}

export function getJoinUrl(code) {
  return `${getJoinBaseUrl()}/join/${code}`
}

export default getJoinUrl
