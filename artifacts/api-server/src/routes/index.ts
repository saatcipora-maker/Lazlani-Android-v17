import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import syncRouter from "./sync";
import storageRouter from "./storage";
import premiumRequestsRouter from "./premium-requests";
import adminUsersRouter from "./admin-users";
import loveRouter from "./love";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(syncRouter);
router.use(storageRouter);
router.use(premiumRequestsRouter);
router.use(adminUsersRouter);
router.use(loveRouter);

export default router;
