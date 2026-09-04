// Captures the README assets: one TV recording of the join flow (docs/img/join.gif,
// rendered from the recording with: ffmpeg -i <video> -t <promptVoteShown+2s> -vf
// "fps=12,scale=1280:720:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse"
// -loop 0 join.gif) plus TV and phone screenshots of every game phase.
//
// Run from the repo root while the production server is NOT needed:
//   npm run capture
// Spawns its own server on :3999 serving dist/ (isolated rooms, real Klipy key
// from .env), drives one host + two phones through a full round, then shuts down.
import { chromium } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMG = join(ROOT, 'docs/img')
const RAW = '/tmp/kwim-capture'
const PORT = 3999
const BASE = `http://localhost:${PORT}/kwim`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Klipy "previews" are 2-8MB GIFs each; a grid of them takes minutes to load,
// which starves the phone screenshot. For the shot we swap in real first-frame
// thumbnails instead: intercept, fetch once, shrink with ffmpeg, fulfill.
let thumbSeq = 0
function shrinkThumbnails(page) {
  return page.route(/static\.klipy\.com\//, async (route) => {
    // Every in-flight request needs its own scratch files. The whole grid is
    // fetched at once, and when they all shared one /tmp/kwim-thumb.gif they
    // overwrote each other mid-ffmpeg, so tiles came back blank.
    const id = thumbSeq++
    const raw = `/tmp/kwim-thumb-${id}.gif`
    const thumb = `/tmp/kwim-thumb-${id}.jpg`

    let bytes = null
    for (let attempt = 0; attempt < 3 && !bytes; attempt++) {
      try {
        const res = await fetch(route.request().url())
        if (res.ok) bytes = Buffer.from(await res.arrayBuffer())
      } catch { /* slow 8MB fetches drop now and then; retry */ }
    }
    if (!bytes) return route.continue()

    // Serve the original bytes if ffmpeg can't take a frame off this one.
    // Falling through to route.continue() here meant the browser went back to
    // the live 8MB GIF, which was still in flight at screenshot time — that is
    // why the same few tiles were blank in the README shot on every run.
    try {
      writeFileSync(raw, bytes)
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-frames:v', '1', '-vf', 'scale=252:200', thumb])
      return route.fulfill({ status: 200, contentType: 'image/jpeg', body: readFileSync(thumb) })
    } catch {
      return route.fulfill({ status: 200, contentType: 'image/gif', body: bytes })
    }
  })
}

// Wall-clock marks for every milestone, so the ffmpeg trim in scripts/gif.sh
// can cut the hero GIF between "lobby visible" and "prompt appears" without
// frame hunting.
const marks = { t0: Date.now() }
const mark = (name) => {
  marks[name] = Date.now()
  console.log(`[mark] ${name} +${((marks[name] - marks.t0) / 1000).toFixed(1)}s`)
}

async function startServer() {
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) },
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(BASE + '/')
      if (res.ok) return srv
    } catch {}
    await sleep(200)
  }
  throw new Error('server did not come up on :' + PORT)
}

