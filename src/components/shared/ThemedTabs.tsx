import React from "react";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useThemeStore } from "@/stores/useThemeStore";
import { getTabStyles } from "@/utils/tabStyles";
import { cn } from "@/lib/utils";

/**
 * Theme-aware TabsList that renders as a native <menu> for Windows XP/98
 * themes and uses getTabStyles() classes for macOS Aqua / System 7.
 */
interface ThemedTabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function ThemedTabsList({ children, className }: ThemedTabsListProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  const tabStyles = getTabStyles(currentTheme);

  if (isXpTheme) {
    return (
      <TabsList asChild>
        <menu
          role="tablist"
          className={cn(
            "h-7! flex justify-start! p-0 -mt-1 -mb-[2px] bg-transparent shadow-none",
            className
          )}
        >
          {children}
        </menu>
      </TabsList>
    );
  }

  return (
    <TabsList className={cn(tabStyles.tabListClasses, className)}>
      {children}
    </TabsList>
  );
}

/**
 * Theme-aware TabsTrigger with proper font and styling per OS theme.
 * Renders with Pixelated MS Sans Serif on XP/98 and Geneva on macOS/System 7.
 */
interface ThemedTabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function ThemedTabsTrigger({
  value,
  children,
  className,
}: ThemedTabsTriggerProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  const tabStyles = getTabStyles(currentTheme);

  if (isXpTheme) {
    return (
      <TabsTrigger
        value={value}
        className={cn(
          "relative px-4 py-1.5 rounded-none bg-white",
          "data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10",
          "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]",
          className
        )}
        style={{
          fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
          fontSize: "11px",
        }}
      >
        {children}
      </TabsTrigger>
    );
  }

  return (
    <TabsTrigger
      value={value}
      className={cn(
        tabStyles.tabTriggerClasses,
        "px-4 py-1.5",
        "font-geneva-12 text-[12px]",
        className
      )}
    >
      {children}
    </TabsTrigger>
  );
}

/**
 * Theme-aware TabsContent with proper border and background per OS theme.
 */
interface ThemedTabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function ThemedTabsContent({
  value,
  children,
  className,
}: ThemedTabsContentProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const tabStyles = getTabStyles(currentTheme);

  return (
    <TabsContent value={value} className={cn(tabStyles.tabContentClasses, className)}>
      {children}
    </TabsContent>
  );
}
