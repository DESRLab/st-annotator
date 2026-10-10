import { default as React } from "react";

export interface ClipboardPaneSettings {
  disabled: boolean;
  hidden: boolean;
  disableCopy: boolean;
  disablePaste: boolean;
}

export interface ClipboardPaneParams {
  inputtedData: {};
  computedData: {};
  settings: ClipboardPaneSettings;
}

function getCopyButtonSettings({
  settings: { disabled, hidden, disableCopy },
}: Pick<ClipboardPaneParams, "settings">) {
  return {
    title: "Copy",
    disabled: disabled || disableCopy,
    hidden,
  };
}

function getPasteButtonSettings({
  settings: { disabled, hidden, disablePaste },
}: Pick<ClipboardPaneParams, "settings">) {
  return {
    title: "Paste",
    disabled: disabled || disablePaste,
    hidden,
  };
}

export interface ClipboardPaneViewProps {
  paneParams: Pick<
    ClipboardPaneParams,
    "inputtedData" | "computedData" | "settings"
  >;
  onCopy: React.MouseEventHandler<HTMLButtonElement>;
  onPaste: React.MouseEventHandler<HTMLButtonElement>;
}

export function ClipboardPaneView({
  paneParams,
  onCopy,
  onPaste,
}: ClipboardPaneViewProps): React.JSX.Element | null {
  const copySettings = getCopyButtonSettings(paneParams);
  const pasteSettings = getPasteButtonSettings(paneParams);

  if (paneParams.settings.hidden) return null;

  return (
    <div className="react-clipboard-pane">
      <div
        className={`tp-lblv tp-lblv-nol react-clipboard-row${paneParams.settings.disabled ? " tp-v-disabled" : ""}`}
      >
        <span
          className="tp-lblv_v react-clipboard-actions"
          style={{ display: "flex", gap: "2px", width: "100%" }}
        >
          <span className="tp-btnv" style={{ flex: 1, minWidth: 0 }}>
            <button
              className="tp-btnv_b"
              disabled={copySettings.disabled}
              hidden={copySettings.hidden}
              onClick={onCopy}
              type="button"
            >
              <span className="tp-btnv_t">{copySettings.title}</span>
            </button>
          </span>
          <span className="tp-btnv" style={{ flex: 1, minWidth: 0 }}>
            <button
              className="tp-btnv_b"
              disabled={pasteSettings.disabled}
              hidden={pasteSettings.hidden}
              onClick={onPaste}
              type="button"
            >
              <span className="tp-btnv_t">{pasteSettings.title}</span>
            </button>
          </span>
        </span>
      </div>
    </div>
  );
}
