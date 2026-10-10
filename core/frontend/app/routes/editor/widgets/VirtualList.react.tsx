import { default as React, useMemo, useState } from "react";

export interface VirtualListProps<T> {
  ariaLabel?: string;
  className?: string;
  height?: number;
  getItem?: (index: number) => T;
  itemCount?: number;
  items?: readonly T[];
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  rowHeight?: number;
  role?: React.AriaRole;
}

/** Fixed-height windowing that keeps mounted DOM proportional to the viewport. */
export function VirtualList<T>({
  ariaLabel,
  className,
  height = 240,
  getItem,
  itemCount,
  items,
  overscan = 4,
  renderItem,
  rowHeight = 28,
  role = "list",
}: VirtualListProps<T>): React.JSX.Element {
  const count = itemCount ?? items?.length ?? 0;
  const itemAt = getItem ?? ((index: number): T => items![index]);
  const [scrollTop, setScrollTop] = useState(0);
  const range = useMemo(() => {
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(height / rowHeight) + overscan * 2;
    return { first, last: Math.min(count, first + visibleCount) };
  }, [count, height, overscan, rowHeight, scrollTop]);

  return (
    <div
      aria-label={ariaLabel}
      className={className}
      data-rendered-row-count={range.last - range.first}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      role={role}
      style={{ height, overflowY: "auto", position: "relative" }}
    >
      <div style={{ height: count * rowHeight, position: "relative" }}>
        {Array.from({ length: range.last - range.first }, (_, offset) => {
          const index = range.first + offset;
          const item = itemAt(index);
          return (
            <div
              key={index}
              style={{
                height: rowHeight,
                left: 0,
                position: "absolute",
                right: 0,
                top: index * rowHeight,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
