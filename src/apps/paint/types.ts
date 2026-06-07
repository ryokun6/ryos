export interface Filter {
  name: string;
  apply: (canvas: HTMLCanvasElement) => void;
}
