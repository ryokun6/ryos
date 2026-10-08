import type {
  FitnessExercise,
  FoodAnalyzeRequest,
  FoodAnalyzeResponse,
} from "@/shared/fitness";
import { normalizeExerciseRecord } from "@/shared/fitness";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

export class FitnessApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "FitnessApiError";
  }
}

async function readError(response: Response): Promise<FitnessApiError> {
  let message = `HTTP ${response.status}`;
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data?.error === "string") message = data.error;
  } catch {
    // Non-JSON error body; keep the status message.
  }
  return new FitnessApiError(message, response.status);
}

export async function analyzeFood(
  request: FoodAnalyzeRequest,
  signal?: AbortSignal
): Promise<FoodAnalyzeResponse> {
  const response = await abortableFetch(getApiUrl("/api/fitness/food-analyze"), {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    timeout: 60000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 200 },
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as FoodAnalyzeResponse;
}

const detailCache = new Map<string, FitnessExercise>();

export async function loadExerciseDetail(
  id: string,
  signal?: AbortSignal
): Promise<FitnessExercise> {
  const cached = detailCache.get(id);
  if (cached) return cached;
  const response = await abortableFetch(
    getApiUrl(`/api/fitness/exercises?id=${encodeURIComponent(id)}`),
    { method: "GET", signal, timeout: 20000, throwOnHttpError: false }
  );
  if (!response.ok) throw await readError(response);
  const data = (await response.json()) as { exercise?: unknown };
  const exercise = normalizeExerciseRecord(data.exercise);
  if (!exercise) throw new FitnessApiError("invalid_exercise", 502);
  detailCache.set(id, exercise);
  return exercise;
}
