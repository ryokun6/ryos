/** True when keyboard focus is in a text field other than this component's main input (e.g. tool cards). */
export function focusIsInOtherTextField(
  mainInputEl: HTMLInputElement | null
): boolean {
  const active = document.activeElement;
  if (!active || !(active instanceof HTMLElement)) return false;
  if (mainInputEl && active === mainInputEl) return false;
  if (active.isContentEditable) return true;
  const tag = active.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const input = active as HTMLInputElement;
    if (input.readOnly || input.disabled) return false;
    const textLikeTypes = new Set([
      "text",
      "search",
      "email",
      "password",
      "url",
      "tel",
      "number",
      "",
    ]);
    return textLikeTypes.has(input.type);
  }
  return Boolean(active.closest("[contenteditable=true]"));
}
