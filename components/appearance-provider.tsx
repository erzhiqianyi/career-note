'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type Appearance = {
  theme: 'blue' | 'forest' | 'paper';
  fontSize: 100 | 112.5 | 125 | 137.5;
  showJapaneseReadings: boolean;
};
const defaults: Appearance = { theme: 'blue', fontSize: 112.5, showJapaneseReadings: true };
const storageKey = 'career-note.appearance';
function parseAppearance(raw: string | null): Appearance {
  try {
    const value = JSON.parse(raw || '{}');
    return {
      showJapaneseReadings: typeof value?.showJapaneseReadings === 'boolean'
        ? value.showJapaneseReadings
        : defaults.showJapaneseReadings,
      theme: ['blue', 'forest', 'paper'].includes(value?.theme)
        ? value.theme
        : defaults.theme,
      fontSize: [100, 112.5, 125, 137.5].includes(value?.fontSize)
        ? value.fontSize
        : defaults.fontSize,
    };
  } catch {
    return defaults;
  }
}
const Context = createContext({
  appearance: defaults,
  update: (_patch: Partial<Appearance>) => {},
  reset: () => {},
  saved: true,
});
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(defaults);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    try {
      setAppearance(parseAppearance(localStorage.getItem(storageKey)));
    } catch {
      setSaved(false);
    }
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null)
        setAppearance(parseAppearance(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = appearance.theme;
    document.documentElement.style.fontSize = `${appearance.fontSize}%`;
  }, [appearance]);
  function apply(next: Appearance) {
    setAppearance(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }
  return (
    <Context.Provider
      value={{
        appearance,
        saved,
        update: (patch) => apply({ ...appearance, ...patch }),
        reset: () => apply(defaults),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAppearance = () => useContext(Context);
