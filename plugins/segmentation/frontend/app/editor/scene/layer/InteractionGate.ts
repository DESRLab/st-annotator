/** Whether segmentation interaction must remain disabled for the current inputs. */
export function shouldDisableSegmentationInteraction(
  isActive: boolean,
  labelData: unknown,
  pointCloudUtils: unknown,
): boolean {
  return !isActive || labelData == null || pointCloudUtils == null;
}
