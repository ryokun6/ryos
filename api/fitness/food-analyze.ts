import { google } from "@ai-sdk/google";
import { generateText, NoObjectGeneratedError, Output, type UserContent } from "ai";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import {
  buildFoodPrompt,
  decodeBase64,
  FoodAiOutputSchema,
  FoodAnalyzeRequestSchema,
  FOOD_AI_LIMITS,
  foodResultFromAi,
  type FoodAnalyzeRequestBody,
} from "./_helpers/_food.js";

/**
 * POST /api/fitness/food-analyze
 * Body: { image?: { mediaType, data(base64) }, text?, locale? }
 * Returns an editable nutrition estimate ({@link FoodAnalyzeResponse}).
 */
export default apiHandler<FoodAnalyzeRequestBody>(
  {
    methods: ["POST"],
    auth: "optional",
    bodySchema: FoodAnalyzeRequestSchema,
  },
  async ({ req, res, logger, startTime, user, body }) => {
    const identifier = user?.username ?? getClientIp(req);
    const scope = user ? "user" : "ip";
    const burst = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "fitness-food-ai", "burst", scope, identifier]),
      windowSeconds: FOOD_AI_LIMITS.burstWindowSeconds,
      limit: user ? FOOD_AI_LIMITS.burstUser : FOOD_AI_LIMITS.burstAnon,
    });
    const daily = burst.allowed
      ? await RateLimit.checkCounterLimit({
          key: RateLimit.makeKey(["rl", "fitness-food-ai", "daily", scope, identifier]),
          windowSeconds: FOOD_AI_LIMITS.dailyWindowSeconds,
          limit: user ? FOOD_AI_LIMITS.dailyUser : FOOD_AI_LIMITS.dailyAnon,
        })
      : burst;
    if (!burst.allowed || !daily.allowed) {
      const limit = !burst.allowed ? burst : daily;
      res.setHeader("Retry-After", String(limit.resetSeconds));
      logger.response(429, Date.now() - startTime);
      res.status(429).json({
        error: "rate_limit_exceeded",
        scope: !burst.allowed ? "burst" : "daily",
        limit: limit.limit,
        retryAfter: limit.resetSeconds,
        isAuthenticated: !!user,
      });
      return;
    }

    const { image, text, locale = "en" } = body!;
    logger.info("fitness food analyze", {
      authed: !!user,
      hasImage: !!image,
      imageBytes: image ? Math.round((image.data.length * 3) / 4) : 0,
      hasText: !!text,
    });

    const prompt = buildFoodPrompt({ hasImage: !!image, text, locale });
    const content: UserContent = [{ type: "text", text: prompt.user }];
    if (image) {
      content.push({
        type: "file",
        mediaType: image.mediaType,
        data: { type: "data", data: decodeBase64(image.data) },
      });
    }

    try {
      const { output } = await generateText({
        model: google("gemini-3-flash-preview"),
        instructions: prompt.instructions,
        output: Output.object({ schema: FoodAiOutputSchema, name: "food_estimate" }),
        messages: [{ role: "user", content }],
        temperature: 0.2,
      });
      if (!output) throw new Error("AI returned no estimate");
      const result = foodResultFromAi(output);
      logger.response(200, Date.now() - startTime);
      res.status(200).json(result);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        logger.warn("food ai produced no object", { text: error.text });
      } else {
        logger.error("food ai failed", error);
      }
      logger.response(502, Date.now() - startTime);
      res.status(502).json({ error: "ai_unavailable" });
    }
  }
);
