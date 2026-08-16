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
