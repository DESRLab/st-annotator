import {
  default as React,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface VirtualComboboxItem<TId> {
  readonly id: TId;
  readonly text: string;
}

export interface VirtualComboboxProps<TId> {
  disabled?: boolean;
  items:
    | Iterable<VirtualComboboxItem<TId>>
    | (() => Iterable<VirtualComboboxItem<TId>>);
  maxResults?: number;
  nullText: string;
  onChange: (id: TId | null) => void;
  value: TId | null;
}

/** Searchable bounded label picker; it never creates an option per label. */
export function VirtualCombobox<TId>({
  disabled = false,
  items,
  maxResults = 100,
  nullText,
  onChange,
  value,
}: VirtualComboboxProps<TId>): React.JSX.Element {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<React.CSSProperties>(
    {},
  );
  const [dropdownTheme, setDropdownTheme] = useState<React.CSSProperties>({});
  const iterateItems = (): Iterable<VirtualComboboxItem<TId>> =>
    typeof items === "function" ? items() : items;
  const preview = useMemo(() => {
    const values: VirtualComboboxItem<TId>[] = [];
    for (const item of iterateItems()) {
      values.push(item);
      if (values.length > maxResults) break;
    }
    return values;
  }, [items, maxResults]);
  const isSmallCollection = preview.length <= maxResults;
  const { results, selected } = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matches: VirtualComboboxItem<TId>[] = [];
    let selectedItem = isSmallCollection
      ? (preview.find((item) => item.id === value) ?? null)
      : null;
    const candidates = isSmallCollection ? preview : iterateItems();
    for (const item of candidates) {
      if (value != null && item.id === value) selectedItem = item;
      if (
        matches.length < maxResults &&
        (normalizedQuery === "" ||
          String(item.id).toLocaleLowerCase().includes(normalizedQuery) ||
          item.text.toLocaleLowerCase().includes(normalizedQuery))
      ) {
        matches.push(item);
      }
      if (
        matches.length >= maxResults &&
        (value == null || selectedItem != null)
      )
        break;
    }
    return { results: matches, selected: selectedItem };
  }, [isSmallCollection, items, maxResults, preview, query, value]);

  const choose = (id: TId | null): void => {
    onChange(id);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const nullValue = nullText;

  useEffect(() => {
    if (!open) return;
    const positionDropdown = (): void => {
      const bounds = inputRef.current?.getBoundingClientRect();
      if (bounds == null) return;
      const inputStyle = window.getComputedStyle(inputRef.current!);
      const theme = Object.fromEntries(
        [
          "--bs-bg",
          "--bs-ff",
          "--bs-sh",
          "--bld-br",
          "--bld-hp",
          "--btn-bg",
          "--btn-bg-a",
          "--btn-bg-f",
          "--btn-bg-h",
          "--btn-fg",
          "--cnt-usz",
        ].map((property) => [property, inputStyle.getPropertyValue(property)]),
      );
      setDropdownPosition({
        left: bounds.left,
        top: bounds.bottom,
        width: bounds.width,
      });
      setDropdownTheme(theme);
    };
    positionDropdown();
    window.addEventListener("resize", positionDropdown);
    window.addEventListener("scroll", positionDropdown, true);
    return () => {
      window.removeEventListener("resize", positionDropdown);
      window.removeEventListener("scroll", positionDropdown, true);
    };
  }, [open]);

  return (
    <div
      className="react-virtual-combobox"
      style={{ position: "relative", width: "100%" }}
    >
      {isSmallCollection && (
        // Preserve the legacy programmatic select surface while the
        // visible control remains consistently searchable.
        <select
          aria-hidden="true"
          disabled={disabled}
          onChange={(event) => {
            const serialized = event.currentTarget.value;
            onChange(
              serialized === nullValue
                ? null
                : (preview.find((item) => String(item.id) === serialized)?.id ??
                    null),
            );
          }}
          style={{ display: "none" }}
          tabIndex={-1}
          value={value == null ? nullValue : String(value)}
        >
          <option value={nullValue}>{nullText}</option>
          {preview.map((item) => (
            <option key={String(item.id)} value={String(item.id)}>
              {item.text}
            </option>
          ))}
        </select>
      )}
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        className="tp-txtv_i"
        disabled={disabled}
        onBlur={() => window.setTimeout(() => setOpen(false), 0)}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, results.length));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            if (activeIndex === 0) {
              choose(null);
            } else {
              const activeResult = results[activeIndex - 1];
              if (activeResult != null) choose(activeResult.id);
            }
          }
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder={nullText}
        ref={inputRef}
        role="combobox"
        value={open ? query : (selected?.text ?? nullText)}
      />
      {open &&
        !disabled &&
        createPortal(
          <div
            className="react-virtual-combobox-list"
            id={listId}
            onMouseDown={(event) => event.preventDefault()}
            role="listbox"
            style={{ ...dropdownPosition, ...dropdownTheme }}
          >
            <button
              aria-selected={activeIndex === 0}
              className="react-virtual-combobox-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(null)}
              role="option"
              type="button"
            >
              {nullText}
            </button>
            {results.map((item, index) => (
              <button
                aria-selected={activeIndex === index + 1}
                className="react-virtual-combobox-option"
                data-label-id={String(item.id)}
                key={String(item.id)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item.id)}
                role="option"
                style={{ display: "block", width: "100%" }}
                type="button"
              >
                {item.text}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
