export const appMetadata = {
  name: "Contacts",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/contacts.png",
};

export const helpItems = [
  {
    icon: "👤",
    title: "Browse Contacts",
    description: "Use the left sidebar to search and switch between saved contacts",
  },
  {
    icon: "➕",
    title: "Create Contacts",
    description: "Choose File > New Contact to add names, phone numbers, email, and notes",
  },
  {
    icon: "📇",
    title: "Edit Details",
    description: "Update contact details in the inspector and changes save automatically",
  },
  {
    icon: "📥",
    title: "Import vCards",
    description: "Import .vcf files from the File menu to bring contacts into ryOS",
  },
  {
    icon: "🤖",
    title: "Use with Ryo",
    description: "Ryo can list, create, update, and search synced contacts in chat and Telegram",
  },
  {
    icon: "☁️",
    title: "Cloud Sync",
    description: "Enable Contacts sync in Control Panels to keep the address book in Redis",
  },
];
