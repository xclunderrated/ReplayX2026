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
