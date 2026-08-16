# Drawing System Overhaul Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace the current lightweight chart drawing overlay with a TradingView-style drawing engine that supports selection, editing, a persistent right-side inspector, power-user keyboard shortcuts, sticky per-tool defaults, and a large first-party tool suite.

**Architecture:** Build a dedicated drawing subsystem under `src/lib/drawings/` and move tool metadata, geometry, hit-testing, interaction state, shortcuts, and render-state generation out of `src/components/TradingViewChart.tsx`. Keep `TradingViewChart.tsx` as the chart host, keep `src/store/useSimulatorStore.ts` as the persistence boundary, and make the new drawing logic testable with pure `node:test` suites that do not depend on DOM test libraries.

**Tech Stack:** React 19, Zustand 5, Lightweight Charts 5.1, TypeScript, Lucide React, SVG overlays, `node:test`, `tsx`.

---

> **Pre-flight:** This working directory is not currently a Git repository. Execute this plan from a dedicated Git worktree/branch before you start. If you temporarily work here anyway, replace each commit step with a written checkpoint note and only use the commit commands after moving into a repo-backed worktree.

> **Relevant current code before you touch anything:**
> - `src/store/useSimulatorStore.ts:77-124,173-215,230-748` — current drawing types and store actions
> - `src/components/TradingViewChart.tsx:108-136,756-869,880-1023,1526-1882` — current drawing interaction + render overlay
> - `src/components/SessionView.tsx:29-38,127-260` — current toolbar shell and chart host layout
> - `tests/chartMarkers.test.ts` — current `node:test` style used in this repo

## Phase 1 — Foundation and testable primitives

### Task 1: Drawing domain model, tool registry, defaults, and migration helpers

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `src/lib/drawings/types.ts`
- Create: `src/lib/drawings/tools.ts`
- Create: `src/lib/drawings/defaults.ts`
- Create: `src/lib/drawings/migrations.ts`
- Test: `tests/drawings.foundation.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDrawingToolDefinition, DRAWING_TOOLS } from '../src/lib/drawings/tools';
import { getDefaultToolPreset } from '../src/lib/drawings/defaults';
import { migrateLegacyDrawing } from '../src/lib/drawings/migrations';

test('tool registry exposes TradingView-style metadata for core tools', () => {
  const trendline = getDrawingToolDefinition('trendline');
  assert.equal(trendline.family, 'line');
  assert.equal(trendline.shortcut, 'T');
  assert.equal(trendline.anchorCount, 2);
  assert.ok(DRAWING_TOOLS.some((tool) => tool.id === 'fibRetracement'));
});

test('default presets are sticky-ready and structured', () => {
  const rectangle = getDefaultToolPreset('rectangle');
  assert.equal(rectangle.style.strokeColor, '#3b82f6');
  assert.equal(rectangle.style.fillOpacity, 0.2);
  assert.equal(rectangle.style.strokeStyle, 'solid');
});

test('legacy drawings migrate into versioned drawing objects', () => {
  const migrated = migrateLegacyDrawing({
    id: 'legacy-1',
    type: 'text',
    color: '#d1d5db',
    text: 'POI',
    points: [{ time: 1_700_000_000, price: 1.12345 }],
  }, 4);

  assert.equal(migrated.id, 'legacy-1');
  assert.equal(migrated.tool, 'text');
  assert.equal(migrated.zIndex, 4);
  assert.equal(migrated.meta.version, 1);
  assert.equal(migrated.style.textColor, '#d1d5db');
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.foundation.test.ts
```

Expected: FAIL with `Cannot find module '../src/lib/drawings/tools'` or missing export errors.

**Step 3: Write the minimal implementation**

Create the new drawing foundation files with these minimum concepts:

```ts
// src/lib/drawings/types.ts
export type DrawingToolId =
  | 'select'
  | 'trendline'
  | 'ray'
  | 'extendedLine'
  | 'horizontalLine'
  | 'verticalLine'
  | 'parallelChannel'
  | 'rectangle'
  | 'measure'
  | 'longPosition'
  | 'shortPosition'
  | 'fibRetracement'
  | 'arrow'
  | 'brush'
  | 'polyline'
  | 'text'
  | 'callout'
  | 'anchoredNote'
  | 'marker';

export type DrawingFamily = 'line' | 'range' | 'ratio' | 'path' | 'annotation';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface DrawingStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  fillColor?: string;
  fillOpacity?: number;
  textColor?: string;
  fontSize?: number;
  extendLeft?: boolean;
  extendRight?: boolean;
  fibLevels?: number[];
}

export interface DrawingObject {
  id: string;
  tool: DrawingToolId;
  family: DrawingFamily;
  points: DrawingPoint[];
  style: DrawingStyle;
  text?: string;
  locked: boolean;
  hidden: boolean;
  zIndex: number;
  meta: { version: 1; name?: string; notes?: string; source?: 'manual' | 'template' | 'import' };
  createdAt: number;
  updatedAt: number;
}
```

