export function isYouTubeUrl(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.includes("youtube.com/watch") ||
    trimmed.includes("youtu.be/") ||
    trimmed.includes("youtube.com/shorts/") ||
    trimmed.includes("music.youtube.com/watch")
  );
}
