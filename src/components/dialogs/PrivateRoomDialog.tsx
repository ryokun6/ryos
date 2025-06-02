import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PrivateRoomDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  roomName: string;
  onRoomNameChange: (value: string) => void;
  users: string;
  onUsersChange: (value: string) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
}

export function PrivateRoomDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  roomName,
  onRoomNameChange,
  users,
  onUsersChange,
  isLoading = false,
  errorMessage = null,
}: PrivateRoomDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-system7-window-bg border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">
            Create Private Chat
          </DialogTitle>
          <DialogDescription className="sr-only">
            Create a new private chat room
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 px-6 space-y-2">
          <div>
            <p className="text-gray-500 mb-1 text-[12px] font-geneva-12">
              Room Name
            </p>
            <Input
              value={roomName}
              onChange={(e) => onRoomNameChange(e.target.value)}
              className="shadow-none font-geneva-12 text-[12px]"
              disabled={isLoading}
            />
          </div>
          <div>
            <p className="text-gray-500 mb-1 text-[12px] font-geneva-12">
              Users (comma separated)
            </p>
            <Input
              value={users}
              onChange={(e) => onUsersChange(e.target.value)}
              className="shadow-none font-geneva-12 text-[12px]"
              disabled={isLoading}
            />
          </div>
          {errorMessage && (
            <p className="text-red-600 text-sm mt-1">{errorMessage}</p>
          )}
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button
              variant="retro"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="retro"
              onClick={onSubmit}
              disabled={isLoading}
            >
              {isLoading ? "Adding..." : "Create"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
