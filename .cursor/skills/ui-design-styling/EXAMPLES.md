# Component & Styling Examples

Practical examples for common UI patterns in ryOS.

## Buttons

### Theme-Adaptive Button

```tsx
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

function MyButton({ children, onClick }) {
  const { osTheme } = useTheme();
  
  return (
    <Button
      variant={osTheme === "macosx" ? "aqua" : "default"}
      onClick={onClick}
      className={cn(
        osTheme === "system7" && "rounded-none border-2 border-black",
        osTheme === "win98" && "rounded-none"
      )}
    >
      {children}
    </Button>
  );
}
```

### Aqua Button Group

```tsx
// For macOS Aqua dialogs
<div className="flex gap-2 justify-end">
  <button className="aqua-button secondary">Cancel</button>
  <button className="aqua-button primary">OK</button>
</div>
```

### Windows 98 3D Button

```tsx
<button className={cn(
  "px-4 py-1 bg-[#C0C0C0]",
  "border-2 border-t-white border-l-white",
  "border-b-[#808080] border-r-[#808080]",
  "active:border-t-[#808080] active:border-l-[#808080]",
  "active:border-b-white active:border-r-white",
  "font-ms-sans-serif text-sm"
)}>
  Click Me
</button>
```

## Panels & Cards

### Theme-Aware Panel

```tsx
function Panel({ children, title }) {
  const { osTheme } = useTheme();
  
  return (
    <div className={cn(
      "p-4",
      // Base styling
      "bg-os-window-bg border-os-window rounded-os",
      // Theme-specific adjustments
      osTheme === "system7" && "border-2 border-black",
      osTheme === "macosx" && "shadow-md",
      osTheme === "xp" && "border-2 border-[#0054E3]/30",
      osTheme === "win98" && [
        "border-2",
        "border-t-white border-l-white",
        "border-b-[#808080] border-r-[#808080]"
      ]
    )}>
      {title && (
        <h3 className="font-os-ui font-bold mb-2">{title}</h3>
      )}
      {children}
    </div>
  );
}
```

### Glassmorphism Card

```tsx
// Modern glass effect (works best with macOS theme)
<div className={cn(
  "p-6 rounded-xl",
  "bg-white/70 backdrop-blur-xl",
  "border border-white/20",
  "shadow-lg"
)}>
  <h2 className="text-lg font-semibold">Glass Card</h2>
  <p className="text-gray-600">Semi-transparent with blur</p>
</div>
```

### Inset Panel (Win98 style)

```tsx
<div className={cn(
  "p-3 bg-white",
  "border-2",
  "border-t-[#808080] border-l-[#808080]",
  "border-b-white border-r-white"
)}>
  {/* Sunken/inset content area */}
</div>
```

## Forms

### Theme-Aware Input

```tsx
import { Input } from "@/components/ui/input";

function ThemedInput(props) {
  const { osTheme } = useTheme();
  
  return (
    <Input
      {...props}
      className={cn(
        props.className,
        osTheme === "system7" && "rounded-none border-2 border-black",
        osTheme === "win98" && [
          "rounded-none border-2",
          "border-t-[#808080] border-l-[#808080]",
          "border-b-white border-r-white"
        ]
      )}
    />
  );
}
```

### Aqua-Style Select

