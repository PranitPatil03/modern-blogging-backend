import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import admin from "firebase-admin";
import { authRouter } from "./routes/auth.js";
import { blogRouter } from "./routes/blog.js";
import { userRouter } from "./routes/user.js";
import { commentRouter } from "./routes/comment.js";
import { notificationRouter } from "./routes/notification.js";
import serviceAccountKey from "./mordern-blogging-platfrom-firebase-adminsdk-et5e8-0590012c08.json" assert { type: "json" };

const PORT = 4000;

const app = express();
app.use(express.json());
app.use(cors());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

mongoose.connect(process.env.DB_LOCATION, {
  autoIndex: true,
});

app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/blog", blogRouter);
app.use("/comment", commentRouter);
app.use("/notifications", notificationRouter);

app.get("/api/health", (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: "Sever is running!",
    timestamp: Date.now(),
  };
  try {
    res.send(healthCheck);
  } catch (error) {
    healthCheck.message = error;
    res.status(503).send();
  }
});

app.listen(PORT, () => {
  console.log("Server Running on Port -> " + PORT);
});