```ts
// src/lib/drawings/tools.ts
import type { DrawingFamily, DrawingToolId } from './types';

export interface DrawingToolDefinition {
  id: DrawingToolId;
  family: DrawingFamily;
  shortcut?: string;
  anchorCount: number | 'dynamic';
  label: string;
}

export const DRAWING_TOOLS: DrawingToolDefinition[] = [
  { id: 'trendline', family: 'line', shortcut: 'T', anchorCount: 2, label: 'Trend Line' },
  { id: 'fibRetracement', family: 'ratio', shortcut: 'F', anchorCount: 2, label: 'Fib Retracement' },
  // add the rest now, even if some tools are rendered later
];

export function getDrawingToolDefinition(id: DrawingToolId) {
  const tool = DRAWING_TOOLS.find((entry) => entry.id === id);
  if (!tool) throw new Error(`Unknown drawing tool: ${id}`);
  return tool;
}
```

```ts
// src/lib/drawings/defaults.ts
import type { DrawingToolId, DrawingStyle } from './types';

export interface ToolPreset {
  style: DrawingStyle;
}

export function getDefaultToolPreset(tool: DrawingToolId): ToolPreset {
  if (tool === 'rectangle') {
    return { style: { strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid', opacity: 1, fillColor: '#3b82f6', fillOpacity: 0.2 } };
  }
  return { style: { strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid', opacity: 1 } };
}
```

```ts
// src/lib/drawings/migrations.ts
import { getDefaultToolPreset } from './defaults';
import { getDrawingToolDefinition } from './tools';
import type { DrawingObject } from './types';

export function migrateLegacyDrawing(legacy: any, zIndex: number): DrawingObject {
  const tool = legacy.type === 'measure' ? 'measure' : legacy.type;
  const definition = getDrawingToolDefinition(tool);
  const preset = getDefaultToolPreset(tool);
  return {
    id: legacy.id,
    tool,
    family: definition.family,
    points: legacy.points,
    style: {
      ...preset.style,
      strokeColor: legacy.color ?? preset.style.strokeColor,
      fillColor: legacy.color ?? preset.style.fillColor,
      textColor: legacy.color ?? preset.style.textColor,
    },
    text: legacy.text,
    locked: false,
    hidden: false,
    zIndex,
    meta: { version: 1, source: 'manual' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
node --import tsx --test tests/drawings.foundation.test.ts
```

Expected: all tests in `tests/drawings.foundation.test.ts` pass.

**Step 5: Commit**

```bash
git add tests/drawings.foundation.test.ts src/lib/drawings/types.ts src/lib/drawings/tools.ts src/lib/drawings/defaults.ts src/lib/drawings/migrations.ts
git commit -m "feat: add drawing model foundation"
```

### Task 2: Pure drawing state helpers and store migration wiring

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `src/lib/drawings/state.ts`
- Modify: `src/store/useSimulatorStore.ts:77-124,173-215,230-748`
- Test: `tests/drawings.state.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawingDocument, addDrawingObject, duplicateSelectedDrawings, updateToolPreset } from '../src/lib/drawings/state';
import { getDefaultToolPreset } from '../src/lib/drawings/defaults';

test('new documents start with empty selection and sticky presets', () => {
  const document = createDrawingDocument();
  assert.deepEqual(document.selectedIds, []);
  assert.equal(document.toolDefaults.rectangle.style.fillOpacity, getDefaultToolPreset('rectangle').style.fillOpacity);
});

test('duplicateSelectedDrawings appends new ids and preserves style', () => {
  const document = addDrawingObject(createDrawingDocument(), {
    id: 'a',
    tool: 'trendline',
    family: 'line',
    points: [
      { time: 1, price: 1.1 },
      { time: 2, price: 1.2 },
    ],
    style: { strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid', opacity: 1 },
    locked: false,
    hidden: false,
    zIndex: 0,
    meta: { version: 1, source: 'manual' },
    createdAt: 1,
    updatedAt: 1,
  }, true);

  const duplicated = duplicateSelectedDrawings(document, () => 'copy-1');
  assert.equal(duplicated.objects.length, 2);
  assert.deepEqual(duplicated.selectedIds, ['copy-1']);
  assert.equal(duplicated.objects[1].style.strokeColor, '#3b82f6');
});

test('updateToolPreset only mutates the targeted tool preset', () => {
  const updated = updateToolPreset(createDrawingDocument(), 'text', { style: { fontSize: 18 } });
  assert.equal(updated.toolDefaults.text.style.fontSize, 18);
  assert.equal(updated.toolDefaults.trendline.style.strokeWidth, 2);
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.state.test.ts
```

Expected: FAIL because `src/lib/drawings/state.ts` does not exist yet.

**Step 3: Write the minimal implementation**

Create a pure drawing document module and wire the store to it.

