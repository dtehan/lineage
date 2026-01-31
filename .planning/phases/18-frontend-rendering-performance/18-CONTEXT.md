# Phase 18: Frontend Rendering Performance - Context

**Gathered:** 2026-01-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Benchmark and optimize ELK.js layout calculation and React Flow rendering for large graphs (100+ nodes). Ensure graphs remain interactive and responsive through profiling, targeted optimization, and smart UX patterns.

</domain>

<decisions>
## Implementation Decisions

### Performance Targets
- **Priority:** Interaction responsiveness over initial load speed
- **Responsiveness threshold:** <100ms for zoom/pan/selection interactions (silky smooth)
- **Warning threshold:** Warn users when graphs exceed 200 nodes before rendering
- **Initial load target:** Soft target of 3-5 seconds (aim for reasonable load time but optimize interactions first)

### Optimization Strategy
- **Approach:** Profile both ELK layout and React Flow rendering, then focus on the bigger bottleneck
- **Benchmark reusability:** Create automated benchmark suite for future regression testing (can run in CI or locally)

### User Experience During Optimization
- **Large graph handling:** Always render with detailed progress indicator (no blocking warnings or automatic fallbacks)
- **Progress indicator:** Enhance Phase 13 progress UI with ETA/time estimates for large graphs
- **Struggling user assistance:** Suggest reducing depth when graphs are large ("Graph is large. Try depth 5 instead of 10?" with quick-apply button)
- **Optimization visibility:** Transparent to users — just faster graphs, no feature flags or visible optimization work

### Claude's Discretion
- Universal vs threshold-based optimizations (choose based on benchmark results)
- React Flow's onlyRenderVisibleElements verification approach (prioritize based on findings)
- Exact progress granularity and stage breakdown for large graphs
- When/how to show depth reduction suggestions based on performance data

</decisions>

<specifics>
## Specific Ideas

- Automated benchmark suite should be runnable in CI and locally (enables regression detection)
- 200+ node warning as preventive measure, but always allow rendering
- ETA estimates in progress bar should feel helpful, not anxiety-inducing

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-frontend-rendering-performance*
*Context gathered: 2026-01-31*
