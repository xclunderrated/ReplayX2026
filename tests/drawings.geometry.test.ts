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
    { time: 10, price: 1.15 }
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
