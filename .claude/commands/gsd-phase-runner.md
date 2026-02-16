---
name: gsd-phase-runner
description: Execute all plans in a phase with wave-based parallelization
argument-hint: "<phase-number> [--gaps-only]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TodoWrite
  - AskUserQuestion
---
<objective>
run the gsd-phase-runner-agent subagent, passing through all arguments and flags, to execute all plans in a phase using wave-based parallel execution.

</objective>

<execution_context>

</execution_context>

<context>
Phase: $ARGUMENTS

**Flags:**
- `--gaps-only` — Execute only gap closure plans (plans with `gap_closure: true` in frontmatter). Use after verify-work creates fix plans.

@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<process>
Execute the gsd-phase-runner-agent subagent, passing through all arguments and flags, to execute all plans in a phase using wave-based parallel execution.    
</process>