```ts
// src/lib/drawings/state.ts
import { getDefaultToolPreset } from './defaults';
import type { DrawingObject, DrawingToolId } from './types';

export interface DrawingDocument {
  objects: DrawingObject[];
  selectedIds: string[];
  toolDefaults: Record<DrawingToolId, ReturnType<typeof getDefaultToolPreset>>;
}

export function createDrawingDocument(): DrawingDocument {
  return {
    objects: [],
    selectedIds: [],
    toolDefaults: {
      trendline: getDefaultToolPreset('trendline'),
      ray: getDefaultToolPreset('ray'),
      extendedLine: getDefaultToolPreset('extendedLine'),
      horizontalLine: getDefaultToolPreset('horizontalLine'),
      verticalLine: getDefaultToolPreset('verticalLine'),
      parallelChannel: getDefaultToolPreset('parallelChannel'),
      rectangle: getDefaultToolPreset('rectangle'),
      measure: getDefaultToolPreset('measure'),
      longPosition: getDefaultToolPreset('longPosition'),
      shortPosition: getDefaultToolPreset('shortPosition'),
      fibRetracement: getDefaultToolPreset('fibRetracement'),
      arrow: getDefaultToolPreset('arrow'),
      brush: getDefaultToolPreset('brush'),
      polyline: getDefaultToolPreset('polyline'),
      text: getDefaultToolPreset('text'),
      callout: getDefaultToolPreset('callout'),
      anchoredNote: getDefaultToolPreset('anchoredNote'),
      marker: getDefaultToolPreset('marker'),
      select: getDefaultToolPreset('select'),
    },
  };
}
```

Add helper functions for:
- add object
- update object
- remove object(s)
- duplicate selected objects
- clear selection
- update tool preset
- migrate legacy `session.drawings` arrays into the new document shape

Then modify `src/store/useSimulatorStore.ts` so that:
- `Session.drawings: Drawing[]` becomes `drawingDocument: DrawingDocument`
- the root store also gets `activeDrawingTool: DrawingToolId | null`
- new actions exist for `createDrawing`, `updateDrawing`, `deleteSelectedDrawings`, `setSelectedDrawings`, `clearDrawingSelection`, `duplicateSelectedDrawings`, `setToolDefaults`, and `resetToolDefaults`
- persist config gets a `version` and `migrate` function that upgrades stored sessions from legacy `drawings` arrays

**Important:** keep backward compatibility during migration. On first load, convert any old `drawings` array into `drawingDocument.objects`, then remove usage of the old shape everywhere.

**Step 4: Run test to verify it passes**

Run:
```bash
node --import tsx --test tests/drawings.state.test.ts
npm run lint
```

Expected:
- drawing state tests pass
- TypeScript stays clean after the store type changes

**Step 5: Commit**

```bash
git add tests/drawings.state.test.ts src/lib/drawings/state.ts src/store/useSimulatorStore.ts
git commit -m "feat: add drawing document store state"
```

### Task 3: Geometry, bounds, and hit-testing primitives

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `src/lib/drawings/geometry.ts`
- Create: `src/lib/drawings/hitTest.ts`
- Test: `tests/drawings.geometry.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getLineBoundingBox, constrainTrendlineAngle, translatePoints } from '../src/lib/drawings/geometry';
import { hitTestTrendline, hitTestRectangleHandles } from '../src/lib/drawings/hitTest';

test('translatePoints moves every anchor by the same delta', () => {
  const moved = translatePoints([
    { time: 10, price: 1.1 },
    { time: 20, price: 1.2 },
  ], { timeDelta: 5, priceDelta: 0.01 });

  assert.deepEqual(moved, [
    { time: 15, price: 1.11 },
    { time: 25, price: 1.21 },
  ]);
});

test('constrainTrendlineAngle snaps to common angles when shift is held', () => {
  const constrained = constrainTrendlineAngle(
    { time: 0, price: 1.0 },
    { time: 10, price: 1.15 },
  );
  assert.equal(constrained.time, 10);
  assert.notEqual(constrained.price, 1.15);
});

test('hitTestTrendline returns body hits near the segment', () => {
  const hit = hitTestTrendline({ x: 50, y: 50 }, [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
  ], 8);
  assert.equal(hit?.target, 'body');
});

test('hitTestRectangleHandles returns the expected corner handle', () => {
  const hit = hitTestRectangleHandles({ x: 10, y: 10 }, { x: 10, y: 10, width: 40, height: 30 }, 6);
  assert.equal(hit?.handle, 'top-left');
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.geometry.test.ts
```

Expected: FAIL because the geometry modules do not exist yet.

**Step 3: Write the minimal implementation**

```ts
// src/lib/drawings/geometry.ts
import type { DrawingPoint } from './types';

export function translatePoints(points: DrawingPoint[], delta: { timeDelta: number; priceDelta: number }) {
  return points.map((point) => ({
    time: point.time + delta.timeDelta,
    price: point.price + delta.priceDelta,
  }));
}

export function constrainTrendlineAngle(anchor: DrawingPoint, next: DrawingPoint): DrawingPoint {
  const deltaTime = next.time - anchor.time;
  const deltaPrice = next.price - anchor.price;
  const slope = Math.abs(deltaPrice / Math.max(Math.abs(deltaTime), 1));
  if (slope < 0.25) return { time: next.time, price: anchor.price };
  if (slope > 2) return { time: anchor.time, price: next.price };
  return { time: next.time, price: anchor.price + Math.sign(deltaPrice || 1) * Math.abs(deltaTime) };
}
```

```ts
// src/lib/drawings/hitTest.ts
export function hitTestTrendline(point: { x: number; y: number }, segment: { x: number; y: number }[], tolerance: number) {
  // implement point-to-segment distance check; return { target: 'body' } or null
}

export function hitTestRectangleHandles(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }, tolerance: number) {
  // check each corner first; return { target: 'handle', handle: 'top-left' | ... }
}
```

