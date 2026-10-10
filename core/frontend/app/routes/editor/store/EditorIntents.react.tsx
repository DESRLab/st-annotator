import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { EditorIntents } from "./intents";

// The context carries the intents type with plugin groups erased; the
// composition root supplies the concrete `EditorIntents<TPluginIntents>`
// and consumers narrow it again. `any` here is deliberate: it lets base
// components call the base intents fully typed without depending on the
// plugin packages (which depend on base, not the reverse).

const EditorIntentsContext = createContext<EditorIntents<any>>(null);

export interface EditorIntentsProviderProps<TPluginIntents extends {} = {}> {
  intents: EditorIntents<TPluginIntents>;
  children?: ReactNode;
}

/** Provides the editor intents (write-side actions) to the React tree. */
export function EditorIntentsProvider<TPluginIntents extends {} = {}>({
  intents,
  children,
}: EditorIntentsProviderProps<TPluginIntents>): React.JSX.Element {
  return (
    <EditorIntentsContext.Provider value={intents}>
      {children}
    </EditorIntentsContext.Provider>
  );
}

export interface OptionalEditorIntentsProviderProps<
  TPluginIntents extends {} = {},
> {
  intents: EditorIntents<TPluginIntents> | null;
  children?: ReactNode;
}

/**
 * Provides the editor intents when they exist, and `null` before the
 * runtime owns them. The route wraps its WHOLE tree, including the scene
 * display and overlay host mounted before the runtime exists, in this
 * provider so the tree shape stays stable; intent-calling components (the
 * layer overlay inspector containers) only mount once the intents exist.
 */
export function OptionalEditorIntentsProvider<TPluginIntents extends {} = {}>({
  intents,
  children,
}: OptionalEditorIntentsProviderProps<TPluginIntents>): React.JSX.Element {
  return (
    <EditorIntentsContext.Provider value={intents}>
      {children}
    </EditorIntentsContext.Provider>
  );
}

/**
 * Returns the editor intents provided by {@link EditorIntentsProvider}.
 *
 * Pass the plugin intent groups the consumer needs as `TPluginIntents`
 * (e.g. `useEditorIntents<{ myPlugin: MyPluginIntents }>()`); the composition
 * root provides the merged object.
 */
export function useEditorIntents<
  TPluginIntents extends {} = {},
>(): EditorIntents<TPluginIntents> {
  const intents = useContext(
    EditorIntentsContext,
  ) as EditorIntents<TPluginIntents> | null;
  if (intents == null) {
    throw new Error(
      "useEditorIntents must be used inside EditorIntentsProvider",
    );
  }
  return intents;
}
