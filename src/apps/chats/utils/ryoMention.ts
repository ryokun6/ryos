export function parseRyoMention(
  input: string,
  nudgeText: string
): { isMention: boolean; messageContent: string } {
  if (input.startsWith("@ryo ")) {
    return { isMention: true, messageContent: input.substring(4).trim() };
  }

  if (input === "@ryo") {
    return { isMention: true, messageContent: nudgeText };
  }

  return { isMention: false, messageContent: "" };
}
