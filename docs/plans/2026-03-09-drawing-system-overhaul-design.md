# Drawing System Overhaul Design

Date: 2026-03-09
Status: Brainstormed / validated

## Goal

Overhaul the current chart drawing system so it feels native and professional:
- TradingView-style drawing interactions
- Persistent right-side inspector for object settings
- Power-user keyboard workflow with single-key shortcuts
- Large tool suite from day one
- Per-object settings plus sticky per-tool defaults

## Current State

The current implementation is intentionally lightweight but too limited for the target experience.

### Existing behavior
- Left toolbar in `src/components/SessionView.tsx`
- Drawing interaction logic embedded directly in `src/components/TradingViewChart.tsx`
- SVG overlay rendering in `src/components/TradingViewChart.tsx`
- Minimal persisted drawing model in `src/store/useSimulatorStore.ts`

### Current stored shape model
The store currently supports:
- `trendline`
- `horizontalLine`
- `rectangle`
- `text`
- `measure`

Current drawing objects only persist:
- `id`
- `type`
- `points`
- `color`
- optional `text`

### Current limitations
- No robust selection model
- No drag handles / anchor editing
- No per-object inspector
- No lock / hide / duplicate / reorder behavior
- No keyboard command system
- Tool settings are effectively hardcoded
- Rendering, interaction, and persistence are tightly coupled in one component

## Product Direction

The target experience is a hybrid of:
1. TradingView-style chart annotations and object editing
2. Native-feeling desktop workflow with strong keyboard support

### Confirmed product decisions
- Tool scope: **big suite from day one**
- Settings UI: **persistent right inspector sidebar**
- Keyboard mode: **power-user mode**
- Settings persistence: **per-object settings + sticky tool defaults**

## UX Principles

1. **Selection-first editing**
   - Objects should be selectable, movable, resizable, and editable after creation.
2. **Keyboard-first speed**
   - Single-key hotkeys should make the system fast for power users.
3. **Inspector-driven precision**
   - The right panel should expose both style and geometry in a predictable way.
4. **Shared primitives over one-off implementations**
   - New tools should reuse tool families and geometry primitives.
5. **Persistent object identity**
   - Every drawing should be durable, editable, and versionable.
6. **Incremental migration**
   - The current chart should host the new system, not absorb more ad hoc logic.

## Proposed Architecture

Create a dedicated drawing subsystem under `src/lib/drawings/`.

### Modules
- `types.ts` — discriminated drawing document model
- `tools.ts` — tool registry and tool metadata
- `defaults.ts` — per-tool sticky defaults and default presets
- `geometry.ts` — common geometry math, bounding boxes, snapping helpers
- `hitTest.ts` — object and anchor hit testing
- `interaction.ts` — drawing/selection/editing state machine
- `shortcuts.ts` — command registry and keyboard bindings
- `render.tsx` — overlay rendering primitives
- `selectors.ts` — derived selection/inspector helpers
- `migrations.ts` — persistence migration from current drawing model

### Layer responsibilities

#### 1) Tool registry
Each tool defines:
- id / type / group
- icon
- keyboard shortcut
- anchor count / creation flow
- preview behavior while drawing
- available inspector fields
- default style preset
- whether the tool supports multi-stage editing, snapping, extension, text entry, etc.

#### 2) Document model
Stores normalized persisted objects with stable identity and type-specific payloads.

#### 3) Interaction controller
Owns all pointer and keyboard behavior:
- idle
- drawing
- selected
- dragging anchor
- dragging body
- box-selecting
- editing text
- panning override

#### 4) Renderer
Turns document objects into SVG overlay output, selection handles, hover states, preview states, and hit zones.

## Drawing Model

Replace the current minimal `Drawing` type with a discriminated object model.

### Base object shape
All drawings should have common fields:
- `id`
- `tool`
- `family`
- `type`
- `points`
- `style`
- `meta`
- `locked`
- `hidden`
- `zIndex`
- `createdAt`
- `updatedAt`

### Shared point shape
Each anchor point should continue to store chart-space data:
- `time`
- `price`

### Base metadata
Recommended metadata fields:
- `name?: string`
- `notes?: string`
- `source?: 'manual' | 'template' | 'import'`
- `version: number`

## Tool Families

Implement a large suite from day one, but organized by reusable families.

### 1) Line tools
- trendline
- ray
- extended line
- horizontal line
- vertical line
- parallel channel

Shared capabilities:
- 1-3 anchors depending on tool
- extend left / extend right
- constrained angle with `Shift`
- optional label display
- stroke settings

### 2) Range / box tools
- rectangle
- measure
- long position box
- short position box

