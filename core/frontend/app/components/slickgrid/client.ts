/** The browser-only SlickGrid module supplied to hydrated route components. */
export type SlickgridModule = typeof import("slickgrid-react");

/** Restores the browser-only module type after React Router serializes loader data. */
export function asSlickgridModule(value: unknown): SlickgridModule {
  return value as SlickgridModule;
}

export interface ClientLoaderArgs {
  serverLoader: () => Promise<object>;
}

type ServerLoaderData<TArgs extends ClientLoaderArgs> = Awaited<
  ReturnType<TArgs["serverLoader"]>
>;

/**
 * Creates the standard hydrated client loader used by SlickGrid routes.
 * SlickGrid reads `document` during import, so the module must stay out of SSR.
 */
export function createSlickgridClientLoader<TArgs extends ClientLoaderArgs>() {
  const clientLoader = async ({ serverLoader }: TArgs) => {
    const [loaderData, SG] = await Promise.all([
      serverLoader(),
      import("slickgrid-react"),
    ]);

    return { ...loaderData, SG } as ServerLoaderData<TArgs> & {
      SG: SlickgridModule;
    };
  };

  clientLoader.hydrate = true as const;
  return clientLoader;
}
