export interface TestPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface TestPaneOverrides<TInput extends object> {
  inputtedData?: Partial<TInput>;
  settings?: Partial<TestPaneSettings>;
}

/** Builds the common pane-controller inputs used by plugin view tests. */
export function createTestPaneParams<TInput extends object>(
  factory: { inputtedData: TInput },
  overrides: TestPaneOverrides<TInput> = {},
) {
  return {
    inputtedData: {
      ...factory.inputtedData,
      ...overrides.inputtedData,
    },
    computedData: {},
    settings: {
      disabled: false,
      hidden: false,
      ...overrides.settings,
    },
  };
}