async function joinPhone(browser, code, name, searchQuery) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/join/${code}`)
  await page.fill('#player-name', name)
  return { ctx, page, name, searchQuery }
}

async function searchAndSubmit(phone, screenshotPath) {
  const { page, searchQuery } = phone
  await page.fill('input[aria-label="Search GIFs"]', searchQuery)
  await page.click('button[aria-label="Search"]')
  if (screenshotPath) {
    await page
      .waitForFunction(
        () => {
          // Only the tiles actually in shot. `every` over the whole grid could
          // never be satisfied: everything below the fold is loading="lazy" and
          // stays incomplete, so the wait always timed out and the screenshot
          // was taken with holes in the grid.
          const imgs = [...document.querySelectorAll('.grid img')].slice(0, 12)
          return imgs.length >= 12 && imgs.every((i) => i.complete && i.naturalWidth > 0)
        },
        // waitForFunction is (fn, arg, options) — passing the options object in
        // the second slot made it the *argument*, so this silently ran on the
        // 30s default and the shot was taken while tiles were still blank.
        null,
        { timeout: 60000 }
      )
      .catch((e) => console.log('warn: thumbnails still loading, shooting anyway:', String(e).split('\n')[0]))
    await sleep(600)
    await page.screenshot({ path: screenshotPath })
  }
  await page.click('.grid img >> nth=0')
  const submit = page.getByRole('button', { name: /Submit GIF/ })
  await submit.waitFor({ timeout: 5000 })
  await submit.click()
}

async function voteForOtherMeme(phone) {
  const { page } = phone
  // Own meme is never rendered, so the only card is the one to vote for. The
  // last vote flips the room to results before the confirmation text can
  // render, so accept the phase change as success too.
  await page.locator('main button:has(img)').first().click()
  await Promise.race([
    page.getByText('Vote submitted', { exact: false }).waitFor({ timeout: 8000 }),
    page.getByText('Round Complete').waitFor({ timeout: 8000 }),
  ]).catch(() => {})
}

async function main() {
  mkdirSync(IMG, { recursive: true })
  rmSync(RAW, { recursive: true, force: true })
  mkdirSync(RAW, { recursive: true })

  const srv = await startServer()
  const browser = await chromium.launch({ args: ['--mute-audio'] })
  try {
    // TV: full 16:9 viewport, recorded for the hero GIF.
    const hostCtx = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir: RAW, size: { width: 1280, height: 720 } },
    })
    const host = await hostCtx.newPage()
    await host.goto(BASE + '/')
    await host.getByRole('button', { name: /Host Game/i }).click()
    // Lobby-phase URL is just /host; the code only lives in the page.
    const codeEl = host.locator('.room-code')
    await codeEl.waitFor()
    const code = (await codeEl.innerText()).trim()
    console.log('room code:', code)
    await host.getByText('Or scan').waitFor()

    // Phone 1 fills the join form (screenshot), joins; phone 2 follows.
    const p1 = await joinPhone(browser, code, 'Alex', 'celebration')
    await p1.page.waitForSelector('#player-name')
    mark('joinFormFilled')
    await sleep(600)
    const p2 = await joinPhone(browser, code, 'Sam', 'fail')
    await p2.page.waitForSelector('#player-name')
    await sleep(400)
    await p2.page.screenshot({ path: join(IMG, 'phone-join.png') })
    try {
      await p1.page.getByRole('button', { name: /Join Game/ }).click()
      await p1.page.waitForURL(/\/play\//, { timeout: 10000 })
    } catch (e) {
      await p1.page.screenshot({ path: join(RAW, 'p1-join-fail.png') })
      const banner = await p1.page.locator('body').innerText().catch(() => '')
      console.log('P1 JOIN FAILED. Page text:\n', banner.slice(0, 600))
      throw e
    }
    await sleep(1800) // player card pops in on the TV
    await p2.page.getByRole('button', { name: /Join Game/ }).click()
    await p2.page.waitForURL(/\/play\//)
    mark('bothJoined')
    await sleep(1800)

    // Lobby shot: code, QR and both players on the TV.
    await host.screenshot({ path: join(IMG, 'host-lobby.png') })

    await host.getByRole('button', { name: /Start Game/i }).click()
    mark('startClicked')

    // Prompt vote: phone screenshot first, then both vote option 1.
    await p1.page.getByText('Vote for a Prompt').waitFor({ timeout: 15000 })
    mark('promptVoteShown')
    await sleep(800)
    await p1.page.screenshot({ path: join(IMG, 'phone-vote.png') })
    await p1.page.locator('[data-prompt-index="0"]').click()
    await p2.page.locator('[data-prompt-index="0"]').click()

    // GIF search.
    await p1.page.waitForSelector('input[aria-label="Search GIFs"]', { timeout: 15000 })
    mark('gifSearchShown')
    // GIF search: only the screenshot phone gets the thumbnail shortcut; the
    // other phone just picks whatever loads first, it needs no pixels.
    shrinkThumbnails(p1.page)
    await searchAndSubmit(p1, join(IMG, 'phone-search.png'))
    await searchAndSubmit(p2)

    // Presentation: memes on the TV, host clicks through.
    await host.getByRole('button', { name: /Next Meme/ }).waitFor({ timeout: 20000 })
    mark('presentationShown')
    await sleep(2500)
    await host.screenshot({ path: join(IMG, 'host-round.png') })
    await host.getByRole('button', { name: /Next Meme|Start Voting/ }).click()

    // Voting on phones, then results on the TV (results phase only holds 8s).
    await p2.page.getByRole('heading', { name: /Vote for the Best Meme/ }).waitFor({ timeout: 20000 })
    mark('votingShown')
    await sleep(800)
    // Submissions arrive in join order; each phone only sees the other's meme.
    await voteForOtherMeme(p2)
    await voteForOtherMeme(p1)
    await host.getByRole('button', { name: /Next Round|See Final Results/ }).waitFor({ timeout: 25000 })
    mark('resultsShown')
    await sleep(1800) // let the results view finish its fade-in
    await host.screenshot({ path: join(IMG, 'host-results.png') })

    // Closing the context flushes the recording before the server dies.
    await hostCtx.close()
    mark('videoFlushed')
    writeFileSync(join(RAW, 'marks.json'), JSON.stringify(marks, null, 2))
    console.log('done. video + marks in', RAW)
  } finally {
    await browser.close()
    srv.kill('SIGTERM')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
