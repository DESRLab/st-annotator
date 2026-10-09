import type { ComponentType } from 'react';

export type FileContextDialogProps = {
  paths: string[];
  show: boolean;
  onHide: () => void;
};

export type FileContextActionArgs = {
  formData: FormData;
  accessToken: string;
};

export type FileContextActionResult = {
  error?: string;
  success?: string;
};

export type FileRegistrationLookupArgs = {
  accessToken: string;
  paths: string[];
};

export type FileRegistrationLookupResult = Record<string, string[]>;

export type FileContextHandler = {
  pattern: RegExp;
  allowMultiple?: boolean;
  iconCssClass?: string;
  actionType?: string;
  action?: (args: FileContextActionArgs) => Promise<FileContextActionResult>;
  registrationLookup?: (args: FileRegistrationLookupArgs) => Promise<FileRegistrationLookupResult>;
  handler?: (ids: string[]) => Promise<void>;
  modal?: ComponentType<FileContextDialogProps>;
};

export const FILE_HANDLERS: Record<string, FileContextHandler> = {};