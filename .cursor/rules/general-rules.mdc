---
description: 
globs: 
alwaysApply: true
---
# ryOS General Rules

## Environment
- Project: `react`
- Framework: `tailwindcss`, `shadcn`, `vite`
- Package Manager: `bun`
- Development Server: Run with `vercel dev` (or `bun run dev:vercel`)

## General folder structure
- `_api/`: API endpoints (Vercel Edge functions, uses `_api` prefix to avoid vite-plugin-vercel conflicts)
- `public/`: Static assets
  - `assets/`: Videos, sounds, and other media
  - `fonts/`: Font files
  - `icons/`: UI icons organized by category
  - `patterns/`: Pattern files
  - `wallpapers/`: Wallpaper images (photos and tiles)
- `src/`: Source code
  - `apps/`: Individual application modules
    - Each app has its own directory with components, hooks, and utilities
  - `components/`: Shared React components
    - `dialogs/`: Dialog components
    - `layout/`: Layout components
    - `shared/`: Shared components across applications
    - `ui/`: UI components (shadcn components)
  - `config/`: Configuration files
  - `contexts/`: React context providers
  - `hooks/`: Custom React hooks
  - `lib/`: Libraries and utilities
    - `shaders/`: WebGL shader files
  - `stores/`: State management
  - `styles/`: CSS and styling utilities
  - `themes/`: Theme definitions
  - `types/`: TypeScript type definitions
  - `utils/`: Utility functions

### App Structure
- App components follow the naming convention `[AppName]AppComponent.tsx`
- Apps are organized in `src/apps/[app-name]/` directories
- Each app folder typically contains:
  - `components/`: App-specific components
  - `hooks/`: Custom hooks specific to the app
  - `utils/`: Utility functions for the app
  - `commands/`: CLI commands (for Terminal app)
  - `extensions/`: Extensions/plugins (for TextEdit app)
  - `types/`: App-specific type definitions
- The main app component is exported from `src/apps/[app-name]/index.tsx`
- App components receive common props via the `AppProps` interface
- Window appearance is handled via the shared `WindowFrame` component
- Each app defines its own app-specific menu bar component

### State Management
- Apps use a combination of local state (React hooks) and global state (stores)
- Stores are defined in `src/stores/` with a naming pattern of `use[Store]Store`
- Stores are implemented using a state management library (Zustand)

### Component Organization
- Shared UI components from `@/components/ui/` follow shadcn patterns
- Dialog components from `@/components/dialogs/` handle common dialog patterns
- Custom hooks from `@/hooks/` provide reusable functionality
- Apps leverage shared components but define app-specific UI in their own components folder
```regex
import.*from.*@/components/ui/(alert|button|card|dialog|dropdown-menu|input|label|menubar|scroll-area|select|slider|switch|table|tabs|tooltip)
```
⚠️ Run: `bunx --bun shadcn@latest add $1`

### Custom Components
These are custom implementations (not shadcn):
- `audio-input-button`
- `audio-bars`
- `volume-bar`
- `playback-bars`
- `dial`
- `right-click-menu`
- `SwipeInstructions`
