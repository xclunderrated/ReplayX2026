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
