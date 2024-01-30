import express from "express";
import { verifyJWT } from "../Middleware/verifyJWT.js";
import {
  addComment,
  deleteComment,
  getBlogComments,
  getReplies,
} from "../controllers/comment.js";

export const commentRouter = express.Router();

commentRouter
  .get("/add-comment", verifyJWT, addComment)
  .post("/get-blog-comments", getBlogComments)
  .post("/get-replies", getReplies)
  .post("/delete-comment", verifyJWT, deleteComment);
