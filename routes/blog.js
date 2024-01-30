import express from "express";
import { verifyJWT } from "../Middleware/verifyJWT.js";
import {
  LatestBlogs,
  blogCount,
  createBlog,
  getBlog,
  likeBlog,
  searchBlogCount,
  searchBlogs,
  trendingBlogs,
} from "../controllers/blog.js";

export const blogRouter = express.Router();

blogRouter
  .post("/latest-blogs", LatestBlogs)
  .get("/trending-blogs", trendingBlogs)
  .post("/create-blog", verifyJWT, createBlog)
  .post("/search-blogs", searchBlogs)
  .post("/all-latest-blogs-count", blogCount)
  .post("/search-blogs-count", searchBlogCount)
  .post("/get-blog", getBlog)
  .post("/like-blog", likeBlog);
