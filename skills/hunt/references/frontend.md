# Frontend (Code-Level)

React / SSR bugs found by reading source files. For runtime browser testing, see browser.md.

## React State Bugs

### Stale State in Closures
- `useEffect`/`useCallback` referencing state not in dependency array
- Event handlers capturing state at render time — stale if state changes before handler fires
- `setInterval` callbacks referencing state captured at creation time

### Missing useEffect Cleanup
- `setInterval` without `clearInterval` in cleanup return
- `addEventListener` without `removeEventListener`
- Fetch calls updating state without checking if component still mounted

### Dependency Array Issues
- Empty `[]` when effect uses props/state (runs once but should re-run)
- Missing dependencies (ESLint rule suppressed with `eslint-disable`)
- Object/array deps that change identity every render (need `useMemo`)

### State Update Patterns
- `setState(state + 1)` instead of `setState(prev => prev + 1)` (race with rapid updates)
- Setting state in render (infinite loop)
- Circular: updating state in useEffect that depends on that state

## Hydration Issues
- `typeof window !== 'undefined'` producing different HTML server vs client
- `Date.now()` or `Math.random()` in render output
- Browser-only APIs (`localStorage`, `navigator`) used during SSR

## Component Patterns
- Array `.map()` without `key` or using index as key
- `{condition && <Component />}` where condition could be `0` (renders "0")
- Missing loading/error states

## Component Library Reuse
**How to check**: List the project's component library directory recursively to discover all available components, then compare each `.tsx` file's inline elements against what the library already provides. If a page builds UI that an existing component already handles, flag it.

**What to flag**:
- Inline HTML/JSX that replicates the purpose of a library component — always check the library's current contents rather than assuming
- New components created inline in route/page files instead of in the component library — every reusable UI element belongs in the shared component library, not embedded in a page

## Accessibility (Code-Level)
- `<div onClick>` instead of `<button>` — not keyboard accessible
- Images without `alt` text
- Form inputs without `<label>`
- Headings skipping levels
- Missing `aria-label` on icon-only buttons
