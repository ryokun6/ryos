import { memo } from "react";
import { ChatInputView } from "./ChatInputView";
import type { ChatInputProps } from "./types";
import { useChatInput } from "./useChatInput";

export type { ChatInputProps } from "./types";

export const ChatInput = memo(function ChatInput(props: ChatInputProps) {
  const viewModel = useChatInput(props);
  return <ChatInputView {...viewModel} />;
});
