export const helpItems = [
  {
    icon: "👑",
    title: "Admin Only",
    description: "Locked down to the admin user (ryo) — auth-gated on every action",
  },
  {
    icon: "👥",
    title: "User Management",
    description: "Page through registered users, view profiles, and revoke or rename accounts",
  },
  {
    icon: "💬",
    title: "Room Moderation",
    description: "Inspect chat rooms with IRC metadata; delete inappropriate content fast",
  },
  {
    icon: "🎵",
    title: "Song Library",
    description: "Bulk import, export, and clean the cached YouTube + lyrics song library",
  },
  {
    icon: "🔍",
    title: "Search & Filter",
    description: "Quickly search users or songs by name across paginated grids",
  },
  {
    icon: "📊",
    title: "System Stats",
    description: "Live usage metrics including a Cursor agent runs telemetry card",
  },
];

export const appMetadata = {
  name: "Admin",
  version: "1.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/admin.png",
};
