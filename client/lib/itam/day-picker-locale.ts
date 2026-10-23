import {
  de,
  enUS,
  es,
  fr,
  id,
  ja,
  ptBR,
  vi,
  zhCN,
  zhTW,
} from 'react-day-picker/locale';

type DayPickerLocale = typeof enUS;

/**
 * The calendar's language for each language the application offers
 * (`client/locales/index.ts`, 2026-10-23): month and weekday names and the
 * first day of the week. A language with no entry reads in English.
 */
const DAY_PICKER_LOCALES: Readonly<Record<string, DayPickerLocale>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'ja-JP': ja,
  'es-ES': es,
  'pt-BR': ptBR,
  'fr-FR': fr,
  'de-DE': de,
  'vi-VN': vi,
  'id-ID': id,
};

export function dayPickerLocale(language: string): DayPickerLocale {
  return DAY_PICKER_LOCALES[language] ?? enUS;
}
