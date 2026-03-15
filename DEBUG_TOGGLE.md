# Actual Net Worth — Estimated Balances Toggle Debug Notes

## Problem Statement

The **Estimated Balances toggle** button on the `/reports/actual-net-worth/:id` full page does not work.

**Expected behavior:**
Clicking "Estimated balances: OFF" → changes to "Estimated balances: ON" and refetches chart data with `useCalculatedFallback: true`, adding transaction-derived balances for accounts that have no SimpleFin snapshots.

**Actual behavior:**
Clicking the button does nothing. No visual change. No console log fires.

---

## Architecture

- Full page component: `packages/desktop-client/src/components/reports/reports/ActualNetWorth.tsx`
- Backend handler: `packages/loot-core/src/server/reports/app.ts` → `getActualNetWorthSnapshots({ startDate, endDate, useCalculatedFallback })`
- Route: `/reports/actual-net-worth/:id` registered in `ReportRouter.tsx`
- Button uses `Button` from `@actual-app/components/button` which wraps React Aria's `ReactAriaButton`

---

## Current Implementation (ActualNetWorth.tsx)

The component was rewritten to bypass `useReport`/`useMemo` and fetch directly:

```typescript
function ActualNetWorthInner({ widget }: ActualNetWorthInnerProps) {
  'use no memo'; // tried to opt out React Compiler

  const [showCalculatedFallback, setShowCalculatedFallback] = useState(
    widget?.meta?.showCalculatedFallback ?? false,
  );
  const [data, setData] = useState<ActualNetWorthData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    console.log('[ANW] fetching, useCalculatedFallback=', showCalculatedFallback);
    void send('report/actual-net-worth-snapshots', {
      startDate: monthUtils.firstDayOfMonth(startDate),
      endDate: monthUtils.lastDayOfMonth(endDate),
      useCalculatedFallback: showCalculatedFallback,
    }).then((rows: unknown) => {
      if (cancelled) return;
      // ... setData(...)
      console.log('[ANW] got rows:', typedRows.length, 'last=', ...);
    }).catch(err => console.error('[ANW] error:', err));
    return () => { cancelled = true; };
  }, [startDate, endDate, showCalculatedFallback]);

  function onToggleFallback() {
    console.log('[ANW] onToggleFallback called, current=', showCalculatedFallback);
    const next = !showCalculatedFallback;
    setShowCalculatedFallback(next);
    if (widget) {
      updateWidget.mutate({ widget: { id: widget.id, meta: { ...widget.meta, showCalculatedFallback: next } } });
    }
  }

  // ...
  <Button
    variant={showCalculatedFallback ? 'primary' : 'normal'}
    onPress={onToggleFallback}
    onClick={onToggleFallback}   // added as extra debug attempt
    style={{ marginTop: 'auto' }}
  >
    {showCalculatedFallback ? t('Estimated balances: ON') : t('Estimated balances: OFF')}
  </Button>
}
```

---

## Debug Results

| Test | Result |
|------|--------|
| `[ANW] fetching, useCalculatedFallback= false` appears on page load | ✅ YES — initial fetch works |
| `[ANW] onToggleFallback called` appears when button is clicked | ❌ NO — function never fires |
| `[ANW] fetching, useCalculatedFallback= true` appears after clicking toggle | ❌ NO |
| `useCalculatedFallback= true` ever appears in console | ❌ NO |

**Conclusion: The button press event is not reaching the `onPress`/`onClick` handler at all.**

---

## Things Already Tried

1. **Original approach**: `useReport` + `useMemo` with `showCalculatedFallback` in deps → toggle appeared to do nothing
2. **Direct `useEffect` + `send()`**: Rewrote to bypass `useReport` entirely → still no button press registered
3. **`'use no memo'` directive**: Added to opt out of React Compiler → no change
4. **Added `onClick` in addition to `onPress`**: Neither fires

---

## Code Analysis Results (session 2)

- `react-aria-components` Button **explicitly deletes `onClick`** (`delete DOMProps.onClick` in Button.tsx line 145) — adding `onClick` was never going to help
- `babel-plugin-react-compiler` v1.0.0 **does** support `'use no memo'` directive with default config — this was working correctly
- **No `ButtonContext.Provider`** is used anywhere in the app — context isn't overriding props
- `createHideableComponent` in react-aria only returns null when `HiddenContext` is true — not applicable here
- **No DOM overlay found** in static analysis (AutoSizer renders within Container bounds with `position:absolute; top:0; left:0; overflow:hidden`)
- `.view` CSS class applies `display:flex; flex-direction:column; position:relative` to ALL View components
- **NetWorth page buttons inside `View[role="main"]` work fine** → the Page/main container is NOT the issue

## Current State

The component now has:
1. A **wrapper `<div>`** with `onClick` around the Button — this fires as a native DOM event independent of react-aria
2. The `Button` still has `onPress`

**Two possible outcomes after deploying this:**

| Console output | Meaning |
|---|---|
| `wrapper div onClick fired` but NOT `onToggleFallback called` | Click IS reaching the area — react-aria `usePress` is killing the event. Fix: replace `Button` with native `<button>` styled the same way |
| NEITHER fires | Click is NOT reaching the area at all — there IS a DOM overlay. Fix: use DevTools `document.elementFromPoint()` to find it |
| BOTH fire | Bug is fixed — proceed with cleanup |

## Remaining Hypotheses

1. **react-aria `usePress` cancelling the press** — possible if `pointer-events` is inconsistent in the element's subtree
2. **Invisible DOM overlay** — something outside the static code analysis (e.g. recharts internal SVG/tooltip layer with `pointer-events: auto`)
3. **CSS stacking issue** — multiple `position: relative` Views (from `.view` class) with Container rendered later in DOM having higher stacking order

## Next Debug Step

Deploy with `./fast-deploy-ui.sh` then open browser console and click the button. Check:

**Case A** — div onClick fires but onPress doesn't:
```javascript
// In DevTools, find the button element and check if usePress is attaching handlers:
document.querySelector('[data-pressed]') // Should exist during press
// Check the button element's event listeners in Elements panel → Event Listeners tab
```

**Case B** — nothing fires:
```javascript
// Click the button area, then immediately run:
document.elementFromPoint(lastClickX, lastClickY) // What element was actually clicked?
// Or: in Elements panel, right-click the button → Break on → Element is clicked
```
