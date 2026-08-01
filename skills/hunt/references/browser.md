# Browser (Runtime Testing)

Finds bugs by running the application in a browser. Catches issues code analysis alone cannot detect.

**Prerequisite**: the app's dev server running. Check its URL: `curl -s -o /dev/null -w "%{http_code}" <app-url>`

**Tools**: a browser-automation MCP (`claude-in-chrome`, Playwright, or `chrome-devtools`) for navigation/interaction, console/network/screenshots/Lighthouse/memory.

**Important**: Never `fullPage: true` on screenshots. Viewport-only. Scroll for more.

## Phase 1: Page Navigation & Console
For each major route:
1. Navigate, wait for data load
2. `list_console_messages` — flag all errors and warnings
3. `list_network_requests` — flag 4xx/5xx responses
4. Take viewport screenshot

**Flag**: console.error, TypeError, ReferenceError, failed API calls, CORS errors, unhandled rejections.

## Phase 2: Visual Inspection
Per screenshot:
- Layout correct? No overflow, no overlap
- Tables populated? Not empty when data should exist
- Charts rendering? Not blank canvases
- Loading states resolved? No stuck spinners
- Text readable? No truncation of important content

## Phase 3: Accessibility
Run `lighthouse_audit` with categories: ["accessibility"]
- Score below 90 needs attention
- Missing alt text, color contrast, keyboard navigation, focus indicators, form labels, heading hierarchy

## Phase 4: Performance
Measure per page: FCP, LCP, TTI
- Flag: FCP > 1.5s, LCP > 2.5s, TTI > 3.5s
- Network payload: flag resources > 500KB, total > 3MB
- JS bundles > 200KB

## Phase 5: Memory
1. Navigate to page, take snapshot
2. Navigate away and back
3. Take second snapshot
4. Growth > 20% without data increase = leak

## Phase 6: Interaction Flows
Test key workflows:
1. **Navigation**: click through nav items, verify no console errors, URL updates
2. **Data**: apply filters, paginate, switch tabs — verify updates
3. **Detail**: click list item → detail → back — verify data freshness, state preservation
4. **Error**: trigger an error if possible — verify user-visible feedback and recovery

Per interaction: check console for new errors, network for failures, screenshot if visual change, note lag > 300ms.

## Report Format
```markdown
## Browser Findings
### Console Errors
| Page | Error | Count |
### Failed Network Requests
| Page | URL | Status | Method |
### Accessibility
Lighthouse score: XX/100, issues list
### Performance
| Page | FCP | LCP | TTI | Payload |
### Memory
| Action | Before | After | Delta |
### Interaction Issues
### Screenshots
```
