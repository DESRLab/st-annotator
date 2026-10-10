import { createElement, useState } from "react";
import { Col, Form, Row, Spinner } from "react-bootstrap";
import { Form as RouterForm, useNavigation, useSubmit } from "react-router";

import type { SourceGroupPublic as SourceGroup } from "../../client";

export { normalizeError } from "../errors";
export { totalItemsFromContentRange } from "../content-range";

export function formatUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "symbol" || typeof value === "function") {
    return value.toString();
  }
  return "";
}

export function toDateTimeInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toIsoDateTimeValue(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function toOptionalCreateDateTimeValue(
  value: string,
): string | undefined {
  return value.trim() === "" ? undefined : toIsoDateTimeValue(value.trim());
}

export function toOptionalUpdateDateTimeValue(value: string): string | null {
  return value.trim() === "" ? null : toIsoDateTimeValue(value.trim());
}

export function parseOptionalInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function sortSourceGroups(groups: SourceGroup[]): SourceGroup[] {
  return groups
    .slice()
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

export function SourceDataFilterForm({
  controlIdPrefix,
  sourceGroups,
  selectedSourceGroupId,
  onSourceGroupValueChange,
}: {
  controlIdPrefix: string;
  sourceGroups: SourceGroup[];
  selectedSourceGroupId: number | null;
  onSourceGroupValueChange?: (value: string) => void;
}) {
  const [sourceGroupValue, setSourceGroupValue] = useState(
    selectedSourceGroupId == null ? "" : String(selectedSourceGroupId),
  );
  const navigation = useNavigation();
  const submit = useSubmit();
  const pendingSourceGroupEntry = navigation.formData?.get("group_id");
  const pendingSourceGroupValue =
    (typeof pendingSourceGroupEntry === "string"
      ? pendingSourceGroupEntry
      : null) ??
    (navigation.location == null
      ? null
      : new URLSearchParams(navigation.location.search).get("group_id"));
  const isLoadingSourceGroup =
    navigation.state !== "idle" &&
    sourceGroupValue !== "" &&
    pendingSourceGroupValue === sourceGroupValue;

  return createElement(
    RouterForm,
    { method: "get", className: "mb-4" },
    createElement(
      Row,
      { className: "g-3 align-items-end" },
      createElement(
        Col,
        { md: 12 },
        createElement(
          Form.Group,
          { controlId: `${controlIdPrefix}-source-group-id` },
          createElement(Form.Label, null, "Source Group"),
          createElement(
            Form.Select,
            {
              name: "group_id",
              value: sourceGroupValue,
              onChange: (event) => {
                const nextValue = event.currentTarget.value;
                setSourceGroupValue(nextValue);
                onSourceGroupValueChange?.(nextValue);
                const form = event.currentTarget.form;
                if (form != null) {
                  void submit(new FormData(form), {
                    method: "get",
                  });
                }
              },
            },
            sourceGroups.length === 0
              ? createElement("option", { value: "" }, "(No groups available)")
              : [
                  createElement(
                    "option",
                    { key: "placeholder", value: "" },
                    "(Select a group...)",
                  ),
                  ...sourceGroups.map((group) =>
                    createElement(
                      "option",
                      { key: group.id, value: group.id },
                      formatUnknown(group.name),
                    ),
                  ),
                ],
          ),
          isLoadingSourceGroup &&
            createElement(
              "div",
              {
                className: "mt-2 d-flex align-items-center text-muted small",
                role: "status",
              },
              createElement(Spinner, {
                animation: "border",
                size: "sm",
                className: "me-2",
              }),
              "Loading data...",
            ),
        ),
      ),
    ),
  );
}

export function formatFixedDecimal(
  value: string | null | undefined,
  places: number,
): string {
  if (value == null || value === "") {
    return "";
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue.toFixed(places)
    : String(value);
}
