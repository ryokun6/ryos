import { apiHandler } from "../_utils/api-handler.js";
import {
  FREE_EXERCISE_DB_COMMIT,
  FREE_EXERCISE_DB_LICENSE,
  FREE_EXERCISE_DB_URL,
  type FitnessExerciseLibraryResponse,
} from "../../src/shared/fitness.js";
import { getExerciseLibrary, toListExercise } from "./_helpers/_exercises.js";

const SOURCE = {
  name: "free-exercise-db",
  url: FREE_EXERCISE_DB_URL,
  license: FREE_EXERCISE_DB_LICENSE,
  commit: FREE_EXERCISE_DB_COMMIT,
};

/**
 * GET /api/fitness/exercises        → compact list (no instructions)
 * GET /api/fitness/exercises?id=<id> → one exercise with instructions
 */
export default apiHandler(
  { methods: ["GET"], auth: "none" },
  async ({ req, res, logger, startTime }) => {
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (id.length > 120) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    let library;
    try {
      library = await getExerciseLibrary();
    } catch (error) {
      logger.error("exercise library unavailable", error);
      logger.response(502, Date.now() - startTime);
      res.status(502).json({ error: "exercise_library_unavailable" });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    if (id) {
      const exercise = library.byId.get(id);
      if (!exercise) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "not_found" });
        return;
      }
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ source: SOURCE, exercise });
      return;
    }

    const body: FitnessExerciseLibraryResponse = {
      source: SOURCE,
      exercises: library.exercises.map(toListExercise),
    };
    logger.info("exercise library served", { count: body.exercises.length });
    logger.response(200, Date.now() - startTime);
    res.status(200).json(body);
  }
);
