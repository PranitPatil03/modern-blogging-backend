import { nanoid } from "nanoid";
import Blog from "../model/Blog.js";
import User from "../model/User.js";
import Comment from "../model/Comment.js";
import Notification from "../model/Notification.js";

export const LatestBlogs = (req, res) => {
  const { page } = req.body;

  const maxLimit = 5;

  Blog.find({ draft: false })
    .populate(
      "author",
      "personal_info.fullName personal_info.userName personal_info.profile_img -_id"
    )
    .sort({ publishedAt: -1 })
    .select("blog_id title description banner activity tags publishedAt -_id")
    .skip((page - 1) * maxLimit)
    .limit(maxLimit)
    .then((blogs) => {
      return res.status(200).json({ blogs });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const trendingBlogs = (req, res) => {
  Blog.find({ draft: false })
    .populate(
      "author",
      "personal_info.fullName personal_info.userName personal_info.profile_img -_id"
    )
    .sort({
      "activity.total_read": -1,
      "activity.total_like": -1,
      publishedAt: -1,
    })
    .select("blog_id title publishedAt -_id")
    .limit(5)
    .then((blogs) => {
      return res.status(200).json({ blogs });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const createBlog = (req, res) => {
  const authorID = req.user;

  console.log("authorID", authorID);

  console.log("REQ Body==>", req.body, "<==REQ Body");

  let { title, description, banner, tags, content, draft, id } = req.body;

  if (!title.length) {
    return res
      .status(403)
      .json({ error: "You must Provide a title to publish the blog" });
  }

  if (!draft) {
    if (!description.length || description.length > 200) {
      return res.status(403).json({
        error:
          "You must Provide a description under 200 characters to publish the blog",
      });
    }

    if (!banner.length) {
      return res.status(403).json({
        error: "You must Provide a banner to publish the blog",
      });
    }

    if (!content.blocks.length) {
      return res.status(403).json({
        error: "You must Provide a content to the blog",
      });
    }

    if (!tags.length || tags.length > 10) {
      return res.status(403).json({
        error: "You must Provide a tags to the blog",
      });
    }
  }

  // tags = tags.map((tag) => tag.toLowerCase());

  const blog_id =
    id ||
    title
      .replace(/[^a-zA-Z0-9]/g, "")
      .replace(/[\s+]/g, "-")
      .trim() + nanoid();

  if (id) {
    Blog.findOneAndUpdate(
      { blog_id },
      { title, description, banner, content, tags, draft: Boolean(draft) }
    )
      .then(() => {
        return res.status(200).json({ id: blog_id });
      })
      .catch((err) => {
        return res.status(500).json({ error: err.message });
      });
  } else {
    const blog = new Blog({
      author: authorID,
      title,
      description,
      banner,
      content,
      tags,
      blog_id,
      draft: Boolean(draft),
    });

    blog
      .save()
      .then((blog) => {
        const incrementedValue = draft ? 0 : 1;

        User.findOneAndUpdate(
          { _id: authorID },
          {
            $inc: { "account_info.total_posts": incrementedValue },
            $push: { blogs: blog._id },
          }
        )
          .then((user) => {
            return res.status(200).json({ id: blog.blog_id });
          })
          .catch((err) => {
            return res
              .status(500)
              .json({ error: "Failed to update total blog posts" });
          });
      })
      .catch((err) => {
        return res.status(500).json({ error: err.message });
      });
  }
};

export const searchBlogs = (req, res) => {
  let { tag, page, query, author, limit, eliminate_blog } = req.body;

  let findQuery;

  if (tag) {
    findQuery = { tags: tag, draft: false, blog_id: { $ne: eliminate_blog } };
  } else if (query) {
    findQuery = { draft: false, title: new RegExp(query, "i") };
  } else if (author) {
    findQuery = { author, draft: false };
  }

  const maxLimit = limit ? limit : 2;

  Blog.find(findQuery)
    .populate(
      "author",
      "personal_info.fullName personal_info.userName personal_info.profile_img -_id"
    )
    .sort({ publishedAt: -1 })
    .select("blog_id title description banner activity tags publishedAt -_id")
    .skip((page - 1) * maxLimit)
    .limit(maxLimit)
    .then((blogs) => {
      return res.status(200).json({ blogs });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const blogCount = (req, res) => {
  Blog.countDocuments({ draft: false })
    .then((count) => {
      return res.status(200).json({ totalDocs: count });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const searchBlogCount = (req, res) => {
  const { tag, query, author } = req.body;

  let findQuery;

  if (tag) {
    findQuery = { tags: tag, draft: false };
  } else if (query) {
    findQuery = { draft: false, title: new RegExp(query, "i") };
  } else if (author) {
    findQuery = { author, draft: false };
  }

  Blog.countDocuments(findQuery)
    .then((count) => {
      return res.status(200).json({ totalDocs: count });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const getBlog = (req, res) => {
  const { blog_id, draft, mode } = req.body;

  const incrementedValue = mode != "edit" ? 1 : 0;

  Blog.findOneAndUpdate(
    { blog_id },
    { $inc: { "activity.total_reads": incrementedValue } }
  )
    .populate(
      "author",
      "personal_info.fullName personal_info.userName personal_info.profile_img"
    )
    .select(
      "title description content banner activity publishedAt blog_id tags"
    )
    .then((blog) => {
      User.findOneAndUpdate(
        { "personal_info.userName": blog.author.personal_info.userName },
        {
          $inc: { "account_info.total_reads": incrementedValue },
        }
      );
      if (blog.draft && !draft) {
        return res.status(500).json({ error: err.message });
      }
      return res.status(200).json({ blog });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const deleteBlog = (req, res) => {
  const user_id = req.user;

  const { blog_id } = req.body;

  Blog.findOneAndDelete({ blog_id })
    .then((blog) => {
      Notification.deleteMany({ blog: blog._id }).then((data) =>
        console.log("Notification Deleted")
      );

      Comment.deleteMany({ blog_id: blog._id }).then((data) =>
        console.log("Comments Deleted")
      );

      User.findOneAndUpdate(
        { _id: user_id },
        { $pull: { blog: blog._id }, $inc: { "account_info.total_posts": -1 } }
      ).then((user) => console.log("Blog Deleted"));

      return res.status(200).json({ status: "Done" });
    })
    .catch((err) => {
      return res.status(500).json({ err: err.message });
    });
};

export const likeBlog = (req, res) => {
  const user_id = req.user;

  const { _id, isLikeByUser } = req.body;

  const incrementedValue = !isLikeByUser ? 1 : -1;

  Blog.findOneAndUpdate(
    { _id },
    {
      $inc: { "activity.total_likes": incrementedValue },
    }
  )
    .then((blog) => {
      if (!isLikeByUser) {
        let like = new Notification({
          type: "like",
          blog: _id,
          notification_for: blog.author,
          user: user_id,
        });

        like.save().then((notification) => {
          return res.status(200).json({ like_by_user: true, notification });
        });
      } else {
        Notification.findOneAndDelete({
          user: user_id,
          type: "like",
          blog: _id,
        })
          .then((data) => {
            return res.status(200).json({ like_by_user: true, data });
          })
          .catch((err) => {
            return res.status(500).json({ error: err.message });
          });
      }
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};
