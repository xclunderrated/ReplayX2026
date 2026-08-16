import type { DrawingObject, DrawingPoint, DrawingToolId } from './types';
import { getDrawingToolDefinition } from './tools';
import { getDefaultToolPreset } from './defaults';

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
  activeTool: DrawingToolId | null;
  selectedIds: string[];
  draft: DrawingObject | null;
  lastCommitted: DrawingObject | null;
  dragStartPoint?: DrawingPoint;
  dragAnchorIndex?: number;
}

export type InteractionEvent =
  | { type: 'tool/activated'; tool: DrawingToolId }
  | { type: 'pointer/down-chart'; point: DrawingPoint; shiftKey?: boolean; altKey?: boolean }
  | { type: 'pointer/move-chart'; point: DrawingPoint; shiftKey?: boolean }
  | { type: 'pointer/up-chart'; point: DrawingPoint }
  | { type: 'selection/changed'; selectedIds: string[] }
  | { type: 'keyboard/escape' }
  | { type: 'keyboard/enter' }
  | { type: 'text/start-edit'; id: string };

export function createInitialInteractionState(): DrawingInteractionState {
  return {
    mode: 'idle',
    activeTool: null,
    selectedIds: [],
    draft: null,
    lastCommitted: null,
  };
}

export function reduceDrawingInteraction(
  state: DrawingInteractionState,
  event: InteractionEvent
): DrawingInteractionState {
  switch (event.type) {
    case 'tool/activated': {
      if (event.tool === 'select') {
        return {
          ...state,
          mode: state.selectedIds.length > 0 ? 'selected' : 'idle',
          activeTool: 'select',
          draft: null,
        };
      }
      return {
        ...state,
        mode: 'drawing',
        activeTool: event.tool,
        draft: null,
      };
    }

    case 'pointer/down-chart': {
      if (state.mode === 'drawing' && state.activeTool) {
        const def = getDrawingToolDefinition(state.activeTool);
        const preset = getDefaultToolPreset(state.activeTool);
        const initialPoints: DrawingPoint[] = [event.point];

        // For single-anchor tools (e.g. horizontal line, vertical line, text, marker)
        if (def.anchorCount === 1) {
          const committed: DrawingObject = {
            id: crypto.randomUUID(),
            tool: state.activeTool,
            family: def.family,
            points: initialPoints,
            style: preset.style,
            locked: false,
            hidden: false,
            zIndex: Date.now(),
            meta: { version: 1, source: 'manual' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          return {
            ...state,
            mode: 'selected',
            selectedIds: [committed.id],
            draft: null,
            lastCommitted: committed,
          };
        }

        // Multi-anchor (e.g. 2 anchors like trendline, rectangle)
        const draftObject: DrawingObject = {
          id: crypto.randomUUID(),
          tool: state.activeTool,
          family: def.family,
          points: [event.point, event.point],
          style: preset.style,
          locked: false,
          hidden: false,
          zIndex: Date.now(),
          meta: { version: 1, source: 'manual' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        return {
          ...state,
          draft: draftObject,
          dragStartPoint: event.point,
        };
      }
      return state;
    }

    case 'pointer/move-chart': {
      if (state.mode === 'drawing' && state.draft) {
        const points = [...state.draft.points];
        points[points.length - 1] = event.point;
        return {
          ...state,
          draft: {
            ...state.draft,
            points,
          },
        };
      }
      return state;
    }

    case 'pointer/up-chart': {
      if (state.mode === 'drawing' && state.draft) {
        const committed: DrawingObject = {
          ...state.draft,
          points: state.draft.points.map((p, i) => (i === state.draft!.points.length - 1 ? event.point : p)),
          updatedAt: Date.now(),
        };

        return {
          ...state,
          mode: 'selected',
          selectedIds: [committed.id],
          draft: null,
          lastCommitted: committed,
        };
      }
      return state;
    }

    case 'selection/changed': {
      return {
        ...state,
        selectedIds: event.selectedIds,
        mode: event.selectedIds.length > 0 ? 'selected' : 'idle',
      };
    }

    case 'keyboard/escape': {
      if (state.mode === 'editing-text') {
        return { ...state, mode: 'selected' };
      }
      if (state.mode === 'drawing') {
        return { ...state, mode: 'idle', activeTool: null, draft: null };
      }
      if (state.mode === 'selected') {
        return { ...state, mode: 'idle', selectedIds: [] };
      }
      return state;
    }

    case 'keyboard/enter': {
      if (state.mode === 'editing-text') {
        return { ...state, mode: 'selected' };
      }
      return state;
    }

    case 'text/start-edit': {
      return {
        ...state,
        mode: 'editing-text',
        selectedIds: [event.id],
      };
    }

    default:
      return state;
  }
}