Keep these modules pure and free of React or chart APIs.

**Step 4: Run test to verify it passes**

Run:
```bash
node --import tsx --test tests/drawings.geometry.test.ts
```

Expected: all geometry/hit-test assertions pass.

**Step 5: Commit**

```bash
git add tests/drawings.geometry.test.ts src/lib/drawings/geometry.ts src/lib/drawings/hitTest.ts
git commit -m "feat: add drawing geometry and hit testing"
```

### Task 4: Interaction reducer for drawing, selecting, dragging, and editing text

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `src/lib/drawings/interaction.ts`
- Test: `tests/drawings.interaction.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceDrawingInteraction, createInitialInteractionState } from '../src/lib/drawings/interaction';

test('pointer flow enters drawing mode and commits a two-anchor trendline', () => {
  let state = createInitialInteractionState();
  state = reduceDrawingInteraction(state, { type: 'tool/activated', tool: 'trendline' });
  state = reduceDrawingInteraction(state, { type: 'pointer/down-chart', point: { time: 10, price: 1.1 } });
  state = reduceDrawingInteraction(state, { type: 'pointer/move-chart', point: { time: 20, price: 1.2 } });
  state = reduceDrawingInteraction(state, { type: 'pointer/up-chart', point: { time: 20, price: 1.2 } });

  assert.equal(state.mode, 'selected');
  assert.equal(state.draft, null);
  assert.equal(state.lastCommitted?.tool, 'trendline');
});

test('escape unwinds from text edit to selection to idle', () => {
  let state = createInitialInteractionState();
  state = { ...state, mode: 'editing-text', selectedIds: ['text-1'] };
  state = reduceDrawingInteraction(state, { type: 'keyboard/escape' });
  assert.equal(state.mode, 'selected');
  state = reduceDrawingInteraction(state, { type: 'keyboard/escape' });
  assert.equal(state.mode, 'idle');
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.interaction.test.ts
```

Expected: FAIL because `interaction.ts` does not exist.

**Step 3: Write the minimal implementation**

Implement a pure reducer and state machine.

```ts
export type InteractionMode =
  | 'idle'
  | 'drawing'
  | 'selected'
  | 'dragging-anchor'
  | 'dragging-body'
  | 'box-selecting'
  | 'editing-text';

export interface DrawingInteractionState {
  mode: InteractionMode;
  activeTool: import('./types').DrawingToolId | null;
  selectedIds: string[];
  draft: import('./types').DrawingObject | null;
  lastCommitted: import('./types').DrawingObject | null;
}

export function createInitialInteractionState(): DrawingInteractionState {
  return { mode: 'idle', activeTool: null, selectedIds: [], draft: null, lastCommitted: null };
}

export function reduceDrawingInteraction(state: DrawingInteractionState, event: any): DrawingInteractionState {
  // implement the smallest reducer that passes the tests first
}
```

After the first green test, extend the reducer to support:
- additive selection
- marquee selection
- dragging anchors vs body
- `Enter` commit for text tools
- `Space` temporary pan mode flag
- `Alt/Option` duplicate-on-drag intent flag

**Step 4: Run test to verify it passes**

Run:
```bash
node --import tsx --test tests/drawings.interaction.test.ts
npm run lint
```

Expected:
- interaction tests pass
- types remain sound

**Step 5: Commit**

```bash
git add tests/drawings.interaction.test.ts src/lib/drawings/interaction.ts
git commit -m "feat: add drawing interaction reducer"
```

### Task 5: Shortcut registry and command dispatch helpers

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `src/lib/drawings/shortcuts.ts`
- Test: `tests/drawings.shortcuts.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutMap, normalizeShortcutEvent, findMatchingCommand } from '../src/lib/drawings/shortcuts';

test('single-key shortcuts resolve to tool activation commands', () => {
  const shortcuts = createShortcutMap();
  const normalized = normalizeShortcutEvent({ key: 't', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
  assert.equal(findMatchingCommand(shortcuts, normalized)?.id, 'tool.trendline');
});

test('shift modifier distinguishes vertical line from horizontal line', () => {
  const shortcuts = createShortcutMap();
  const normalized = normalizeShortcutEvent({ key: 'H', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false });
  assert.equal(findMatchingCommand(shortcuts, normalized)?.id, 'tool.verticalLine');
});

test('typing guard suppresses drawing shortcuts inside editable fields', () => {
  const normalized = normalizeShortcutEvent({ key: 'Backspace', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }, { isTyping: true });
  assert.equal(normalized.blocked, true);
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.shortcuts.test.ts
```

Expected: FAIL because the shortcut module is missing.

**Step 3: Write the minimal implementation**

Implement a pure shortcut registry with named commands.

