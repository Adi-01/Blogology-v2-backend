import express from "express";
import responseMiddleware from "@/middleware/response.js";
import requestLogger from "@/middleware/requestLogger.js";
import { errorHandler } from "@/middleware/errorHandler.js";
import { BASE_ROUTES } from "@/lib/constants.js";
import authRouter from "@/routes/auth.route.js";
import userRouter from "@/routes/user.route.js";
import postsRouter from "@/routes/posts.route.js";
import uploadRouter from "@/routes/upload.route.js";
import aiRouter from "@/routes/ai.route.js";
import feedRouter from "@/routes/feed.route.js";
import searchRouter from "@/routes/search.route.js";
import bookmarksRouter from "@/routes/bookmarks.route.js";
import commentsRouter from "@/routes/comments.route.js";
import billingRouter from "@/routes/billing.route.js";

const app = express();

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(requestLogger);
app.use(responseMiddleware);

app.get(BASE_ROUTES.health, (req, res) => {
  return res.success("Blogology API is healthy");
});

app.use(BASE_ROUTES.auth, authRouter);
app.use(BASE_ROUTES.users, userRouter);
app.use(BASE_ROUTES.posts, postsRouter);
app.use(BASE_ROUTES.bookmarks, bookmarksRouter);
app.use(BASE_ROUTES.comments, commentsRouter);
app.use(BASE_ROUTES.upload, uploadRouter);
app.use(BASE_ROUTES.ai, aiRouter);
app.use(BASE_ROUTES.feed, feedRouter);
app.use(BASE_ROUTES.search, searchRouter);
app.use(BASE_ROUTES.billing, billingRouter);

app.use(errorHandler);

export default app;
