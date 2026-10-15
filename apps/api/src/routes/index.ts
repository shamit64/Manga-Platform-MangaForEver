import { Router } from "express";
import { forgotPasswordSchema, changePasswordSchema, loginSchema, registerSchema, resendVerificationSchema, resetPasswordSchema, verifyEmailSchema } from "@mangaforever/shared";
import * as admin from "../controllers/admin.controller.js";
import * as auth from "../controllers/auth.controller.js";
import * as catalog from "../controllers/catalog.controller.js";
import * as live from "../controllers/live.controller.js";
import * as me from "../controllers/user-data.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { loginLimiter, passwordResetLimiter, registerLimiter, reviewLimiter, searchLimiter, writeLimiter } from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";

export const api = Router();

// ───────── Auth ─────────
api.post("/auth/register", registerLimiter, validateBody(registerSchema), auth.register);
api.post("/auth/login", loginLimiter, validateBody(loginSchema), auth.login);
api.post("/auth/logout", auth.logout);
api.post("/auth/forgot-password", passwordResetLimiter, validateBody(forgotPasswordSchema), auth.forgotPassword);
api.post("/auth/reset-password", passwordResetLimiter, validateBody(resetPasswordSchema), auth.resetPassword);
api.post("/auth/change-password", requireAuth, loginLimiter, validateBody(changePasswordSchema), auth.changePassword);
api.get("/auth/me", requireAuth, auth.me);
api.post("/auth/verify-email", passwordResetLimiter, validateBody(verifyEmailSchema), auth.verifyEmail);
api.post("/auth/resend-verification", passwordResetLimiter, validateBody(resendVerificationSchema), auth.resendVerification);

// ───────── Catalog (public) ─────────
api.get("/meta", catalog.meta);
api.get("/manga", searchLimiter, catalog.list);
api.get("/manga/search", searchLimiter, catalog.search);
api.get("/manga/suggest", searchLimiter, catalog.suggest);
api.get("/manga/:id", catalog.detail);
api.get("/manga/:id/recommendations", catalog.related);
api.get("/manga/:id/reviews", catalog.seriesReviews);
api.post("/manga/:id/reviews", requireAuth, reviewLimiter, catalog.createReview);
api.put("/manga/:id/rating", requireAuth, writeLimiter, catalog.rate);
api.delete("/manga/:id/rating", requireAuth, writeLimiter, catalog.unrate);
api.get("/genres", catalog.genres);
api.get("/tags", catalog.tags);
api.get("/rankings", catalog.rankings);
api.get("/featured", catalog.featured);
api.get("/seasonal", catalog.seasonal);
api.get("/latest", catalog.latest);
api.get("/new-releases", catalog.newReleases);
api.get("/reviews/recent", catalog.recentReviews);
api.get("/latest-updates", live.latestUpdates);

// ───────── Chapters, reader & follows ─────────
api.get("/manga/:id/chapters", live.chapterList);
api.get("/manga/:id/chapters/:number", live.chapterGet);
api.put("/manga/:id/follow", requireAuth, writeLimiter, live.follow);
api.delete("/manga/:id/follow", requireAuth, writeLimiter, live.unfollow);
api.get("/follows", requireAuth, live.followsList);
api.post("/chapters/:chapterId/read", requireAuth, writeLimiter, live.chapterRead);
api.put("/chapters/:chapterId/reaction", requireAuth, writeLimiter, live.chapterReact);
api.get("/chapters/:chapterId/comments", live.commentsList);
api.post("/chapters/:chapterId/comments", requireAuth, reviewLimiter, live.commentCreate);
api.delete("/chapter-comments/:id", requireAuth, writeLimiter, live.commentDelete);

// ───────── Notifications & live updates ─────────
api.get("/notifications", requireAuth, live.notificationsList);
api.get("/notifications/unread-count", requireAuth, live.notificationsUnread);
api.post("/notifications/read-all", requireAuth, writeLimiter, live.notificationsReadAll);
api.post("/notifications/:id/read", requireAuth, writeLimiter, live.notificationRead);
api.get("/push/public-key", live.pushKey);
api.post("/push/subscriptions", requireAuth, writeLimiter, live.pushSubscribe);
api.delete("/push/subscriptions", requireAuth, writeLimiter, live.pushUnsubscribe);
api.get("/events", live.events);

