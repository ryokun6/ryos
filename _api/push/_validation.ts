export interface ValidationResultSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationResultError {
  ok: false;
  error: string;
}

export type ValidationResult<T> = ValidationResultSuccess<T> | ValidationResultError;
