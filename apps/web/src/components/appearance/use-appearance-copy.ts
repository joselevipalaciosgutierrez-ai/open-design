import { useI18n } from '../../i18n';
import { getAppearanceCopy, type AppearanceCopy } from './appearance-copy';

/** The Appearance copy in the app's own language, not the document's `lang`. */
export function useAppearanceCopy(): AppearanceCopy {
  return getAppearanceCopy(useI18n().locale);
}
