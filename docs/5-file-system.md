# File System

Browser-based hierarchical file system.

## Two-Layer Architecture

- **Metadata Layer** (Zustand + localStorage): paths, names, types, UUIDs
- **Content Layer** (IndexedDB): actual file content indexed by UUID

```mermaid
graph TB
    subgraph Application["Application Layer"]
        App[React Components]
        Store[useFileSystemStore]
    end
    
    subgraph Metadata["Metadata Layer"]
        Zustand[(Zustand State)]
        LocalStorage[(localStorage)]
    end
    
    subgraph Content["Content Layer"]
        IDB[(IndexedDB)]
    end
    
    App --> Store
    Store --> Zustand
    Zustand <--> LocalStorage
    Store -->|"UUID lookup"| IDB
    
    Zustand -->|"paths, names, types"| Store
    IDB -->|"file content"| Store
```

## Directory Structure

| Path | Type | Description |
|------|------|-------------|
| `/` | Root | Root directory |
| `/Applications` | Virtual | Apps from registry |
| `/Documents` | Physical | User documents |
| `/Images` | Physical | User images |
| `/Music` | Virtual | iPod library |
| `/Videos` | Virtual | Video library |
| `/Sites` | Virtual | IE favorites |
| `/Applets` | Physical | HTML applets |
| `/Trash` | Special | Deleted items |
| `/Desktop` | Physical | Shortcuts |

```mermaid
graph TD
    Root["/"] --> Apps["/Applications<br/>Virtual"]
    Root --> Docs["/Documents<br/>Physical"]
    Root --> Imgs["/Images<br/>Physical"]
    Root --> Music["/Music<br/>Virtual"]
    Root --> Videos["/Videos<br/>Virtual"]
    Root --> Sites["/Sites<br/>Virtual"]
    Root --> Applets["/Applets<br/>Physical"]
    Root --> Trash["/Trash<br/>Special"]
    Root --> Desktop["/Desktop<br/>Physical"]
    
    Apps -.->|"from registry"| AppReg[(App Registry)]
    Music -.->|"from store"| iPod[(iPod Library)]
    Videos -.->|"from store"| VidLib[(Video Library)]
    
    Docs -->|"stored in"| IDB[(IndexedDB)]
    Imgs -->|"stored in"| IDB
    Applets -->|"stored in"| IDB
    Desktop -->|"stored in"| IDB
```

## File Metadata

```typescript
interface FileSystemItem {
  path: string;        // Unique identifier
  name: string;
  isDirectory: boolean;
  type?: string;       // markdown, text, png, etc.
  uuid?: string;       // Content storage key
  size?: number;
  createdAt?: number;
  modifiedAt?: number;
  status: "active" | "trashed";
  aliasTarget?: string;  // For shortcuts
}
```
