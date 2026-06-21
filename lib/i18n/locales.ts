export type LocaleEntry = {
  code: string;
  /** Native name shown in dropdown, e.g. '简体中文' */
  label: string;
  /** Short label shown on the toggle button, e.g. 'CN' */
  shortLabel: string;
};

export const supportedLocales = [
  { code: 'zh-CN', label: '简体中文', shortLabel: 'CN' },
] as const satisfies readonly LocaleEntry[];