```ts
export interface ShortcutCommand {
  id: string;
  shortcut: string;
  when?: 'global' | 'chart';
}

export function createShortcutMap(): ShortcutCommand[] {
  return [
    { id: 'tool.select', shortcut: 'V' },
    { id: 'tool.trendline', shortcut: 'T' },
    { id: 'tool.rectangle', shortcut: 'R' },
    { id: 'tool.horizontalLine', shortcut: 'H' },
    { id: 'tool.verticalLine', shortcut: 'Shift+H' },
    { id: 'tool.arrow', shortcut: 'A' },
    { id: 'tool.brush', shortcut: 'B' },
    { id: 'tool.fibRetracement', shortcut: 'F' },
    { id: 'tool.measure', shortcut: 'M' },
    { id: 'tool.text', shortcut: 'X' },
    { id: 'selection.delete', shortcut: 'Backspace' },
    { id: 'shortcuts.show', shortcut: '?' },
  ];
}
```

Also implement:
- event normalization (`Ctrl/Cmd`, `Shift`, `Alt`, key casing)
- typing/editable guards
- lookup by normalized shortcut string
- grouped metadata for the help modal

**Step 4: Run test to verify it passes**

Run:
```bash
node --import tsx --test tests/drawings.shortcuts.test.ts
```

Expected: all shortcut assertions pass.

**Step 5: Commit**

```bash
git add tests/drawings.shortcuts.test.ts src/lib/drawings/shortcuts.ts
git commit -m "feat: add drawing shortcut registry"
```

## Checkpoint A

Before moving into React integration work, run the foundation tests together:

```bash
node --import tsx --test tests/drawings.foundation.test.ts tests/drawings.state.test.ts tests/drawings.geometry.test.ts tests/drawings.interaction.test.ts tests/drawings.shortcuts.test.ts
npm run lint
```

Expected: all new foundation tests pass and TypeScript stays green.

If any failure appears here, stop and fix it before touching UI files.

## Phase 2 — Chart integration and desktop-feel UI

### Task 6: Render-state builder and migration of the existing five tools

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `src/lib/drawings/render.tsx`
- Modify: `src/components/TradingViewChart.tsx:108-136,756-869,880-1023,1526-1882`
- Test: `tests/drawings.render-state.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawingRenderState } from '../src/lib/drawings/render';

test('buildDrawingRenderState maps horizontal lines to overlay coordinates', () => {
  const result = buildDrawingRenderState([
    {
      id: 'h1',
      tool: 'horizontalLine',
      family: 'line',
      points: [{ time: 10, price: 1.2 }],
      style: { strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'dashed', opacity: 1 },
      locked: false,
      hidden: false,
      zIndex: 0,
      meta: { version: 1, source: 'manual' },
      createdAt: 1,
      updatedAt: 1,
    },
  ], {
    toX: () => 100,
    toY: () => 250,
  });

  assert.equal(result[0].kind, 'horizontalLine');
  assert.equal(result[0].y, 250);
  assert.equal(result[0].stroke, '#3b82f6');
});

test('buildDrawingRenderState includes selection handles for selected rectangles', () => {
  const result = buildDrawingRenderState([/* rectangle object */], {
    toX: (time) => time,
    toY: (price) => price,
  }, { selectedIds: ['rect-1'] });

  assert.equal(result[0].selected, true);
  assert.ok(result[0].handles.length >= 4);
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.render-state.test.ts
```

Expected: FAIL because `render.tsx` does not exist.

**Step 3: Write the minimal implementation**

Create a pure render-state builder that transforms `DrawingObject[]` into a renderer-friendly array, then update `TradingViewChart.tsx` to consume it instead of branching directly on raw drawing objects.

```ts
// src/lib/drawings/render.tsx
export function buildDrawingRenderState(objects: DrawingObject[], project: { toX(time: number): number | null; toY(price: number): number | null }, options?: { selectedIds?: string[] }) {
  return objects
    .filter((object) => !object.hidden)
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((object) => {
      // return normalized shapes for line / rect / text / measure
    });
}
```

In `src/components/TradingViewChart.tsx`:
- replace direct use of `session?.drawings` with `session?.drawingDocument.objects`
- replace inline draft drawing state with the interaction controller + draft object from that controller
- replace the current raw `renderedDrawings.map(...)` branch logic with a call to `buildDrawingRenderState(...)`
- keep trade/news overlays intact
- do **not** add advanced tools yet; first make `trendline`, `horizontalLine`, `rectangle`, `text`, and `measure` work under the new model

**Step 4: Run test to verify it passes**

Run:
```bash
node --import tsx --test tests/drawings.render-state.test.ts
npm run lint
```

Expected:
- render-state tests pass
- the chart compiles against the new store and render API

**Step 5: Manual smoke test**

Run:
```bash
npm run dev
```

Manual checklist:
- open a session
- create each legacy tool (`trendline`, `horizontalLine`, `rectangle`, `text`, `measure`)
- reload the page and confirm the migrated drawings still appear
- verify no regressions in trade lines or news overlays

**Step 6: Commit**

```bash
git add tests/drawings.render-state.test.ts src/lib/drawings/render.tsx src/components/TradingViewChart.tsx
git commit -m "refactor: move chart overlay to drawing render state"
```

