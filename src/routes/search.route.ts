import { Router } from "express";
import { searchController } from "@/controllers/search.controller.js";
import { optionalAuthenticate } from "@/middleware/authenticate.middleware.js";
import { validateQuery } from "@/middleware/validate.middleware.js";
import { searchQuerySchema } from "@/validators/search.validator.js";

const router = Router();

router.get("/posts", optionalAuthenticate, validateQuery(searchQuerySchema), (req, res, next) =>
  searchController.searchPosts(req, res, next)
);

router.get("/users", optionalAuthenticate, validateQuery(searchQuerySchema), (req, res, next) =>
  searchController.searchUsers(req, res, next)
);

export default router;
