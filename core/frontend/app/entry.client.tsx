import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { configureApiClient } from "./backend";

configureApiClient();

// StrictMode intentionally removed: slickgrid-react is incompatible with it.
// See: https://github.com/ghiscoding/slickgrid-universal/tree/master/frameworks/slickgrid-react (Troubleshooting section)
startTransition(() => {
  hydrateRoot(document, <HydratedRouter />);
});
