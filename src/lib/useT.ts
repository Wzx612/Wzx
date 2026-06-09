import { useCallback } from 'react';
import { useUiStore } from '@/store/uiStore';
import { tk, tb, type DictKey } from '@/i18n/dict';
import type { Bi, Lang } from '@/types';

/** Returns the active language plus translation helpers. */
export function useT(): {
  lang: Lang;
  t: (key: DictKey) => string;
  b: (pair: Bi) => string;
} {
  const lang = useUiStore((s) => s.lang);
  const t = useCallback((key: DictKey) => tk(key, lang), [lang]);
  const b = useCallback((pair: Bi) => tb(pair, lang), [lang]);
  return { lang, t, b };
}
