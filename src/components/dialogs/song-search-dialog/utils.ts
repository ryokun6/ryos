import { isYouTubeUrl as isAllowedYouTubeUrl } from "@/utils/youtubeUrl";

export function isYouTubeUrl(input: string): boolean {
  return isAllowedYouTubeUrl(input.trim());
}
