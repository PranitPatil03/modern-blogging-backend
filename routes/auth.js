import express from "express";
import {
  createUser,
  googleAuth,
  loginUser,
} from "../controllers/auth.js";

export const authRouter = express.Router();

authRouter
  .post("/signup", createUser)
  .post("/sign-in", loginUser)
  .post("/google-auth", googleAuth);
