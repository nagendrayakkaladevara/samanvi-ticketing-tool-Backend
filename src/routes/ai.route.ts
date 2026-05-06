import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest } from "../core/errors/http-errors";
import { requireAuth } from "../middleware/auth";
import { enhanceTicketDescriptionWithSarvam } from "../services/sarvam-ai.service";

const enhanceTicketDescriptionSchema = z.object({
  description: z.string().trim().min(1).max(4_000),
});

const aiRouter = Router();

aiRouter.use(requireAuth);

const aiEnhanceRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: "AI_RATE_LIMITED",
        message: "AI enhance limit reached. Max 20 requests per minute.",
        details: {
          windowMs: 60_000,
          max: 20,
        },
      },
      requestId: req.requestId,
    });
  },
});

aiRouter.post(
  "/ai/enhance-ticket-description",
  aiEnhanceRateLimiter,
  asyncHandler(async (req, res) => {
    const parsedBody = enhanceTicketDescriptionSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid AI enhance payload", {
        issues: parsedBody.error.issues,
      });
    }

    const enhancedText = await enhanceTicketDescriptionWithSarvam(
      parsedBody.data.description,
    );

    res.status(200).json({
      success: true,
      data: {
        enhancedText,
      },
    });
  }),
);

export { aiRouter };
