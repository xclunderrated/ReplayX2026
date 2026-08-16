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
