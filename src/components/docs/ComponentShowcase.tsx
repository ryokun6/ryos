// Component Showcase for ryOS Design System
// This component demonstrates all design system components with their variants

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { designSystem } from "@/lib/design-system";

interface ComponentSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

const ComponentSection: React.FC<ComponentSectionProps> = ({ title, description, children }) => (
  <Card className="mb-8">
    <CardHeader>
      <CardTitle className="text-2xl font-bold">{title}</CardTitle>
      {description && <CardDescription className="text-base">{description}</CardDescription>}
    </CardHeader>
    <CardContent className="space-y-6">
      {children}
    </CardContent>
  </Card>
);

interface VariantGroupProps {
  title: string;
  children: React.ReactNode;
}

const VariantGroup: React.FC<VariantGroupProps> = ({ title, children }) => (
  <div className="space-y-4">
    <h3 className="text-lg font-semibold text-muted-foreground">{title}</h3>
    <div className="flex flex-wrap gap-4">
      {children}
    </div>
  </div>
);

export const ComponentShowcase: React.FC = () => {
  return (
    <div className="container mx-auto p-8 space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">ryOS Design System</h1>
        <p className="text-xl text-muted-foreground">
          A comprehensive design system for retro-inspired user interfaces
        </p>
      </div>

      <Tabs defaultValue="components" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="typography">Typography</TabsTrigger>
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="utilities">Utilities</TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="space-y-8">
          {/* Buttons */}
          <ComponentSection
            title="Buttons"
            description="Interactive elements for user actions with multiple variants and sizes"
          >
            <VariantGroup title="Variants">
              <Button variant="default">Default</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="retro">Retro</Button>
              <Button variant="player">Player</Button>
            </VariantGroup>

            <VariantGroup title="Sizes">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon">🎵</Button>
            </VariantGroup>

            <VariantGroup title="States">
              <Button disabled>Disabled</Button>
              <Button className="animate-pulse">Loading</Button>
            </VariantGroup>
          </ComponentSection>

          {/* Cards */}
          <ComponentSection
            title="Cards"
            description="Containers for organizing content and information"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Card</CardTitle>
                  <CardDescription>A simple card with header and content</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>This is the card content area where you can put any content.</p>
                </CardContent>
              </Card>

              <Card className="border-2 border-black shadow-retro">
                <CardHeader>
                  <CardTitle className="font-mondwest">Retro Card</CardTitle>
                  <CardDescription>Styled with retro aesthetics</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-mondwest">Retro-styled content with pixel fonts.</p>
                </CardContent>
              </Card>

              <Card className="bg-green-900 text-green-100 border-green-700">
                <CardHeader>
                  <CardTitle className="font-mondwest">CRT Card</CardTitle>
                  <CardDescription>Green terminal aesthetic</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-mondwest">Terminal-style content with green text.</p>
                </CardContent>
              </Card>
            </div>
          </ComponentSection>

          {/* Form Elements */}
          <ComponentSection
            title="Form Elements"
            description="Input controls and form components"
          >
            <VariantGroup title="Inputs">
              <div className="space-y-2">
                <Label htmlFor="default-input">Default Input</Label>
                <Input id="default-input" placeholder="Enter text..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="retro-input">Retro Input</Label>
                <Input 
                  id="retro-input" 
                  placeholder="Retro style..." 
                  className="border-2 border-black font-mondwest"
                />
              </div>
            </VariantGroup>

            <VariantGroup title="Controls">
              <div className="flex items-center space-x-2">
                <Switch id="airplane-mode" />
                <Label htmlFor="airplane-mode">Airplane Mode</Label>
              </div>
              <div className="w-64">
                <Label>Volume</Label>
                <Slider defaultValue={[50]} max={100} step={1} />
              </div>
            </VariantGroup>

            <VariantGroup title="Select">
              <Select>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system7">System 7</SelectItem>
                  <SelectItem value="retro">Retro</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </VariantGroup>
          </ComponentSection>

          {/* Feedback Elements */}
          <ComponentSection
            title="Feedback Elements"
            description="Components for user feedback and status"
          >
            <VariantGroup title="Badges">
              <Badge variant="default">Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </VariantGroup>

            <VariantGroup title="Dialog">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Design System Dialog</DialogTitle>
                    <DialogDescription>
                      This is an example dialog showing the design system in action.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p>Dialog content goes here...</p>
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline">Cancel</Button>
                      <Button>Confirm</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </VariantGroup>
          </ComponentSection>
        </TabsContent>

        <TabsContent value="typography" className="space-y-8">
          <ComponentSection
            title="Typography System"
            description="Font families, sizes, and text utilities"
          >
            <VariantGroup title="Font Families">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Chicago (Default)</h3>
                  <p className="font-chicago text-lg">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Geneva 12</h3>
                  <p className="font-geneva-12 text-lg">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Apple Garamond</h3>
                  <p className="font-apple-garamond text-lg">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Mondwest</h3>
                  <p className="font-mondwest text-lg">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">NeueBit</h3>
                  <p className="font-neuebit text-lg">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Monaco</h3>
                  <p className="font-monaco text-lg">The quick brown fox jumps over the lazy dog</p>
                </div>
              </div>
            </VariantGroup>

            <VariantGroup title="Font Sizes">
              <div className="space-y-2">
                <p className="text-xs">Extra Small (xs) - 12px</p>
                <p className="text-sm">Small (sm) - 14px</p>
                <p className="text-base">Base (base) - 16px</p>
                <p className="text-lg">Large (lg) - 18px</p>
                <p className="text-xl">Extra Large (xl) - 20px</p>
                <p className="text-2xl">2XL - 24px</p>
                <p className="text-3xl">3XL - 30px</p>
                <p className="text-4xl">4XL - 36px</p>
                <p className="text-5xl">5XL - 48px</p>
                <p className="text-6xl">6XL - 60px</p>
              </div>
            </VariantGroup>

            <VariantGroup title="Font Weights">
              <div className="space-y-2">
                <p className="font-normal">Normal (400)</p>
                <p className="font-medium">Medium (500)</p>
                <p className="font-semibold">Semibold (600)</p>
                <p className="font-bold">Bold (700)</p>
              </div>
            </VariantGroup>
          </ComponentSection>
        </TabsContent>

        <TabsContent value="colors" className="space-y-8">
          <ComponentSection
            title="Color System"
            description="Semantic colors and theme variations"
          >
            <VariantGroup title="Semantic Colors">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-primary rounded border"></div>
                  <p className="text-sm font-medium">Primary</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-secondary rounded border"></div>
                  <p className="text-sm font-medium">Secondary</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-accent rounded border"></div>
                  <p className="text-sm font-medium">Accent</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-destructive rounded border"></div>
                  <p className="text-sm font-medium">Destructive</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-muted rounded border"></div>
                  <p className="text-sm font-medium">Muted</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-card rounded border"></div>
                  <p className="text-sm font-medium">Card</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-popover rounded border"></div>
                  <p className="text-sm font-medium">Popover</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-border rounded border"></div>
                  <p className="text-sm font-medium">Border</p>
                </div>
              </div>
            </VariantGroup>

            <VariantGroup title="System 7 Colors">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-white border-2 border-black rounded"></div>
                  <p className="text-sm font-medium">Window BG</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-black rounded"></div>
                  <p className="text-sm font-medium text-white">Title Bar</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-gray-500 rounded"></div>
                  <p className="text-sm font-medium">Button Shadow</p>
                </div>
                <div className="space-y-2">
                  <div className="w-16 h-16 bg-white border-2 border-black rounded"></div>
                  <p className="text-sm font-medium">Button Highlight</p>
                </div>
              </div>
            </VariantGroup>
          </ComponentSection>
        </TabsContent>

        <TabsContent value="utilities" className="space-y-8">
          <ComponentSection
            title="Design System Utilities"
            description="Helper functions and utility classes"
          >
            <VariantGroup title="Spacing Utilities">
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className="w-4 h-4 bg-primary"></div>
                  <span className="text-sm">4px (spacing-1)</span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 bg-primary"></div>
                  <span className="text-sm">8px (spacing-2)</span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-primary"></div>
                  <span className="text-sm">16px (spacing-4)</span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-24 h-24 bg-primary"></div>
                  <span className="text-sm">24px (spacing-6)</span>
                </div>
              </div>
            </VariantGroup>

            <VariantGroup title="Border Radius">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-primary rounded-none"></div>
                <span className="text-sm">None</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-primary rounded-sm"></div>
                <span className="text-sm">Small</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-primary rounded-md"></div>
                <span className="text-sm">Medium</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-primary rounded-lg"></div>
                <span className="text-sm">Large</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-primary rounded-full"></div>
                <span className="text-sm">Full</span>
              </div>
            </VariantGroup>

            <VariantGroup title="Shadows">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="w-24 h-24 bg-card shadow-none border rounded"></div>
                <div className="w-24 h-24 bg-card shadow-sm border rounded"></div>
                <div className="w-24 h-24 bg-card shadow-md border rounded"></div>
                <div className="w-24 h-24 bg-card shadow-lg border rounded"></div>
                <div className="w-24 h-24 bg-card shadow-xl border rounded"></div>
                <div className="w-24 h-24 bg-card shadow-retro border rounded"></div>
                <div className="w-24 h-24 bg-card shadow-system7 border rounded"></div>
              </div>
            </VariantGroup>
          </ComponentSection>
        </TabsContent>
      </Tabs>
    </div>
  );
};