// Design System App for ryOS
// Demonstrates the improved design system with all features and components

import React from "react";
import { ComponentShowcase } from "@/components/docs/ComponentShowcase";
import { ThemeProvider, ThemeSwitcher } from "@/components/providers/ThemeProvider";
import { EnhancedButton, ButtonGroup } from "@/components/ui/enhanced-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { designSystem } from "@/lib/design-system";

interface AppProps {
  // Common app props interface
}

const DesignSystemApp: React.FC<AppProps> = () => {
  return (
    <ThemeProvider defaultTheme="system7">
      <div className="min-h-screen bg-background text-foreground">
        {/* Header */}
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-chicago">ryOS Design System</h1>
              <p className="text-sm text-muted-foreground">Comprehensive design system showcase</p>
            </div>
            <ThemeSwitcher />
          </div>
        </header>

        {/* Quick Demo Section */}
        <section className="container mx-auto px-4 py-8">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Quick Demo</CardTitle>
              <CardDescription>
                Try out the enhanced design system features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enhanced Button Examples */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Enhanced Buttons</h3>
                <div className="flex flex-wrap gap-4">
                  <EnhancedButton variant="default">Default</EnhancedButton>
                  <EnhancedButton variant="retro">Retro</EnhancedButton>
                  <EnhancedButton variant="neon" animation="pulse">Neon</EnhancedButton>
                  <EnhancedButton variant="gradient">Gradient</EnhancedButton>
                  <EnhancedButton variant="glass">Glass</EnhancedButton>
                  <EnhancedButton variant="pixel">Pixel</EnhancedButton>
                  <EnhancedButton variant="crt">CRT</EnhancedButton>
                </div>
              </div>

              {/* Button Groups */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Button Groups</h3>
                <ButtonGroup variant="outline" size="sm">
                  <EnhancedButton>Left</EnhancedButton>
                  <EnhancedButton>Center</EnhancedButton>
                  <EnhancedButton>Right</EnhancedButton>
                </ButtonGroup>
              </div>

              {/* Loading States */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Loading States</h3>
                <div className="flex flex-wrap gap-4">
                  <EnhancedButton loading>Loading...</EnhancedButton>
                  <EnhancedButton variant="retro" loading>Retro Loading</EnhancedButton>
                  <EnhancedButton variant="neon" loading>Neon Loading</EnhancedButton>
                </div>
              </div>

              {/* Icons */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">With Icons</h3>
                <div className="flex flex-wrap gap-4">
                  <EnhancedButton icon="🎵" iconPosition="left">
                    Play Music
                  </EnhancedButton>
                  <EnhancedButton icon="⚙️" iconPosition="right">
                    Settings
                  </EnhancedButton>
                  <EnhancedButton icon="🎮" size="icon" />
                </div>
              </div>

              {/* Animations */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Animations</h3>
                <div className="flex flex-wrap gap-4">
                  <EnhancedButton animation="pulse">Pulse</EnhancedButton>
                  <EnhancedButton animation="bounce">Bounce</EnhancedButton>
                  <EnhancedButton animation="shake">Shake</EnhancedButton>
                  <EnhancedButton animation="shimmer">Shimmer</EnhancedButton>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Full Component Showcase */}
        <section className="container mx-auto px-4 py-8">
          <ComponentShowcase />
        </section>

        {/* Footer */}
        <footer className="border-t border-border bg-card mt-16">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  ryOS Design System v2.0
                </p>
                <p className="text-xs text-muted-foreground">
                  Built with React, TypeScript, and Tailwind CSS
                </p>
              </div>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span>Theme: System 7</span>
                <span>•</span>
                <span>Retro-inspired UI</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ThemeProvider>
  );
};

export default DesignSystemApp;