/**
 * Public browser client instance and the contracts used to configure it.
 *
 * This facade intentionally sits outside the generated client so generated
 * files can be replaced without losing the supported package API.
 */
export { client } from "./client/client.gen";
export type { CreateClientConfig } from "./client/client.gen";
export type {
  Client,
  ClientOptions,
  Config,
  Options,
  RequestResult,
  TDataShape,
} from "./client/client/types.gen";