### Task 7: Drawing toolbar, right inspector shell, and shortcut help modal

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Create: `src/components/DrawingToolbar.tsx`
- Create: `src/components/DrawingInspector.tsx`
- Create: `src/components/ShortcutHelpModal.tsx`
- Create: `src/lib/drawings/selectors.ts`
- Modify: `src/components/SessionView.tsx:29-38,127-260`
- Modify: `src/components/TradingViewChart.tsx:90-1882`
- Test: `tests/drawings.selectors.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getInspectorSections, getToolbarGroups } from '../src/lib/drawings/selectors';

test('empty selection shows active tool defaults in inspector', () => {
  const sections = getInspectorSections({
    activeTool: 'rectangle',
    selectedObjects: [],
    toolDefaults: { rectangle: { style: { strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid', opacity: 1, fillOpacity: 0.2 } } },
  } as any);

  assert.equal(sections[0].id, 'tool-defaults');
});

test('toolbar groups expose shortcut badges for core tools', () => {
  const groups = getToolbarGroups();
  assert.ok(groups.some((group) => group.tools.some((tool) => tool.shortcut === 'T')));
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.selectors.test.ts
```

Expected: FAIL because `selectors.ts` does not exist.

**Step 3: Write the minimal implementation**

Implement pure selectors first, then use them from the new UI components.

```ts
// src/lib/drawings/selectors.ts
export function getToolbarGroups() {
  return [
    { id: 'select', label: 'Select', tools: [{ id: 'select', label: 'Cursor', shortcut: 'V' }] },
    { id: 'lines', label: 'Lines', tools: [{ id: 'trendline', label: 'Trend Line', shortcut: 'T' }, { id: 'horizontalLine', label: 'Horizontal', shortcut: 'H' }] },
    // more groups here
  ];
}

export function getInspectorSections(input: any) {
  if (input.selectedObjects.length === 0) {
    return [{ id: 'tool-defaults', title: 'Tool defaults' }];
  }
  return [{ id: 'style', title: 'Style' }, { id: 'geometry', title: 'Geometry' }, { id: 'actions', title: 'Actions' }];
}
```

Then build the components:
- `DrawingToolbar.tsx` replaces the hard-coded left stack in `SessionView.tsx`
- `DrawingInspector.tsx` mounts on the right and reads selection/defaults from store selectors
- `ShortcutHelpModal.tsx` renders grouped shortcut commands and opens from `?`

Keep them thin: data should come from selectors and shortcut metadata, not duplicated inline in JSX.

**Step 4: Run test to verify it passes**

Run:
```bash
node --import tsx --test tests/drawings.selectors.test.ts
npm run lint
```

Expected:
- selector tests pass
- UI compiles with the new toolbar and inspector shell

**Step 5: Manual smoke test**

Run:
```bash
npm run dev
```

Manual checklist:
- left toolbar shows grouped tools and shortcut hints
- right inspector appears with no selection and shows active tool defaults
- `?` opens the shortcut help modal
- layout still works in fullscreen and normal mode

**Step 6: Commit**

```bash
git add tests/drawings.selectors.test.ts src/lib/drawings/selectors.ts src/components/DrawingToolbar.tsx src/components/DrawingInspector.tsx src/components/ShortcutHelpModal.tsx src/components/SessionView.tsx src/components/TradingViewChart.tsx
git commit -m "feat: add drawing toolbar and inspector shell"
```

### Task 8: Keyboard wiring, chart event dispatch, and selection editing UX

**TDD scenario:** Modifying tested code — run existing tests first

**Files:**
- Modify: `src/components/TradingViewChart.tsx:756-869,1526-1882`
- Modify: `src/components/SessionView.tsx:127-260`
- Modify: `src/lib/drawings/interaction.ts`
- Modify: `src/lib/drawings/shortcuts.ts`
- Test: `tests/drawings.keyboard-flow.test.ts`

**Step 1: Run the existing relevant tests first**

Run:
```bash
node --import tsx --test tests/drawings.interaction.test.ts tests/drawings.shortcuts.test.ts tests/drawings.render-state.test.ts
```

Expected: all existing drawing tests pass before you modify keyboard flow.

**Step 2: Add a failing keyboard flow test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchShortcutCommand } from '../src/lib/drawings/shortcuts';
import { createInitialInteractionState } from '../src/lib/drawings/interaction';

test('delete command removes selected drawings when not typing', () => {
  const result = dispatchShortcutCommand({
    commandId: 'selection.delete',
    interaction: createInitialInteractionState(),
    selectedIds: ['draw-1'],
    isTyping: false,
  });

  assert.equal(result.type, 'selection/delete');
});