Shared capabilities:
- 2 anchors
- fill + border
- measurement metrics in overlay labels
- optional ratio / R-multiple / percent display

### 3) Ratio tools
- fib retracement

Shared capabilities:
- 2 anchors
- configurable levels
- label visibility
- level styling and defaults

### 4) Path / directional tools
- arrow
- brush / free path
- polyline

Shared capabilities:
- multiple points
- optional smoothing / simplification
- arrowheads / caps
- stroke settings

### 5) Annotation tools
- text
- callout
- anchored note
- markers

Shared capabilities:
- inline editing
- font controls
- text background / border
- pointer tail / anchor relation for callouts

## Style Model

Move from a single `color` string to structured style objects.

### Shared style fields
- `strokeColor`
- `strokeWidth`
- `strokeStyle` (`solid`, `dashed`, `dotted`)
- `opacity`
- `fillColor`
- `fillOpacity`
- `showHandles`
- `showLabels`

### Text style fields
- `fontFamily`
- `fontSize`
- `fontWeight`
- `textColor`
- `textAlign`
- `backgroundColor`
- `backgroundOpacity`
- `borderColor`
- `padding`

### Tool-specific style fields
- `arrowStart`
- `arrowEnd`
- `extendLeft`
- `extendRight`
- `magnetMode`
- `snapMode`
- `fibLevels`
- `measurementMode`

## Inspector Sidebar

The right-side inspector is the primary editing surface.

### Inspector states

#### Nothing selected
Show active tool defaults:
- default style for current tool
- shortcut hint
- save/reset defaults actions

#### Single object selected
Show object properties:
- object actions
- visibility/lock
- style
- text (if applicable)
- geometry / anchor values
- tool-specific settings

#### Multiple objects selected
Show only shared compatible properties:
- visibility/lock
- shared style fields
- bulk delete / duplicate / hide / lock

### Inspector sections

#### Visibility & behavior
- hide / show
- lock / unlock
- snap enablement
- magnet strength
- extend left/right when supported

#### Style
- stroke color
- fill color
- opacity
- line type
- line thickness

#### Text
- font family
- size
- weight
- alignment
- text color
- background

#### Geometry
- exact anchor time/price values
- width / height / angle where applicable
- measurement options

#### Meta / actions
- duplicate
- bring forward / send backward / bring to front / send to back
- reset style
- delete

## Keyboard and Command System

Introduce a centralized shortcut manager with named commands.

### Core commands
- `tool.select`
- `tool.trendline`
- `tool.rectangle`
- `tool.horizontalLine`
- `tool.verticalLine`
- `tool.arrow`
- `tool.brush`
- `tool.fib`
- `tool.measure`
- `tool.text`
- `selection.delete`
- `selection.duplicate`
- `selection.lock`
- `selection.hide`
- `selection.bringForward`
- `selection.sendBackward`
- `selection.clear`
- `inspector.toggle`
- `shortcuts.show`

### Recommended default shortcuts
- `V` — cursor/select
- `T` — trendline
- `R` — rectangle
- `H` — horizontal line
- `Shift+H` — vertical line
- `A` — arrow
- `B` — brush
- `F` — fib retracement
- `M` — measure
- `X` — text / callout
- `Delete` / `Backspace` — delete selection
- `Esc` — cancel current edit / clear selection / exit active tool
- `Enter` — commit text edit or finish eligible edit mode
- `Ctrl/Cmd+D` — duplicate selection
- `Ctrl/Cmd+L` — lock selection
- `Ctrl/Cmd+Shift+H` — hide selection
- `[` / `]` — z-order movement
- `?` — shortcut sheet

### Modifier behavior
- `Shift` — constrain angles/ratios
- `Alt/Option` — duplicate while dragging
- `Space` — temporary pan mode
- `Ctrl/Cmd` — additive selection modifier where helpful

### Interaction rules
- Shortcuts must be suspended while typing into text fields
- `Esc` should unwind state in this order:
  1. text editing
  2. active drawing preview
  3. current selection
  4. active tool
- `Enter` should commit text edits and certain staged tools

## Selection and Editing Behavior

### Pointer behavior
- Click object to select
- Shift-click to multi-select
- Drag empty area for marquee selection
- Drag object body to move
- Drag handles to edit anchors
- Double-click text-like objects to edit inline

### Native-feel behaviors
- Hover states for selectable objects and handles
- Selection outline with handles
- Live preview while drawing
- Live inspector updates on selection changes
- Duplicate-on-drag with `Alt/Option`
- Clear visual distinction for locked and hidden items

