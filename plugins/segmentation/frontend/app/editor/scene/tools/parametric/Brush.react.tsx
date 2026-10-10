import { default as React } from "react";

export interface BrushCursorModel {
  diameter: string;
  enabled: boolean;
  left: string;
  top: string;
}

export function BrushCursorView({
  cursor,
}: {
  cursor: BrushCursorModel;
}): React.JSX.Element {
  return (
    <div
      className="brush"
      hidden={!cursor.enabled}
      style={{
        height: cursor.diameter,
        left: cursor.left,
        top: cursor.top,
        width: cursor.diameter,
      }}
    />
  );
}
