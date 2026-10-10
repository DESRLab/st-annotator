import type { ComponentType } from "react";

export interface FileContextDialogProps {
  paths: string[];
  show: boolean;
  onHide: () => void;
}

export interface FileContextActionArgs {
  formData: FormData;
  accessToken: string;
}

export interface FileContextActionResult {
  error?: string;
  success?: string;
}

export interface FileRegistrationLookupArgs {
  accessToken: string;
  paths: string[];
}

export type FileRegistrationLookupResult = Record<string, string[]>;

export interface FileContextHandler {
  pattern: RegExp;
  allowMultiple?: boolean;
  iconCssClass?: string;
  actionType?: string;
  action?: (args: FileContextActionArgs) => Promise<FileContextActionResult>;
  registrationLookup?: (
    args: FileRegistrationLookupArgs,
  ) => Promise<FileRegistrationLookupResult>;
  handler?: (ids: string[]) => Promise<void>;
  modal?: ComponentType<FileContextDialogProps>;
  loadModal?: () => Promise<ComponentType<FileContextDialogProps>>;
}

export const FILE_HANDLERS: Record<string, FileContextHandler> = {};
