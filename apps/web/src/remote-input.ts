export function virtualKey(code: string): number | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code.slice(6));
  if (/^F([1-9]|1[0-2])$/.test(code)) return 111 + Number(code.slice(1));
  return (
    {
      Enter: 13,
      Tab: 9,
      Escape: 27,
      Backspace: 8,
      Delete: 46,
      Insert: 45,
      Home: 36,
      End: 35,
      PageUp: 33,
      PageDown: 34,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
      ShiftLeft: 160,
      ShiftRight: 161,
      ControlLeft: 162,
      ControlRight: 163,
      AltLeft: 164,
      AltRight: 165,
      MetaLeft: 91,
      MetaRight: 92,
      Space: 32,
      NumpadEnter: 13,
      NumpadDivide: 111,
      NumpadMultiply: 106,
      NumpadSubtract: 109,
      NumpadAdd: 107,
      NumpadDecimal: 110,
      CapsLock: 20,
    } as Record<string, number>
  )[code];
}
export function pointInFrame(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
) {
  return {
    x: Math.min(
      1,
      Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)),
    ),
    y: Math.min(
      1,
      Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)),
    ),
  };
}