// ───────── Library ─────────
api.get("/library", requireAuth, me.libraryList);
api.get("/library/stats", requireAuth, me.libraryStats);
api.get("/library/continue", requireAuth, me.libraryContinue);
api.post("/library", requireAuth, writeLimiter, me.libraryAdd);
api.patch("/library/:id", requireAuth, writeLimiter, me.libraryUpdate);
api.delete("/library/:id", requireAuth, writeLimiter, me.libraryRemove);

// ───────── Favorites ─────────
api.get("/favorites", requireAuth, me.favoritesList);
api.post("/favorites", requireAuth, writeLimiter, me.favoritesAdd);
api.delete("/favorites/:mangaId", requireAuth, writeLimiter, me.favoritesRemove);

// ───────── Reviews ─────────
api.patch("/reviews/:id", requireAuth, reviewLimiter, me.reviewUpdate);
api.delete("/reviews/:id", requireAuth, me.reviewDelete);
api.post("/reviews/:id/helpful", requireAuth, writeLimiter, me.reviewHelpful);
api.post("/reviews/:id/report", requireAuth, reviewLimiter, me.reviewReport);

// ───────── History ─────────
api.get("/history", requireAuth, me.historyList);
api.get("/history/recent", requireAuth, me.historyRecent);
api.post("/history/views", requireAuth, writeLimiter, me.historyView);
api.delete("/history/:id", requireAuth, me.historyRemove);
api.delete("/history", requireAuth, me.historyClear);
api.get("/search-history", requireAuth, me.searchesList);
api.delete("/search-history/:id", requireAuth, me.searchesRemove);
api.delete("/search-history", requireAuth, me.searchesClear);

// ───────── Recommendations (public fallback when signed out) ─────────
api.get("/recommendations", me.recommendations);
api.post("/recommendations/dismiss", requireAuth, writeLimiter, me.dismissRec);
api.delete("/recommendations/dismissed", requireAuth, me.restoreRecs);

// ───────── Profiles & community ─────────
api.patch("/users/me", requireAuth, writeLimiter, me.profileUpdate);
api.get("/users/:username", me.profileGet);
api.get("/users/:username/library", me.profileLibrary);
api.post("/users/:username/follow", requireAuth, writeLimiter, me.follow);
api.delete("/users/:username/follow", requireAuth, writeLimiter, me.unfollow);
api.get("/feed", requireAuth, me.feed);

// ───────── Moderation (moderator or admin) ─────────
const mod = Router();
mod.use(requireRole("MODERATOR"));
mod.get("/reports", admin.reports);
mod.post("/reports/:id/resolve", admin.resolveReport);
mod.patch("/reviews/:id/visibility", admin.reviewVisibility);
mod.get("/chapter-comments/held", live.adminHeldComments);
mod.patch("/chapter-comments/:id/visibility", live.adminCommentVisibility);
api.use("/admin", mod);

// ───────── Administration (admin only) ─────────
const adm = Router();
adm.use(requireRole("ADMIN"));
adm.get("/statistics", admin.statistics);
adm.get("/manga", admin.seriesList);
adm.post("/manga", admin.seriesCreate);
adm.get("/manga/duplicates", admin.duplicates);
adm.post("/manga/merge", admin.seriesMerge);
adm.patch("/manga/:id", admin.seriesUpdate);
adm.delete("/manga/:id", admin.seriesDelete);
adm.post("/manga/:id/refresh", admin.seriesRefresh);
adm.get("/import/search", admin.importSearch);
adm.post("/import", admin.importRun);
adm.get("/featured", admin.featuredList);
adm.put("/featured", admin.featuredSet);
adm.delete("/featured/:seriesId", admin.featuredRemove);
adm.get("/collections", admin.collectionsList);
adm.post("/collections", admin.collectionCreate);
adm.put("/collections/:id", admin.collectionUpdate);
adm.delete("/collections/:id", admin.collectionDelete);
adm.get("/users", admin.usersList);
adm.patch("/users/:id", admin.userUpdate);
adm.get("/audit-log", admin.auditLog);
adm.get("/jobs", live.adminJobs);
adm.post("/jobs/:job/run", live.adminJobRun);
adm.post("/manga/:id/chapters", live.adminHostChapter);
adm.get("/source-links/unmatched", live.adminUnlinked);
adm.put("/manga/:id/source-link", live.adminSetSourceLink);
api.use("/admin", adm);
