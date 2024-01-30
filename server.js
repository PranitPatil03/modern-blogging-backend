import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import admin from "firebase-admin";
import { authRouter } from "./routes/auth.js";
import { blogRouter } from "./routes/blog.js";
import { userRouter } from "./routes/user.js";
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
app.use("/comment", blogRouter);
app.use("/notifications", notificationRouter);

app.listen(PORT, () => {
  console.log("Server Running on Port -> " + PORT);
});