## Sticky Tool Defaults

Each tool should maintain a persisted `ToolPreset`.

### Behavior
- New objects inherit the active tool's last-used settings
- Editing an existing object changes only that object
- User can explicitly save current object style as the tool default
- User can reset tool defaults to system defaults

### Persistence scope
- Persist across sessions in app state
- Stored separately from individual drawing objects

## Store Changes

Update `src/store/useSimulatorStore.ts` to support the new system.

### Replace / expand state
- `drawings: DrawingObject[]`
- `selectedDrawingIds: string[]`
- `activeDrawingTool: DrawingTool | null`
- `toolDefaults: Record<DrawingTool, ToolPreset>`
- `drawingUi: DrawingUiState`

### Add actions
- `createDrawing`
- `updateDrawing`
- `updateDrawings`
- `deleteDrawing`
- `deleteSelectedDrawings`
- `duplicateDrawing`
- `duplicateSelectedDrawings`
- `selectDrawing`
- `setSelectedDrawings`
- `clearDrawingSelection`
- `reorderDrawings`
- `setDrawingVisibility`
- `setDrawingLocked`
- `setToolDefaults`
- `resetToolDefaults`
- `migrateLegacyDrawings`

### Recommended non-persisted UI state
- active interaction mode
- hover target
- current draft object
- active text edit target
- marquee selection box

## Rendering Strategy

The chart should remain the host, but the drawing engine owns overlay semantics.

### Rendering responsibilities
- draw persisted objects
- draw current draft preview
- draw selection outlines and handles
- draw text and measurement labels
- draw hover feedback
- draw hit regions independently from visual styling where needed

### Performance notes
- Use memoized render lists derived from drawing state + chart coordinate transforms
- Separate hit testing from paint where practical
- Avoid full overlay rebuilds on unrelated state changes
- Reuse geometry helpers for bounding boxes and handle placement

## Migration Strategy

Do not continue growing drawing logic inside `TradingViewChart.tsx`.

### New structure
Create a new subsystem under `src/lib/drawings/` and have `TradingViewChart.tsx` call into it.

### Host responsibilities that remain in `TradingViewChart.tsx`
- chart and series lifecycle
- coordinate conversion helpers
- integration with replay viewport and candles
- delegating pointer events to drawing interaction controller
- mounting the drawing overlay

### Responsibilities to remove from `TradingViewChart.tsx`
- tool-specific creation branching
- drawing model definitions
- selection logic
- drawing hit testing
- shortcut dispatch
- inspector field definitions

## Suggested File Layout

```text
src/
  components/
    DrawingInspector.tsx
    DrawingToolbar.tsx
    ShortcutHelpModal.tsx
  lib/
    drawings/
      defaults.ts
      geometry.ts
      hitTest.ts
      interaction.ts
      migrations.ts
      render.tsx
      selectors.ts
      shortcuts.ts
      tools.ts
      types.ts
```

## Rollout Plan

Implement in phases to reduce risk.

### Phase 1 — foundation
- Create drawing types, tool registry, and defaults model
- Add selection state and inspector shell
- Add migration path for legacy drawings

### Phase 2 — migrate current tools
- trendline
- horizontal line
- rectangle
- text
- measure
- selection handles and object editing

### Phase 3 — keyboard system
- command registry
- single-key tool activation
- selection/edit hotkeys
- shortcut help overlay

### Phase 4 — advanced tools
- vertical line
- ray
- extended line
- arrow
- brush / polyline
- callout / anchored note
- channel
- fib retracement
- trader-oriented range boxes

### Phase 5 — polish
- snapping / magnet behavior
- duplicate-drag
- z-order actions
- save current style as default
- hidden/locked visual polish
- inspector refinements

## Risks and Mitigations

### Risk: component complexity explosion
Mitigation:
- move logic out of `TradingViewChart.tsx`
- centralize tool definitions and commands

### Risk: persistence breakage for existing users
Mitigation:
- add migration layer from legacy drawing records
- keep versioned drawing schema

### Risk: poor performance with many drawings
Mitigation:
- memoized render lists
- efficient hit testing
- isolate overlay updates from chart updates

### Risk: shortcut conflicts
Mitigation:
- command registry with focus guards
- disable shortcuts while typing
- provide discoverable shortcut sheet

## Recommended First Implementation Targets

1. New drawing document types and migrations
2. Selection model and handles
3. Inspector sidebar shell
4. Keyboard command manager
5. Migration of existing tools
6. Advanced tool expansion

## Notes

This directory is not currently a Git repository, so the design cannot be committed here automatically. The design document is still written to disk for implementation planning.
