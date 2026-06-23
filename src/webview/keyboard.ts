type KeyboardCompositionEventLike = Pick<KeyboardEvent, 'isComposing' | 'keyCode'>;

export function isImeCompositionKeyEvent(event: KeyboardCompositionEventLike): boolean {
  return event.isComposing || event.keyCode === 229;
}
