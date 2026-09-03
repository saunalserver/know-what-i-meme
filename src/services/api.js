// Base URL for the game's HTTP API.
//
// In production the app is served under /kwim behind a reverse proxy, so the
// API lives on the same origin under the same prefix. In development the page
// comes from Vite on :5173 and the API from the backend on :3002.
export const API_URL = (() => {
  const { protocol, hostname, port, origin } = window.location

  if (protocol === 'https:') {
    // Behind the proxy: same origin, same base path.
    return `${origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '')
  }

  // Plain HTTP: the backend serves both the API and (in production) the app.
  const base = port === '5173' ? `${protocol}//${hostname}:3002` : origin
  return `${base}${import.meta.env.PROD ? '/kwim' : ''}`.replace(/\/+$/, '')
})()

export async function fetchJson(path, { signal } = {}) {
  const res = await fetch(`${API_URL}${path}`, { signal })
  if (!res.ok) {
    // The server sends { error } for anything it handled deliberately.
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Request failed (${res.status})`)
  }
  return res.json()
}

export default fetchJson
