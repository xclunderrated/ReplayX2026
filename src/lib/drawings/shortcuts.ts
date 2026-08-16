export interface ShortcutCommand {
  id: string;
  shortcut: string;
  label?: string;
  category?: 'tools' | 'editing' | 'view';
}

export interface KeyboardEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export interface NormalizedShortcut {
  keyCombo: string;
  blocked: boolean;
}

export function createShortcutMap(): ShortcutCommand[] {
  return [
    { id: 'tool.select', shortcut: 'V', label: 'Select Tool', category: 'tools' },
    { id: 'tool.trendline', shortcut: 'T', label: 'Trend Line', category: 'tools' },
    { id: 'tool.rectangle', shortcut: 'R', label: 'Rectangle', category: 'tools' },
    { id: 'tool.horizontalLine', shortcut: 'H', label: 'Horizontal Line', category: 'tools' },
    { id: 'tool.verticalLine', shortcut: 'Shift+H', label: 'Vertical Line', category: 'tools' },
    { id: 'tool.fibRetracement', shortcut: 'F', label: 'Fib Retracement', category: 'tools' },
    { id: 'tool.measure', shortcut: 'M', label: 'Measure Tool', category: 'tools' },
    { id: 'tool.longPosition', shortcut: 'L', label: 'Long Position', category: 'tools' },
    { id: 'tool.shortPosition', shortcut: 'S', label: 'Short Position', category: 'tools' },
    { id: 'tool.brush', shortcut: 'B', label: 'Brush Tool', category: 'tools' },
    { id: 'tool.text', shortcut: 'A', label: 'Text Tool', category: 'tools' },
    { id: 'selection.delete', shortcut: 'Backspace', label: 'Delete Selected', category: 'editing' },
    { id: 'selection.deleteAlt', shortcut: 'Delete', label: 'Delete Selected', category: 'editing' },
    { id: 'selection.duplicate', shortcut: 'Ctrl+D', label: 'Duplicate Selected', category: 'editing' },
    { id: 'selection.lock', shortcut: 'Ctrl+L', label: 'Lock / Unlock', category: 'editing' },
    { id: 'selection.hide', shortcut: 'Ctrl+H', label: 'Hide / Show', category: 'editing' },
  ];
}

export function normalizeShortcutEvent(
  event: KeyboardEventLike,
  options?: { isTyping?: boolean }
): NormalizedShortcut {
  if (options?.isTyping) {
    return { keyCombo: '', blocked: true };
  }

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  let keyStr = event.key;
  if (keyStr.length === 1) {
    keyStr = keyStr.toUpperCase();
  }

  parts.push(keyStr);
  const keyCombo = parts.join('+');

  return { keyCombo, blocked: false };
}

export function findMatchingCommand(
  commands: ShortcutCommand[],
  normalized: NormalizedShortcut
): ShortcutCommand | undefined {
  if (normalized.blocked) return undefined;
  return commands.find((cmd) => cmd.shortcut.toLowerCase() === normalized.keyCombo.toLowerCase());
}
