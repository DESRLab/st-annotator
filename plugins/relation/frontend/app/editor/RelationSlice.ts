import type { RelationClass } from "./RelationIndex";
import type { RelationSettings } from "./RelationSettings";

export interface RelationSlice {
  readonly version: number;
  readonly settings: Readonly<RelationSettings>;
  readonly active: boolean;
  readonly cycling: boolean;
  readonly hoveredId: string | null;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly mode: "edit" | "select" | "create" | "source" | "target";
  readonly classId: number | null;
  readonly selectedId: string | null;
  readonly firstEndpoint: string | null;
  readonly classes: readonly RelationClass[];
  readonly endpoints: readonly {
    id: string;
    type: string;
    text: string;
    visible: boolean;
  }[];
  readonly relations: readonly {
    id: string;
    displayId: string;
    records: readonly {
      id: string;
      displayId: string;
      name: string;
      classId: number;
      reversed: boolean;
      source: string;
      target: string;
    }[];
    name: string;
    source: string;
    sourceClassName: string | null;
    target: string;
    targetClassName: string | null;
    visible: boolean;
    hidden?: boolean;
  }[];
}
export interface RelationIntents {
  cycle(): void;
  setIsolation(enabled: boolean): void;
  setHidden(id: string, hidden: boolean): void;
  setSettings(settings: RelationSettings): void;
  setMode(mode: "select" | "create" | "source" | "target"): void;
  setClass(id: number, relationId?: string): void;
  select(id: string | null): void;
  replaceEndpoint(endpoint: "source" | "target", id: string): void;
  add(): Promise<void>;
  remove(): Promise<void>;
  cancel(): void;
}

/** Intent group merged into the editor's root intent interface. */
export interface RelationPluginIntents {
  readonly relation: RelationIntents;
}
