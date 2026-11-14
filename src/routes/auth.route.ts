import { Router } from "express";
import { authController } from "@/controllers/auth.controller.js";
import { authenticate } from "@/middleware/authenticate.middleware.js";
import { validateRequest } from "@/middleware/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "@/validators/auth.validator.js";

const router = Router();

// Public routes
router.post("/register", validateRequest(registerSchema), (req, res, next) =>
  authController.register(req, res, next)
);

router.post("/login", validateRequest(loginSchema), (req, res, next) =>
  authController.login(req, res, next)
);

router.post("/logout", (req, res, next) =>
  authController.logout(req, res, next)
);

router.post("/forgot-password", validateRequest(forgotPasswordSchema), (req, res, next) =>
  authController.forgotPassword(req, res, next)
);

router.post("/reset-password", validateRequest(resetPasswordSchema), (req, res, next) =>
  authController.resetPassword(req, res, next)
);

// Google OAuth routes
router.get("/google", (req, res) =>
  authController.googleRedirect(req, res)
);

router.get("/google/callback", (req, res, next) =>
  authController.googleCallback(req, res, next)
);

// Protected routes (require valid active session)
router.patch("/password", authenticate, validateRequest(changePasswordSchema), (req, res, next) =>
  authController.changePassword(req, res, next)
);

router.get("/me", authenticate, (req, res, next) =>
  authController.getMe(req, res, next)
);

router.get("/sessions", authenticate, (req, res, next) =>
  authController.getSessions(req, res, next)
);

router.delete("/sessions/:sessionId", authenticate, (req, res, next) =>
  authController.revokeSession(req, res, next)
);

export default router;
