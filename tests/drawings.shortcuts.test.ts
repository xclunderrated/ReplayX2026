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
