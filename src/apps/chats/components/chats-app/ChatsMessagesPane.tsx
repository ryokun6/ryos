import { memo } from "react";
import { ChatMessages } from "../ChatMessages";
import type { ChatMessagesProps } from "../chat-messages/types";

/**
 * Isolates the message list so sidebar/input chrome can skip commits when
 * only streaming message props change (and vice versa when only chrome
 * props change).
 */
export const ChatsMessagesPane = memo(function ChatsMessagesPane(
  props: ChatMessagesProps & { roomKey: string }
) {
  const { roomKey, ...chatMessagesProps } = props;
  return (
    <ChatMessages key={roomKey} {...chatMessagesProps} />
  );
});
