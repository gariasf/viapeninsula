# Checks and resources

How much checking a ticket needs, and how to spend the Mac, the browser and tokens. The maintainer set these rules on 12 Oct 2026, from measurements of the four days before:
- agents spent 24% of their time waiting;
- on one day, they spent 18.5 agent-hours waiting for a single browser slot;
- agents that grew to 900k tokens of context used billions of cache-read tokens.

## Budgets

1. **Two building sessions at most**, one per lane (`roadmap.md`).
2. **Keep an agent's context under 200k tokens.** Every turn re-reads the whole context, so an agent at 900k pays about 900k a turn.
   - Past 400k, the agent writes a **hand-off** file: the state, what's left, and where things are. Then it stops, and a fresh agent continues from the hand-off.
3. **Size the pipeline to the ticket.**
   - The default is build, review, ship.
   - A measure agent joins only for perf or visual tickets.
   - A cluster counts as one ticket.

## Checks by ticket type

Every ticket runs `npm run check`, `npx vitest run --dir src` and the review. Then:

| Ticket type | Add | Leave out |
|---|---|---|
| **Node-only**: fetcher, engine rules, record and replay tools | A Node replay (`npm run card-vs-map`, recordings) when motion or Delay rules change | Browser, screenshots, perf, dry runs |
| **Data and build**: `src/build`, `networks.ts`, `bundle.ts`, `pieces.ts` | A dry run of the regions it touches, against the shared main baseline. A byte-compare of the other regions and the report's diff. One view per changed spot, where the drawn output changes | Perf, screenshot sets |
| **Page logic**: `src/web` with no visual change | One browser smoke at 390×844: the page loads, then the console, `pageerror`, and the ticket's flow. Node checks for the data it builds | Screenshot sets, perf, dry runs |
| **Visual**: style expressions, labels, strokes, pills, colours | Screenshots of the changed spots only: 390×844 and 1280×800, light and dark, plus hover and focus where they apply. A pixel diff against main where nothing else should change | Perf (unless it adds layers or per-feature work), dry runs |
| **Perf** | `npm run perf` on milestone 0's harness, which takes all three browser slots. Before and after in one batch, three runs each, medians, and the phone at 4× CPU | Screenshots beyond one or two |
| **Docs and research notes**: only CI's Check, instead of the line above | A review that re-derives the numbers with its own scripts | Browser, dry runs, the code-review skill |

- **Measure what the acceptance criteria name, and only that.**
- **When a check can't run** (no browser slot, or a recording still to come), report it as not run and give its script.

## The browser and the Mac

- **Draw map pages on the M4's GPU.** Use full Chromium from `~/Library/Caches/ms-playwright/chromium-1223`, with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`.
  - One hardware page uses about 93% CPU, and three use 446% in all.
  - The headless shell (`chromium_headless_shell`) draws WebGL in software, at 737–839% CPU for one page.
- **Open each page in its own browser context.** Pages that share a context crawl at 3–7 fps unless they're in front.
- **Take a browser slot through the harness's waiter.** It has three slots, and a perf run takes all three. Until milestone 0's harness lands, take one lock and use at most one browser per session.
- **Compare before and after in one batch**, alternating the runs, and note the load average. After 15 minutes waiting for a slot, report the check as not run.
- **Use the browsers already cached.** `npx playwright install` prunes that shared cache.
- **When done**, close browsers, preview servers and Playwright MCP servers, and remove worktrees and scratch bundles.

## Waiting and tokens

- **Wait on notifications.** Run a long job in the background and act when it reports. A `sleep` or `until` loop is a turn that re-reads the whole context on every poll.
- **Ship agents merge and stop.** The coordinating session checks the deploy and the live site once per wave of merges. It also closes the tickets whose last box is a live check.
- **Share one main baseline for dry runs** per build tree and date, rather than rebuilding main to compare against: `npm run -s baseline` prints its out/, and `--region <id>` builds only the regions a change touches (README, #730).
- **Keep big outputs out of context.**
  - Aggregate with scripts, and read big files by offset and limit.
  - Keep an agent's report to 250 words, and put the rest in files.
