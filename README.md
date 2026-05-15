# Lifting Lens

A mobile-first PWA for powerlifters that records a set, analyzes bar motion from video, estimates rep velocities, and optionally compares results against an imported training program.

## What it does

- **Quick Analyze**: Record a set → optional calibration → tap the bar to set a tracking marker → deterministic velocity analysis → rep-by-rep results with coaching feedback.
- **Program Mode**: Import a CSV/XLSX training program → pick week/day → see today's exercises → analyze sets against program targets → load recommendations.
- **Local-first**: All data stored in IndexedDB — no account, no server, no API keys required.
- **Calibration**: Click two points on a known distance (e.g., plate diameter) to get m/s estimates. Without calibration, relative velocity is shown instead.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173 in a browser. For camera access on mobile, use HTTPS (see deployment below) or the local network address with a trusted cert.

## Build

```bash
npm run build
```

Output goes to `dist/`. Zero TypeScript errors required.

## Deployment

### Cloudflare Pages
1. Push this repo to GitHub.
2. In Cloudflare Pages, connect the repo.
3. Set build command: `npm run build`
4. Set output directory: `dist`
5. Deploy. Camera access works over HTTPS automatically.

### Vercel
1. `npm i -g vercel && vercel`
2. Framework: Vite. Build command: `npm run build`. Output: `dist`.
3. Deploy. Works over HTTPS out of the box.

### Self-hosted
Serve the `dist` folder from any static host. For camera access on non-localhost origins, HTTPS is required by browsers.

## How to test Quick Analyze

1. Open the app → tap **Quick Analyze**
2. Select a lift (e.g., Squat)
3. Tap **Enable Camera** → grant permission → tap **Record Set**
4. Perform a set of reps → tap **Stop**
5. Tap **Analyze This Set**
6. **Calibrate** (optional): tap two points across a known distance (e.g., across a plate) → confirm
7. **Or** tap **Skip (Relative Only)** for unitless output
8. On the analyzer screen, tap the bar sleeve/collar in the video frame
9. Tap **Run Analysis** → wait for frame extraction + tracking
10. View rep-by-rep velocity, velocity loss, and coaching recommendation
11. Enter your perceived RPE for more accurate recommendations
12. Tap **Save Set** to store to history

## How to test Program Mode

1. Open the app → tap **Program Mode**
2. Tap **Upload File** and select a CSV with columns: `Week,Day,Exercise,Sets,Reps,Load,RPE`
   - Or use **Paste Text** and paste example data
3. Review the preview → tap **Save & Use Program**
4. Pick your week and day
5. Tap the **►** button next to an exercise to analyze a set
6. Follow the same record → calibrate → analyze → results flow
7. Results will show program target and load recommendation

### Sample CSV for testing

```csv
Week,Day,Exercise,Sets,Reps,Load,RPE,Notes
1,1,Squat,3,5,185lb,7,comp style
1,1,Bench,3,5,135lb,7,
1,1,Deadlift,1,3,225lb,8,
1,2,Squat,4,3,205lb,8,paused
1,2,Overhead Press,3,8,95lb,7,
```

## Limitations

- **Video velocity is approximate.** Accuracy depends on: camera angle (side view is best), frame rate, lighting, marker visibility, and calibration.
- **No LLM in the hot path.** Velocity is computed deterministically from pixel displacement and frame timestamps.
- **Tracking algorithm is basic patch matching** — works best with high-contrast markers (bar sleeve, collar, chalk mark) against a stable background.
- **Rep segmentation** relies on peak/valley detection in the tracked Y position. Fast or partial reps may not be detected.
- **Calibration**: side-on camera angle is required for accurate m/s estimation. Angled shots will introduce error.
- **No cloud sync** — data is browser-local. Clearing browser data removes history.

## Future AI integration plan

`src/lib/program/mockAiParser.ts` is the integration point for AI-assisted program parsing. The interface is:

```ts
mockAiParser(rows: Record<string, string>[], sourceName: string): Program | null
```

Future options (all offline-capable):
- **Ollama + Gemma/Llama**: replace mock with a local HTTP call to `localhost:11434`
- **E2B sandbox**: run a small Python script with an LLM in an isolated cloud sandbox
- **Claude API**: call via the Anthropic SDK with `claude-haiku-4-5` for cost-effective parsing

The rest of the app (tracking, segmentation, UI) is model-agnostic and already works.
