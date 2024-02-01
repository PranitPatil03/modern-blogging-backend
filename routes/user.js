import express from "express";
import { verifyJWT } from "../Middleware/verifyJWT.js";
import {
  changePassword,
  getProfile,
  isLikedByUser,
  searchUsers,
  updateProfile,
  uploadProfileImg,
  uploadURL,
  userWrittenBlogs,
  userWrittenBlogsCount,
} from "../controllers/user.js";

export const userRouter = express.Router();

userRouter
  .get("/get-upload-url", uploadURL)
  .post("/update-profile-img", verifyJWT, uploadProfileImg)
  .post("/update-profile", verifyJWT, updateProfile)
  .post("/change-password", verifyJWT, changePassword)
  .post("/search-users", searchUsers)
  .post("/get-profile", getProfile)
  .post("/is-liked-by-user", verifyJWT, isLikedByUser)
  .post("/user-written-blogs", verifyJWT, userWrittenBlogs)
  .post("/user-written-blogs-count", verifyJWT, userWrittenBlogsCount);
