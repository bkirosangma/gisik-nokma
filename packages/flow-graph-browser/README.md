# flow-graph-browser

Real-browser harness for the time and flow surfaces of the Workflow and Timeline graphs (spec `docs/superpowers/specs/2026-10-03-workflow-timeline-graphs-design.md`, Part 1). Private; never published. Same shape as `packages/knowledge-graph-browser`: a Vite page per scene, Playwright driving Chromium against the BUILT `@gisik-nokma/app-core`, `@gisik-nokma/viewport` and `@gisik-nokma/ui`.

Port `FG_PW_PORT`, else **3192**; the gate uses 3292 and `ctl run-tests` a free port (`scripts/ctl/README.md`, "Playwright ports"). Never 3190 (G-9's harness), 3191 (the Knowledge Graph's) or 3001 (the dev stack).

## Run

```bash
pnpm turbo run build --filter=@gisik-nokma/flow-graph-browser^...   # the harness reads dist, never src
/Users/kiro/my_projects/gisik-nokma-lanes/slot-run.sh fgb -- pnpm --filter @gisik-nokma/flow-graph-browser test
```

Headless Chromium composites in software. A headless number is a **floor and never the bar**: the bars (spec section 13) are read from `FG_HEADED=1` runs on the owner's machine and from a real phone. A report quotes a headless run as `LOCAL, headless` and never as a pass.

```bash
FG_HEADED=1 pnpm --filter @gisik-nokma/flow-graph-browser test          # real window, GPU compositing
pnpm --filter @gisik-nokma/flow-graph-browser exec vite --host            # then open on the phone:
#   http://<lan-ip>:3192/stress.html?scene=time&n=600&auto=1
#   http://<lan-ip>:3192/stress.html?scene=view&n=2000&auto=1
#   http://<lan-ip>:3192/timeline-stress.html?scene=phone        (tap Run; Part 4 T2, case 29.302)
```

A page run posts its record to `/__results`, which appends a line to `test-results/stress.jsonl` (ignored by the root `.gitignore` on every branch; Playwright keeps its own output in `test-results/pw/`, so a test run does not clear the records) after `parseResult` accepts it. `harness/bars.ts` holds the section 13 bars as data; `judge(record)` lists the reasons a record misses its bar.

## Scenes

| Page | What it mounts |
|---|---|
| `stress.html?scene=time&n=` | n absolutely placed bars in a native scroller (the Home Timeline shape) |
| `stress.html?scene=flow&n=` | n nodes and about 1.3 edges each under one transformed layer (the Workflow and Timeline graph shape) |
| `stress.html?scene=view&n=` | the product's own `TimelineView` at n dated tickets |
| `timeline-stress.html?scene=desktop\|phone` | the Home-shaped Timeline graph scene (10,000 bars on desktop, 11,000 on the phone) in the product's scroller, `attachDriver` and `TimelinePainter`; `window.__tlg.run(mode)` pans 10 viewports and answers fps, worst frame, mounted bars and short frames (`tests/timeline-stress.spec.ts`, cases 29.300–29.302); added by Part 4 T2 |
| `timeline.html?n=&span=&theme=` | the product's `TimelineView`, for the behaviour specs (`tests/timeline*.spec.ts`); added by Part 1 T10 |
| `camera.html` | a `CameraAdapter` over a transformed layer (`tests/camera.spec.ts`); added by Part 1 T7 |
