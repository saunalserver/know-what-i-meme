// GIFs this player has already picked, so the grid keeps offering fresh ones
// across rounds. Lives outside the component: the search UI unmounts between
// rounds, and the history should not.
export const seenGifIds = new Set()

export function rememberGif(id) {
  seenGifIds.add(String(id))
}

export function clearGifHistory() {
  seenGifIds.clear()
}
