import { DRAWING_TOOLS } from './tools';
import { getDefaultToolPreset, type ToolPreset } from './defaults';
import type { DrawingObject, DrawingToolId } from './types';

export interface DrawingDocument {
  objects: DrawingObject[];
  selectedIds: string[];
  activeTool: DrawingToolId;
  toolDefaults: Record<DrawingToolId, ToolPreset>;
}

export function createDrawingDocument(): DrawingDocument {
  const toolDefaults = {} as Record<DrawingToolId, ToolPreset>;
  for (const tool of DRAWING_TOOLS) {
    toolDefaults[tool.id] = getDefaultToolPreset(tool.id);
  }

  return {
    objects: [],
    selectedIds: [],
    activeTool: 'select',
    toolDefaults,
  };
}

export function addDrawingObject(
  doc: DrawingDocument,
  object: DrawingObject,
  autoSelect = false
): DrawingDocument {
  const maxZ = doc.objects.reduce((max, o) => Math.max(max, o.zIndex), -1);
  const nextObject = { ...object, zIndex: maxZ + 1 };
  return {
    ...doc,
    objects: [...doc.objects, nextObject],
    selectedIds: autoSelect ? [object.id] : doc.selectedIds,
  };
}

export function updateDrawingObject(
  doc: DrawingDocument,
  id: string,
  updates: Partial<DrawingObject>
): DrawingDocument {
  return {
    ...doc,
    objects: doc.objects.map((o) => (o.id === id ? { ...o, ...updates, updatedAt: Date.now() } : o)),
  };
}

export function deleteDrawingObjects(doc: DrawingDocument, ids: string[]): DrawingDocument {
  const toDelete = new Set(ids);
  return {
    ...doc,
    objects: doc.objects.filter((o) => !toDelete.has(o.id)),
    selectedIds: doc.selectedIds.filter((id) => !toDelete.has(id)),
  };
}

export function duplicateSelectedDrawings(
  doc: DrawingDocument,
  idGenerator: () => string = () => crypto.randomUUID()
): DrawingDocument {
  if (doc.selectedIds.length === 0) return doc;

  const selectedSet = new Set(doc.selectedIds);
  const selectedObjects = doc.objects.filter((o) => selectedSet.has(o.id));
  const newIds: string[] = [];

  let nextMaxZ = doc.objects.reduce((max, o) => Math.max(max, o.zIndex), -1);

  const duplicates: DrawingObject[] = selectedObjects.map((o) => {
    const newId = idGenerator();
    newIds.push(newId);
    nextMaxZ += 1;

    // Offset points slightly for visibility
    const offsetPoints = o.points.map((p) => ({
      time: p.time,
      price: p.price * 1.001,
    }));

    return {
      ...o,
      id: newId,
      points: offsetPoints,
      zIndex: nextMaxZ,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  return {
    ...doc,
    objects: [...doc.objects, ...duplicates],
    selectedIds: newIds,
  };
}

export function selectDrawingObjects(
  doc: DrawingDocument,
  ids: string[],
  mode: 'replace' | 'toggle' | 'append' = 'replace'
): DrawingDocument {
  if (mode === 'replace') {
    return { ...doc, selectedIds: ids };
  }
  if (mode === 'append') {
    const current = new Set(doc.selectedIds);
    for (const id of ids) current.add(id);
    return { ...doc, selectedIds: Array.from(current) };
  }
  // toggle
  const current = new Set(doc.selectedIds);
  for (const id of ids) {
    if (current.has(id)) current.delete(id);
    else current.add(id);
  }
  return { ...doc, selectedIds: Array.from(current) };
}

export function updateToolPreset(
  doc: DrawingDocument,
  tool: DrawingToolId,
  presetUpdates: Partial<Omit<ToolPreset, 'style'>> & { style?: Partial<import('./types').DrawingStyle> }
): DrawingDocument {
  const current = doc.toolDefaults[tool] ?? getDefaultToolPreset(tool);
  return {
    ...doc,
    toolDefaults: {
      ...doc.toolDefaults,
      [tool]: {
        ...current,
        ...presetUpdates,
        style: {
          ...current.style,
          ...(presetUpdates.style ?? {}),
        },
      },
    },
  };
}

export function toggleLockSelected(doc: DrawingDocument): DrawingDocument {
  if (doc.selectedIds.length === 0) return doc;
  const selectedSet = new Set(doc.selectedIds);
  // If all selected are locked, unlock them. Otherwise, lock all.
  const allLocked = doc.objects.filter((o) => selectedSet.has(o.id)).every((o) => o.locked);
  return {
    ...doc,
    objects: doc.objects.map((o) =>
      selectedSet.has(o.id) ? { ...o, locked: !allLocked, updatedAt: Date.now() } : o
    ),
  };
}

export function toggleHideSelected(doc: DrawingDocument): DrawingDocument {
  if (doc.selectedIds.length === 0) return doc;
  const selectedSet = new Set(doc.selectedIds);
  const allHidden = doc.objects.filter((o) => selectedSet.has(o.id)).every((o) => o.hidden);
  return {
    ...doc,
    objects: doc.objects.map((o) =>
      selectedSet.has(o.id) ? { ...o, hidden: !allHidden, updatedAt: Date.now() } : o
    ),
  };
}
