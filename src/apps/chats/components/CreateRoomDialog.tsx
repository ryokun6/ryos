import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { type User } from "@/types/chat";

interface CreateRoomDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    name: string,
    type: "public" | "private",
    members: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  isAdmin: boolean;
  currentUsername: string | null;
}

export function CreateRoomDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  isAdmin,
  currentUsername,
}: CreateRoomDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"public" | "private">("private");

  // Fetch all users when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      // Reset form when opening
      setError(null);
      setRoomName("");
      setSelectedUsers([]);
      setSearchTerm("");
      // Reset to private tab when opening
      setActiveTab("private");
    }
  }, [isOpen, isAdmin]);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/chat-rooms?action=getUsers");
      if (response.ok) {
        const data = await response.json();
        const usersList = data.users || [];
        // Filter out current user and parse user data
        const parsedUsers = usersList
          .map((u: string | User) =>
            typeof u === "string" ? JSON.parse(u) : u
          )
          .filter((u: User) => u.username !== currentUsername?.toLowerCase());
        setUsers(parsedUsers);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  // Filter users based on search term (show suggestions after at least 1 character)
  const filteredUsers =
    searchTerm.length > 0
      ? users.filter((user) =>
          user.username.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : [];

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await onSubmit(roomName, activeTab, selectedUsers);

      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.error || "Failed to create room");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserSelection = (username: string) => {
    setSelectedUsers((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username]
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-system7-window-bg border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] max-w-[400px]"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">
            New Chat
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isAdmin
              ? "Create a public chat room or start a private conversation"
              : "Start a private conversation"}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-2 pb-6 px-6">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "public" | "private")}
          >
            {isAdmin && (
              <TabsList className="grid grid-cols-2 w-full h-fit mb-4 bg-transparent p-0.5 border border-black">
                <TabsTrigger
                  value="private"
                  className="relative font-geneva-12 text-[12px] px-4 py-1.5 rounded-none bg-white data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10 data-[state=inactive]:border-r-0"
                >
                  Private
                </TabsTrigger>
                <TabsTrigger
                  value="public"
                  className="relative font-geneva-12 text-[12px] px-4 py-1.5 rounded-none bg-white data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10"
                >
                  Public
                </TabsTrigger>
              </TabsList>
            )}

            {isAdmin && (
              <TabsContent value="public" className="mt-0">
                <div className="space-y-2">
                  <Label
                    htmlFor="room-name"
                    className="text-gray-700 text-[12px] font-geneva-12"
                  >
                    Room Name
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-geneva-12 text-[12px] pointer-events-none">
                      #
                    </span>
                    <Input
                      id="room-name"
                      value={roomName}
                      onChange={(e) => {
                        // Remove # if user types it
                        const value = e.target.value.replace(/^#/, "");
                        setRoomName(value);
                      }}
                      placeholder="general"
                      className="shadow-none font-geneva-12 text-[12px] h-8 pl-6"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </TabsContent>
            )}

            <TabsContent value="private" className="mt-0">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="search-users"
                    className="text-gray-700 text-[12px] font-geneva-12"
                  >
                    Add to Private Chat
                  </Label>
                  <Input
                    id="search-users"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="shadow-none font-geneva-12 text-[12px] h-8"
                    disabled={isLoading}
                  />

                  {/* Selected users tokens */}
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedUsers.map((username) => (
                        <Badge
                          key={username}
                          variant="secondary"
                          className="font-geneva-12 text-[11px] py-0.5 pl-2 pr-1 bg-gray-100 hover:bg-gray-200 border-gray-300"
                        >
                          @{username}
                          <button
                            type="button"
                            onClick={() => toggleUserSelection(username)}
                            className="ml-1 hover:bg-gray-300 rounded-sm p-0.5"
                            disabled={isLoading}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {searchTerm.length > 0 && filteredUsers.length > 0 && (
                  <div className="border border-gray-300 rounded max-h-[180px] overflow-y-auto bg-white">
                    <div className="p-1">
                      {filteredUsers.map((user) => (
                        <label
                          key={user.username}
                          className="flex items-center p-2 hover:bg-gray-100 cursor-pointer rounded font-geneva-12 text-[12px]"
                        >
                          <Checkbox
                            checked={selectedUsers.includes(user.username)}
                            onCheckedChange={() =>
                              toggleUserSelection(user.username)
                            }
                            className="h-4 w-4"
                            disabled={isLoading}
                          />
                          <span className="ml-2">@{user.username}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <p className="text-red-600 text-[12px] font-geneva-12 mt-3">
              {error}
            </p>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="retro"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="font-geneva-12 text-[12px]"
            >
              Cancel
            </Button>
            <Button
              variant="retro"
              onClick={handleSubmit}
              disabled={
                isLoading ||
                (activeTab === "public" && !roomName.trim()) ||
                (activeTab === "private" && selectedUsers.length === 0)
              }
              className="font-geneva-12 text-[12px]"
            >
              {isLoading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
