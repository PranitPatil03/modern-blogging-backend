import express from "express";
import { verifyJWT } from "../Middleware/verifyJWT.js";
import {
  allNotificationsCount,
  newNotification,
  notifications,
} from "../controllers/notification.js";

export const notificationRouter = express.Router();

notificationRouter
  .get("/new-notification", verifyJWT, newNotification)
  .post("/notifications", verifyJWT, notifications)
  .post("/all-notifications-count", verifyJWT, allNotificationsCount);