test('escape clears selection before deactivating the active tool', () => {
  const result = dispatchShortcutCommand({
    commandId: 'selection.clear',
    interaction: { ...createInitialInteractionState(), mode: 'selected', selectedIds: ['draw-1'], activeTool: 'trendline' },
    selectedIds: ['draw-1'],
    isTyping: false,
  });

  assert.equal(result.type, 'selection/clear');
});
```

**Step 3: Implement the minimal wiring**

Add the thinnest possible command dispatch layer and hook it into the chart host.

Implementation checklist:
- subscribe to `window` keyboard events only while `SessionView`/chart is mounted
- ignore events when the user is typing in `input`, `textarea`, or content-editable nodes
- map commands to store actions and interaction events
- implement `Esc`, `Enter`, `Delete/Backspace`, single-key tool switches, `Ctrl/Cmd+D`, `Ctrl/Cmd+L`, `Ctrl/Cmd+Shift+H`, `[` and `]`
- keep chart panning/hover logic working while drawing state changes

**Step 4: Run tests and lint**

Run:
```bash
node --import tsx --test tests/drawings.keyboard-flow.test.ts tests/drawings.interaction.test.ts tests/drawings.shortcuts.test.ts
npm run lint
```

Expected: keyboard-flow tests pass and no type errors appear.

**Step 5: Manual smoke test**

Run:
```bash
npm run dev
```

Manual checklist:
- `V`, `T`, `R`, `H`, `Shift+H`, `A`, `B`, `F`, `M`, `X` switch tools
- `Esc` unwinds in the correct order
- `Delete` removes selected drawings
- `Ctrl/Cmd+D` duplicates selected objects
- text fields do not trigger tool switches while typing

**Step 6: Commit**

```bash
git add tests/drawings.keyboard-flow.test.ts src/components/TradingViewChart.tsx src/components/SessionView.tsx src/lib/drawings/interaction.ts src/lib/drawings/shortcuts.ts
git commit -m "feat: wire drawing keyboard workflow"
```

## Checkpoint B

Run the full drawing test suite before advanced-tool expansion:

```bash
node --import tsx --test tests/drawings.foundation.test.ts tests/drawings.state.test.ts tests/drawings.geometry.test.ts tests/drawings.interaction.test.ts tests/drawings.shortcuts.test.ts tests/drawings.render-state.test.ts tests/drawings.selectors.test.ts tests/drawings.keyboard-flow.test.ts
npm run lint
```

Expected: all foundation/integration tests pass.

## Phase 3 — Advanced tools and polish

### Task 9: Advanced line, path, and annotation tools

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Modify: `src/lib/drawings/tools.ts`
- Modify: `src/lib/drawings/defaults.ts`
- Modify: `src/lib/drawings/render.tsx`
- Modify: `src/lib/drawings/hitTest.ts`
- Modify: `src/lib/drawings/interaction.ts`
- Modify: `src/components/DrawingToolbar.tsx`
- Modify: `src/components/DrawingInspector.tsx`
- Modify: `src/components/TradingViewChart.tsx`
- Test: `tests/drawings.advanced-tools.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDrawingToolDefinition } from '../src/lib/drawings/tools';
import { buildDrawingRenderState } from '../src/lib/drawings/render';

test('advanced tools are registered with families and shortcuts', () => {
  assert.equal(getDrawingToolDefinition('ray').family, 'line');
  assert.equal(getDrawingToolDefinition('arrow').shortcut, 'A');
  assert.equal(getDrawingToolDefinition('brush').anchorCount, 'dynamic');
  assert.equal(getDrawingToolDefinition('callout').family, 'annotation');
});

