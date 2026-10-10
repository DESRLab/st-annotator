/** Whether vector interaction must remain disabled for the current inputs. */
export function shouldDisableVectorInteraction(
  isActive: boolean,
  labelData: unknown,
  sourceData: unknown,
): boolean {
  return !isActive || labelData == null || sourceData == null;
}
