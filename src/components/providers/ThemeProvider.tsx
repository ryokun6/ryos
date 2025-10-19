// Theme Provider for ryOS Design System
// Manages theme state and provides theme switching functionality

import React, { createContext, useContext, useEffect, useState } from "react";
import { ThemeMode, loadThemePreference, saveThemePreference, applyTheme } from "@/config/theme";

interface ThemeContextType {
  theme: ThemeMode;
  switchTheme: (mode: ThemeMode) => void;
  availableThemes: ThemeMode[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultTheme = "system7" 
}) => {
  const [theme, setTheme] = useState<ThemeMode>(defaultTheme);
  const [isInitialized, setIsInitialized] = useState(false);

  const availableThemes: ThemeMode[] = ["light", "dark", "retro", "system7"];

  const switchTheme = (mode: ThemeMode) => {
    setTheme(mode);
    applyTheme(mode);
    saveThemePreference(mode);
  };

  useEffect(() => {
    if (!isInitialized) {
      const initialTheme = loadThemePreference();
      setTheme(initialTheme);
      applyTheme(initialTheme);
      setIsInitialized(true);
    }
  }, [isInitialized]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const handleChange = () => {
      // Only auto-switch if user hasn't set a preference
      const savedTheme = localStorage.getItem("ryos-theme") as ThemeMode;
      if (!savedTheme) {
        const newTheme = mediaQuery.matches ? "dark" : "light";
        switchTheme(newTheme);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const value: ThemeContextType = {
    theme,
    switchTheme,
    availableThemes,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook to use theme context
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

// Theme switcher component
export const ThemeSwitcher: React.FC = () => {
  const { theme, switchTheme, availableThemes } = useTheme();

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm font-medium">Theme:</span>
      <select
        value={theme}
        onChange={(e) => switchTheme(e.target.value as ThemeMode)}
        className="px-2 py-1 text-sm border rounded bg-background text-foreground"
      >
        {availableThemes.map((themeOption) => (
          <option key={themeOption} value={themeOption}>
            {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
};

// Theme-aware component wrapper
export const withTheme = <P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> => {
  const ThemedComponent: React.FC<P> = (props) => {
    const { theme } = useTheme();
    
    return (
      <div className={`theme-${theme}`}>
        <Component {...props} />
      </div>
    );
  };

  ThemedComponent.displayName = `withTheme(${Component.displayName || Component.name})`;
  
  return ThemedComponent;
};