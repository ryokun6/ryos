type LyricOffsetPublisher = (trackId: string, offsetMs: number) => void;

let publisher: LyricOffsetPublisher | null = null;

export function setLyricOffsetPublisher(next: LyricOffsetPublisher | null): void {
  publisher = next;
}

export function publishLyricOffset(trackId: string, offsetMs: number): void {
  publisher?.(trackId, offsetMs);
}
