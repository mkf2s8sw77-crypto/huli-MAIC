const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * 首页与课堂外壳中的设置类入口默认前端隐藏。
 * 如需在某个环境重新展示，可显式设置 NEXT_PUBLIC_HIDE_SETTINGS_UI=false。
 */
export const HIDE_SETTINGS_UI = TRUE_VALUES.has(
  (process.env.NEXT_PUBLIC_HIDE_SETTINGS_UI ?? 'true').trim().toLowerCase(),
);