```tsx
<select className={cn(
  "px-3 py-1.5 rounded-md",
  "bg-gradient-to-b from-white to-gray-100",
  "border border-gray-400",
  "shadow-sm",
  "font-lucida-grande text-sm"
)}>
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

## Lists & Tables

### Alternating Row Table

```tsx
function ThemedTable({ data }) {
  const { osTheme } = useTheme();
  
  return (
    <table className="w-full border-collapse">
      <tbody>
        {data.map((row, i) => (
          <tr
            key={i}
            className={cn(
              "border-b border-os-window-border",
              i % 2 === 0 ? "bg-white" : "bg-gray-50",
              osTheme === "macosx" && i % 2 === 1 && "bg-blue-50/30"
            )}
          >
            {/* cells */}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Icon List Item

```tsx
<div className={cn(
  "flex items-center gap-3 p-2",
  "hover:bg-os-selection-bg hover:text-os-selection-text",
  "rounded-os cursor-pointer transition-colors"
)}>
  <img src={icon} className="w-8 h-8" />
  <span className="font-os-ui">Item Name</span>
</div>
```

## Dialogs

### Alert Dialog

```tsx
function AlertDialog({ title, message, onClose }) {
  const { osTheme } = useTheme();
  
  return (
    <div className={cn(
      "w-80 p-4",
      "bg-os-window-bg border-os-window rounded-os shadow-os-window"
    )}>
      <div className="flex gap-4 mb-4">
        <span className="text-4xl">⚠️</span>
        <div>
          <h3 className="font-os-ui font-bold">{title}</h3>
          <p className="text-sm text-os-text-secondary mt-1">{message}</p>
        </div>
      </div>
      
      <div className="flex justify-end">
        {osTheme === "macosx" ? (
          <button className="aqua-button primary" onClick={onClose}>
            OK
          </button>
        ) : (
          <Button onClick={onClose}>OK</Button>
        )}
      </div>
    </div>
  );
}
```

## Custom Controls

### Using the Dial Component

```tsx
import { Dial } from "@/components/ui/dial";
import { useState } from "react";

function VolumeControl() {
  const [volume, setVolume] = useState(50);
  
  return (
    <div className="flex items-center gap-4">
      <Dial
        value={volume}
        onChange={setVolume}
        size="md"
        min={0}
        max={100}
      />
      <span className="font-os-mono text-sm">{volume}%</span>
    </div>
  );
}
```

### Audio Visualization

```tsx
import { AudioBars } from "@/components/ui/audio-bars";
import { PlaybackBars } from "@/components/ui/playback-bars";

// Recording indicator
<AudioBars isActive={isRecording} color="black" />

// Playback equalizer
<PlaybackBars isPlaying={isPlaying} barCount={5} />
```

## Menus

### Context Menu

```tsx
import { RightClickMenu } from "@/components/ui/right-click-menu";

<RightClickMenu
  items={[
    { label: "Cut", shortcut: "⌘X", action: handleCut },
    { label: "Copy", shortcut: "⌘C", action: handleCopy },
    { label: "Paste", shortcut: "⌘V", action: handlePaste },
    { type: "separator" },
    { label: "Select All", shortcut: "⌘A", action: handleSelectAll }
  ]}
>
  <div className="p-4">Right-click me</div>
</RightClickMenu>
```

## Animations

### Shake Animation (errors)

```tsx
<div className={cn(
  "transition-all",
  hasError && "animate-shake"
)}>
  {/* Content that shakes on error */}
</div>
```

### Shimmer Loading

```tsx
<div className="animate-shimmer bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]">
  {/* Loading placeholder */}
</div>
```

## Special Effects

### Pinstripe Background (macOS)

```tsx
<div
  className="h-full"
  style={{
    background: `repeating-linear-gradient(
      0deg,
      #E8E8E8,
      #E8E8E8 1px,
      #EFEFEF 1px,
      #EFEFEF 2px
    )`
  }}
>
  {/* Pinstriped content */}
</div>
```

### Brushed Metal (macOS)

```tsx
<div
  className="bg-cover"
  style={{ backgroundImage: "url(/assets/brushed-metal.jpg)" }}
>
  {/* Brushed metal toolbar */}
</div>
```

### Text Selection Styling

```tsx
// Selection follows OS theme automatically via CSS
<p className="selection:bg-os-selection-bg selection:text-os-selection-text">
  Select this text to see theme-appropriate highlighting.
</p>
```

## Complete Example: Themed Settings Panel

```tsx
function SettingsPanel() {
  const { osTheme } = useTheme();
  const [notifications, setNotifications] = useState(true);
  
  return (
    <div className={cn(
      "w-96 p-6",
      "bg-os-window-bg rounded-os border-os-window"
    )}>
      <h2 className="font-os-ui font-bold text-lg mb-4">Settings</h2>
      
      <div className="space-y-4">
        {/* Toggle setting */}
        <label className="flex items-center justify-between">
          <span className="font-os-ui">Enable notifications</span>
          <Switch
            checked={notifications}
            onCheckedChange={setNotifications}
          />
        </label>
        
        {/* Select setting */}
        <label className="block">
          <span className="font-os-ui block mb-1">Theme</span>
          <Select defaultValue="macosx">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system7">System 7</SelectItem>
              <SelectItem value="macosx">macOS Aqua</SelectItem>
              <SelectItem value="xp">Windows XP</SelectItem>
              <SelectItem value="win98">Windows 98</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      
      {/* Action buttons */}
      <div className="flex justify-end gap-2 mt-6">
        {osTheme === "macosx" ? (
          <>
            <button className="aqua-button secondary">Cancel</button>
            <button className="aqua-button primary">Save</button>
          </>
        ) : (
          <>
            <Button variant="outline">Cancel</Button>
            <Button>Save</Button>
          </>
        )}
      </div>
    </div>
  );
}
```
