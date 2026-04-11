# Ralph Agent Instructions

You are an autonomous coding agent building a Chrome extension called "Tab Brain".

## Project Context

- **Project type**: Chrome Extension (Manifest V3)
- **Language**: Plain JavaScript (no TypeScript, no build tools)
- **Architecture**: service-worker.js + side panel + options page + lib/ modules
- **All project files live in the repo root** (manifest.json at root level)

## Your Task

1. Read the PRD at `scripts/ralph/prd.json`
2. Read the progress log at `scripts/ralph/progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (see below)
7. Update CLAUDE.md files if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD (`scripts/ralph/prd.json`) to set `passes: true` for the completed story
10. Append your progress to `scripts/ralph/progress.txt`

## Quality Checks for This Project

Since this is a plain JS Chrome extension with no build tools:

1. **Syntax check**: Run `node --check <file>` on all changed .js files to verify no syntax errors
2. **Manifest validation**: Ensure manifest.json is valid JSON (`node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"`)
3. **No console.error in code**: Ensure no accidental console.error or debugger statements left in
4. **File references**: Verify all files referenced in manifest.json actually exist

There is no typecheck, linter, or test suite. The acceptance criterion "No JavaScript errors in console" means: verify there are no syntax errors via `node --check`.

## Chrome Extension Specifics

- **Manifest V3**: Use `"type": "module"` in manifest service_worker config to enable ES module imports
- **Service worker**: Background script, no DOM access. Use `chrome.runtime.onMessage` for communication.
- **Side panel**: Has DOM access. Communicates with service worker via `chrome.runtime.sendMessage`.
- **Permissions needed**: tabs, tabGroups, sidePanel, storage, activeTab
- **Chrome Tab Group colors**: grey, blue, red, yellow, green, pink, purple, cyan, orange (only these are valid)
- **IndexedDB**: Available in both service worker and side panel contexts

## Progress Report Format

APPEND to scripts/ralph/progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of scripts/ralph/progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

```
## Codebase Patterns
- Use ES module imports in service worker (type: module in manifest)
- chrome.tabs.group() requires tab IDs array, returns group ID
- chrome.tabGroups.update() takes group ID + {title, color}
- IndexedDB transactions: use 'readwrite' for puts, 'readonly' for gets
```

Only add patterns that are **general and reusable**, not story-specific details.

## Update CLAUDE.md Files

Before committing, check if any edited files have learnings worth preserving in nearby CLAUDE.md files:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing CLAUDE.md** - Look for CLAUDE.md in those directories or parent directories
3. **Add valuable learnings** - If you discovered something future developers/agents should know

**Do NOT add:**
- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

Only update CLAUDE.md if you have **genuinely reusable knowledge** that would help future work in that directory.

## Quality Requirements

- ALL commits must pass syntax checks (`node --check` on all .js files)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns from previous iterations

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in scripts/ralph/progress.txt before starting
