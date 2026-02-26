export interface CoreResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}
