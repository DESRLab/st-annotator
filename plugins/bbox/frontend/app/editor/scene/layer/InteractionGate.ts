/** Whether bbox interaction must remain disabled for the current inputs. */
export function shouldDisableBBoxInteraction(
  isActive: boolean,
  labelData: unknown,
  sourceData: unknown,
): boolean {
  return !isActive || labelData == null || sourceData == null;
}
