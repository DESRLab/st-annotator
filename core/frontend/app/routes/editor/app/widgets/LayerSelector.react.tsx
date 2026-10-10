import type { ChangeEvent, JSX } from "react";

/** The plain identity of a layer rendered as a selector option. */
export interface LayerSelectorOption {
  key: string;
  name: string;
}

interface LayerSelectorRowProps {
  disabled?: boolean;
  layers: readonly LayerSelectorOption[];
  onChange: (key: string | null) => void;
  selectedKey: string | null;
}

export function LayerSelectorRow({
  disabled = false,
  layers,
  onChange,
  selectedKey,
}: LayerSelectorRowProps): JSX.Element {
  return (
    <div className="tp-lblv tp-v-fst tp-v-vfst tp-v-lst tp-v-vlst react-layer-based-row">
      <div className="tp-lblv_l">Configure Layer:</div>
      <div className="tp-lblv_v">
        <div className="tp-lstv">
          <select
            className="tp-lstv_s"
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              const { value } = event.currentTarget;
              onChange(value === "" ? null : value);
            }}
            value={selectedKey ?? ""}
          >
            <option value="">(No layer selected)</option>
            {layers.map((layer) => (
              <option key={layer.key} value={layer.key}>
                {layer.name}
              </option>
            ))}
          </select>
          <div aria-hidden="true" className="tp-lstv_m">
            <svg>
              <path d="M5 7h6l-3 3 z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
