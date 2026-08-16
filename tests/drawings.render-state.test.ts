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

test('buildDrawingRenderState includes selection handles for selected objects', () => {
  const result = buildDrawingRenderState([
    {
      id: 'r1',
      tool: 'rectangle',
      family: 'range',
      points: [
        { time: 10, price: 1.2 },
        { time: 20, price: 1.1 },
      ],
      style: { strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid', opacity: 1, fillColor: '#3b82f6', fillOpacity: 0.2 },
      locked: false,
      hidden: false,
      zIndex: 0,
      meta: { version: 1, source: 'manual' },
      createdAt: 1,
      updatedAt: 1,
    },
  ], {
    toX: (time) => time * 10,
    toY: (price) => price * 100,
  }, ['r1']);

  assert.equal(result[0].kind, 'rectangle');
  assert.equal(result[0].selected, true);
  assert.ok(result[0].handles && result[0].handles.length > 0);
});