test('callouts and arrows produce renderable overlay output', () => {
  const renderState = buildDrawingRenderState([
    {
      id: 'arrow-1',
      tool: 'arrow',
      family: 'path',
      points: [{ time: 1, price: 1 }, { time: 2, price: 2 }],
      style: { strokeColor: '#f59e0b', strokeWidth: 2, strokeStyle: 'solid', opacity: 1 },
      locked: false,
      hidden: false,
      zIndex: 0,
      meta: { version: 1, source: 'manual' },
      createdAt: 1,
      updatedAt: 1,
    },
  ], { toX: (time) => time * 10, toY: (price) => price * 10 });

  assert.equal(renderState[0].kind, 'arrow');
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.advanced-tools.test.ts
```

Expected: FAIL until the registry and renderer know about these tools.

**Step 3: Write the minimal implementation**

Implement these tools in one wave:
- `ray`
- `extendedLine`
- `verticalLine`
- `arrow`
- `brush`
- `polyline`
- `text`
- `callout`
- `anchoredNote`
- `marker`

Rules:
- use shared families and geometry helpers instead of bespoke code paths
- keep brush/polyline point simplification conservative; do not over-engineer smoothing
- render locked objects with visible but subdued handles/state
- text-like objects must support inline editing and inspector-based formatting

**Step 4: Run tests and lint**

Run:
```bash
node --import tsx --test tests/drawings.advanced-tools.test.ts tests/drawings.interaction.test.ts tests/drawings.render-state.test.ts
npm run lint
```

Expected: advanced-tool tests pass and no existing drawing tests regress.

**Step 5: Manual smoke test**

Run:
```bash
npm run dev
```

Manual checklist:
- create and edit `ray`, `extendedLine`, `verticalLine`, `arrow`, `brush`, `polyline`, `callout`, `anchoredNote`, `marker`
- double-click text-like objects to edit
- drag bodies and anchors
- verify hidden/locked states still behave correctly

**Step 6: Commit**

```bash
git add tests/drawings.advanced-tools.test.ts src/lib/drawings/tools.ts src/lib/drawings/defaults.ts src/lib/drawings/render.tsx src/lib/drawings/hitTest.ts src/lib/drawings/interaction.ts src/components/DrawingToolbar.tsx src/components/DrawingInspector.tsx src/components/TradingViewChart.tsx
git commit -m "feat: add advanced line and annotation tools"
```

### Task 10: Fibs, channels, position boxes, snapping, z-order, and sticky-default polish

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Modify: `src/lib/drawings/tools.ts`
- Modify: `src/lib/drawings/defaults.ts`
- Modify: `src/lib/drawings/state.ts`
- Modify: `src/lib/drawings/geometry.ts`
- Modify: `src/lib/drawings/hitTest.ts`
- Modify: `src/lib/drawings/render.tsx`
- Modify: `src/components/DrawingInspector.tsx`
- Modify: `src/components/TradingViewChart.tsx`
- Test: `tests/drawings.polish.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { updateToolPreset, reorderSelectedDrawings } from '../src/lib/drawings/state';
import { buildDrawingRenderState } from '../src/lib/drawings/render';

test('tool preset updates stay sticky for the next created object', () => {
  const document = updateToolPreset(createDrawingDocument(), 'fibRetracement', {
    style: { strokeColor: '#a855f7', fibLevels: [0, 0.5, 0.618, 1] },
  });
  assert.equal(document.toolDefaults.fibRetracement.style.strokeColor, '#a855f7');
  assert.deepEqual(document.toolDefaults.fibRetracement.style.fibLevels, [0, 0.5, 0.618, 1]);
});

test('reorderSelectedDrawings moves selected objects to the front', () => {
  const reordered = reorderSelectedDrawings(/* seed document */, 'front');
  assert.equal(reordered.objects.at(-1)?.id, 'selected-id');
});

test('fib retracements produce level labels in render state', () => {
  const renderState = buildDrawingRenderState([/* fib object */], { toX: (t) => t, toY: (p) => p });
  assert.equal(renderState[0].kind, 'fibRetracement');
  assert.ok(renderState[0].levels.length >= 3);
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
node --import tsx --test tests/drawings.polish.test.ts
```

Expected: FAIL until state reordering, fib rendering, and sticky preset logic are implemented.

**Step 3: Write the minimal implementation**

Implement these capabilities:
- `parallelChannel`
- `fibRetracement`
- `longPosition`
- `shortPosition`
- snapping / magnet options exposed in the inspector
- z-order actions (`front`, `back`, `forward`, `backward`)
- “save current style as default” and “reset tool defaults” actions in the inspector

Keep the UI scoped:
- do **not** add import/export yet
- do **not** build template libraries yet
- do **not** add collaborative features

**Step 4: Run tests and lint**

Run:
```bash
node --import tsx --test tests/drawings.polish.test.ts tests/drawings.state.test.ts tests/drawings.render-state.test.ts
npm run lint
```

Expected: polish tests pass and core drawing tests remain green.

**Step 5: Manual smoke test**

Run:
```bash
npm run dev
```

Manual checklist:
- fib retracement shows configurable levels and labels
- parallel channel can be created and adjusted from its handles
- long/short boxes show measurement overlays
- changing a tool default affects the next new object of that tool only
- bring front/send back changes visual stacking order

**Step 6: Commit**

```bash
git add tests/drawings.polish.test.ts src/lib/drawings/tools.ts src/lib/drawings/defaults.ts src/lib/drawings/state.ts src/lib/drawings/geometry.ts src/lib/drawings/hitTest.ts src/lib/drawings/render.tsx src/components/DrawingInspector.tsx src/components/TradingViewChart.tsx
git commit -m "feat: polish advanced drawing workflows"
```

### Task 11: Final verification and regression pass

**TDD scenario:** Trivial change — use judgment

**Files:**
- Modify only if verification uncovers issues
- Test: all existing and new relevant tests

**Step 1: Run the full automated verification suite**

Run:
```bash
npm run lint
node --import tsx --test tests/**/*.test.ts
```

Expected: full test suite passes.

**Step 2: Run the app for manual verification**

Run:
```bash
npm run dev
```

Manual checklist:
- existing replay/chart flows still work
- all legacy tools still function after migration
- advanced tools create/edit/delete correctly
- keyboard workflow feels consistent in fullscreen and normal mode
- text entry never steals unrelated shortcuts
- news/trade overlays still render and capture screenshots correctly
- page reload preserves drawing documents, selections reset safely, and no console errors appear

**Step 3: Fix only the smallest issues found**

If verification reveals issues, patch the minimum code necessary and rerun the relevant targeted tests first, then the full suite again.

**Step 4: Re-run full verification**

Run:
```bash
npm run lint
node --import tsx --test tests/**/*.test.ts
```

Expected: clean pass after fixes.

**Step 5: Commit**

```bash
git add src/components/SessionView.tsx src/components/TradingViewChart.tsx src/components/DrawingToolbar.tsx src/components/DrawingInspector.tsx src/components/ShortcutHelpModal.tsx src/lib/drawings src/store/useSimulatorStore.ts tests
git commit -m "feat: overhaul drawing system"
```

## Notes for the implementer

- Keep `TradingViewChart.tsx` thin. If you feel tempted to add another huge tool-specific branch inside it, stop and move that logic into `src/lib/drawings/` first.
- Prefer pure helper modules and reducer-style logic over stateful component spaghetti.
- This repo currently uses `node:test`, not React Testing Library. Keep critical behavior testable without a DOM.
- Migrate the current five tools first, prove they work, then add advanced tools on top of the new engine.
- Do not add scope creep like import/export, server persistence, sharing, or collaboration in this pass.
- Use the `verification-before-completion` mindset: never claim the overhaul works until the full automated and manual checks are done.
