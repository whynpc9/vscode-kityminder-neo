type KeyboardCompositionEventLike = Pick<KeyboardEvent, 'isComposing' | 'keyCode'>;
type InlineEditNativeShortcutEventLike = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey'
>;

export function getHistoryShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

export function isImeCompositionKeyEvent(event: KeyboardCompositionEventLike): boolean {
  return event.isComposing || event.keyCode === 229;
}

export function isInlineEditNativeTextShortcut(
  event: InlineEditNativeShortcutEventLike,
): boolean {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey) return false;

  const key = event.key.toLowerCase();
  return key === 'a' || key === 'c' || key === 'v' || key === 'x';
}
