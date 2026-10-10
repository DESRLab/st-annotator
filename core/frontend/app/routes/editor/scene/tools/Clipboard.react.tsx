import type { JSX, MouseEventHandler } from "react";

import { useSourceEventVersion } from "../../widgets";
import type { SourceEventTarget } from "../../widgets";
import { ClipboardPaneView } from "../widgets/ClipboardPane.react.tsx";

import type { ClipboardViewState } from "./Clipboard.tsx";

/**
 * The narrow source of a clipboard consumed by the React view.
 *
 * Kept structural so React never depends on the `Clipboard` class.
 */
export interface ClipboardSource extends SourceEventTarget {
  getViewState(): Readonly<ClipboardViewState>;
  onCopyClick: MouseEventHandler<HTMLButtonElement>;
  onPasteClick: MouseEventHandler<HTMLButtonElement>;
}

export function ClipboardToolView({
  clipboard,
}: {
  clipboard: ClipboardSource;
}): JSX.Element {
  useSourceEventVersion(clipboard, "change");
  const { disabled, disableCopy, disablePaste } = clipboard.getViewState();

  return (
    <ClipboardPaneView
      onCopy={clipboard.onCopyClick}
      onPaste={clipboard.onPasteClick}
      paneParams={{
        inputtedData: {},
        computedData: {},
        settings: {
          disabled,
          hidden: false,
          disableCopy,
          disablePaste,
        },
      }}
    />
  );
}
