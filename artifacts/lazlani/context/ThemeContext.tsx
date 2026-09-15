import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, ThemeName, ThemePalette } from '@/constants/colors';

const STORAGE_KEY = 'lazlani_theme';
const DEFAULT_THEME: ThemeName = 'lazlani';

interface ThemeContextValue {
  themeName: ThemeName;
  colors: ThemePalette;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeName: DEFAULT_THEME,
  colors: THEMES[DEFAULT_THEME],
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v && v in THEMES) setThemeName(v as ThemeName);
    });
  }, []);

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    AsyncStorage.setItem(STORAGE_KEY, name);
  };

  return (
    <ThemeContext.Provider value={{ themeName, colors: THEMES[themeName], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
