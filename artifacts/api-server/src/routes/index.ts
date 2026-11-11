import { Router, type IRouter } from "express";
import healthRouter from "./health";
import favoriRouter from "./favori";

const router: IRouter = Router();

// The API artifact is mounted at /api, so this also serves as its health check.
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

router.use(healthRouter);
router.use(favoriRouter);

export default router;
