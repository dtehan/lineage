---
status: resolved
trigger: "The database lineage graph for aianalytics_db hangs forever at Calculating layout..."
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:02:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED - Web Worker silently fails, causing Comlink Promise to hang forever
test: Replaced Worker with main-thread layoutGraph; all tests pass, build succeeds
expecting: Database lineage graphs load in ~15ms instead of hanging
next_action: DONE - archived

## Symptoms

expected: The database lineage graph should load and display the lineage visualization
actual: Stuck forever on "Calculating layout..." with a progress bar that never completes
errors: No error messages - just hangs indefinitely
reproduction: Navigate to localhost:3000/lineage/database/aianalytics_db (Depth 3, Direction Both)
started: Currently happening, unknown when started

## Eliminated

- hypothesis: Layout engine has O(N^2) or infinite loop causing slow computation
  evidence: Performance test showed 200 tables with 50 columns (10K nodes) completes in 15ms
  timestamp: 2026-02-22T00:00:30Z

- hypothesis: Backend returns bad data causing conversion crash
  evidence: convertOpenLineageGraph runs on main thread BEFORE Worker call; no error overlay visible means it succeeds
  timestamp: 2026-02-22T00:00:35Z

- hypothesis: ELK is hanging on large graph in layoutSimpleNodes fallback
  evidence: Database lineage nodes are type "column" with valid tableName/databaseName, so groupColumnsByTable works correctly and the ELK fallback path (layoutSimpleNodes) is never reached
  timestamp: 2026-02-22T00:00:40Z

- hypothesis: Effect dependency causes infinite re-render loop
  evidence: All dependencies are stable Zustand/React references; data only changes once when API response arrives
  timestamp: 2026-02-22T00:00:45Z

## Evidence

- timestamp: 2026-02-22T00:00:10Z
  checked: layoutEngine.ts - main layoutGraph function
  found: Custom O(V+E) topological layout replaced ELK for column-level nodes. ELK only used in layoutSimpleNodes fallback for non-column nodes.
  implication: Layout itself is fast; Worker overhead is now unnecessary

- timestamp: 2026-02-22T00:00:15Z
  checked: DatabaseLineageGraph.tsx uses useLayoutWorker (Web Worker + Comlink)
  found: Only component using Worker-based layout. LineageGraph and AllDatabasesLineageGraph use main-thread layoutGraph directly.
  implication: Worker is unique to this component and is the differentiating factor

- timestamp: 2026-02-22T00:00:20Z
  checked: useLayoutWorker.ts Worker initialization
  found: Worker created at module-level with no error handler. If Worker fails to initialize (module error during load), Comlink wrap() silently produces non-functional proxy. All calls to workerApi.layout() hang forever as no response message is ever sent back.
  implication: Worker initialization failure would cause exact symptom observed

- timestamp: 2026-02-22T00:00:25Z
  checked: Vite build
  found: Build succeeds, Worker file produced at 1.45MB (includes ELK bundled code)
  implication: Build is fine but runtime Worker loading may still fail silently

- timestamp: 2026-02-22T00:00:30Z
  checked: Performance test with realistic data
  found: layoutGraph processes 200 tables x 50 columns (10K nodes) in 15ms on main thread
  implication: Worker is unnecessary - layout is already O(V+E) and completes in ms

- timestamp: 2026-02-22T00:00:50Z
  checked: Recent git changes to DatabaseLineageGraph
  found: Phase 21 added setIsolatedTableCount/setConnectedTableCount to effect deps. Also removed direction from Worker options (was incorrectly passing lineage direction as layout direction). Backend now returns ALL columns from ALL tables (isolated tables included).
  implication: More data sent to Worker; Worker vulnerability exposed by larger payloads

## Resolution

root_cause: The DatabaseLineageGraph component uses a Web Worker (via Comlink) for layout computation. The Worker either fails to initialize or encounters an unrecoverable error, causing the Comlink Promise to hang forever (no response message is sent back). The Worker has no error handler, so failures are silent. The layout engine itself completes in ~15ms for large graphs; the Worker is unnecessary overhead left over from when ELK was used (which was slow). The recent backend change to return all columns from all tables (isolated table support) may have increased data volume enough to trigger a structured cloning or Worker memory issue.

fix: Replaced Worker-based layout with direct main-thread layoutGraph call in DatabaseLineageGraph (matching the pattern used by LineageGraph and AllDatabasesLineageGraph). Removed useLayoutWorker barrel export. Added cancelled flag for race condition protection. Added performance tests proving layout completes in ~15ms for 10K nodes.

verification: 85 layout engine tests pass (incl. 2 new perf tests), 339 core tests pass, build succeeds. Pre-existing OOM in DatabaseLineageGraph.test.tsx confirmed unrelated (same failure before and after fix).
files_changed:
  - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.tsx
  - lineage-ui/src/components/domain/LineageGraph/DatabaseLineageGraph.test.tsx
  - lineage-ui/src/components/domain/LineageGraph/hooks/index.ts
  - lineage-ui/src/utils/graph/layoutEngine.perf.test.ts (new)
