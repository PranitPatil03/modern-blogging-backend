import "dotenv/config";
import cors from "cors";
import aws from "aws-sdk";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import admin from "firebase-admin";
import User from "./Schema/User.js";
import Blog from "./Schema/Blog.js";
import Notification from "./Schema/Notification.js";
import Comment from "./Schema/Comment.js";
import { getAuth } from "firebase-admin/auth";
import serviceAccountKey from "./mordern-blogging-platfrom-firebase-adminsdk-et5e8-0590012c08.json" assert { type: "json" };

const PORT = 4000;

const app = express();
app.use(express.json());
app.use(cors());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

let emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
let passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,20}$/;

mongoose.connect(process.env.DB_LOCATION, {
  autoIndex: true,
});

const s3 = new aws.S3({
  region: "ap-south-1",
  accessKeyId: process.env.AWS_SECRET_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No Access Token" });
  }

  jwt.verify(token, process.env.SECRET_ACCESS_KEY, (err, user) => {
    if (err) {
      console.log(err);
      return res.status(403).json({ err: "Access Token is Invalid" });
    }

    req.user = user.id;
    next();
  });
};

const generateUploadURL = async () => {
  const date = new Date();

  const ImageName = `${nanoid()}-${date.getTime()}.jpeg`;

  return await s3.getSignedUrlPromise("putObject", {
    Bucket: "modern-blogging-platform",
    Key: ImageName,
    Expires: 1000,
    ContentType: "image/jpeg",
  });
};

const formatDataToSend = (user) => {
  const accessToken = jwt.sign({ id: user._id }, process.env.SECRET_ACCESS_KEY);

  return {
    accessToken,
    profile_img: user.personal_info.profile_img,
    fullName: user.personal_info.fullName,
    userName: user.personal_info.userName,
  };
};

const generateUsername = async (email) => {
  const userName = email.split("@")[0];

  const isUserNameNotUnique = await User.exists({
    "personal_Info.userName": userName,
  }).then((result) => result);

  isUserNameNotUnique ? (userName += nanoid().substring(0, 5)) : "";

  return userName;
};

app.post("/signup", (req, res) => {
  const { fullName, email, password } = req.body;

  if (fullName.length < 3) {
    return res
      .status(403)
      .json({ error: "FullName must be at least 3 Letters long " });
  }

  if (!email.length) {
    return res.status(403).json({ error: "Enter Mail" });
  }

  if (!emailRegex.test(email)) {
    return res.status(403).json({ error: "Mail is Invalid" });
  }

  if (!passwordRegex.test(password)) {
    return res.status(403).json({ error: "Password is Invalid" });
  }

  bcrypt.hash(password, 10, async (err, hashed_password) => {
    const userName = await generateUsername(email);

    const user = new User({
      personal_info: { fullName, email, password: hashed_password, userName },
    });

    user
      .save()
      .then((user) => {
        return res.status(200).json({ User: formatDataToSend(user) });
      })
      .catch((err) => {
        if (err.code == 11000) {
          return res.status(500).json({ error: "This email already exits" });
        }

        return res.status(500).json({ error: err.message });
      });
  });
});

app.post("/sign-in", (req, res) => {
  const { email, password } = req.body;

  User.findOne({ "personal_info.email": email })
    .then((user) => {
      if (!user) {
        return res.status(403).json({ error: "Email Not Found" });
      }

      if (!user.google_auth) {
        bcrypt.compare(password, user.personal_info.password, (err, result) => {
          if (err) {
            return res.status(403).json({ error: "Error occurred Try Again" });
          }
          if (!result) {
            return res.status(403).json({ error: "Incorrect PassWord" });
          } else {
            return res.status(200).json(formatDataToSend(user));
          }
        });
      } else {
        return res
          .status(403)
          .json({ error: "This email is already use by google" });
      }
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
});

app.post("/google-auth", async (req, res) => {
  try {
    const { accessToken } = req.body;

    const decodedUser = await getAuth().verifyIdToken(accessToken);
    const { email, name } = decodedUser;
    let { picture } = decodedUser;

    picture = picture.replace(" s96-c", "s384-c");

    let user = await User.findOne({
      "personal_info.email": email,
    }).select(
      "personal_info.fullName personal_info.userName personal_info.profile_img google_auth"
    );

    if (user) {
      if (!user.google_auth) {
        return res
          .status(403)
          .json({ error: "This Email was signup without google" });
      }
    } else {
      const userName = await generateUsername(email);
      user = new User({
        personal_info: {
          fullName: name,
          email,
          userName,
        },
        google_auth: true,
      });

      await user.save();
    }

    return res.status(200).json(formatDataToSend(user));
  } catch (err) {
    return res.status(500).json({
      error: "Failed Try Again with different account1",
      err: err.message,
    });
  }
});

app.get("/get-upload-url", (req, res) => {
  generateUploadURL()
    .then((url) => {
      res.status(200).json({ uploadURL: url });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
});

app.post("/update-profile-img", verifyJWT, (req, res) => {
  const { updatedImgUrl } = req.body;

  console.log(updatedImgUrl);

  console.log(req.body);
  User.findOneAndUpdate(
    { _id: req.user },
    { "personal_info.profile_img": updatedImgUrl }
  )
    .then((u) => {
      return res
        .status(200)
        .json({ status: "Profile Image Updated", profile_img: updatedImgUrl });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
});

app.post("/change-password", verifyJWT, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (
    !passwordRegex.test(newPassword) ||
    !passwordRegex.test(currentPassword)
  ) {
    return res.status(403).json({ error: "Password is Invalid" });
  }

  User.findOne({ _id: req.user })
    .then((user) => {
      if (user.google_auth) {
        return res.status(403).json({
          error: "You cant change Password because you logged using Google",
        });
      }

      bcrypt.compare(
        currentPassword,
        user.personal_info.password,
        (err, result) => {
          if (err) {
            return res.status(500).json({
              error: "Some Error occurred while changing the password",
            });
          }

          if (!result) {
            return res
              .status(403)
              .json({ error: "Incorrect Current Password" });
          }

          bcrypt.hash(newPassword, 10, (e, hashed_password) => {
            User.findOneAndUpdate(
              { _id: req.user },
              { "personal_info.password": hashed_password }
            )
              .then((u) => {
                return res.status(200).json({ status: "Password Changed" });
              })
              .catch((err) => {
                return res.status(500).json({ error: err.message });
              });
          });
        }
      );
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
});

app.post("/latest-blogs", (req, res) => {
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
});
app.get("/trending-blogs", (req, res) => {
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
});

app.post("/create-blog", verifyJWT, (req, res) => {
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
});

app.post("/search-blogs", (req, res) => {
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
});

app.post("/all-latest-blogs-count", (req, res) => {
  Blog.countDocuments({ draft: false })
    .then((count) => {
      return res.status(200).json({ totalDocs: count });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
});

app.post("/search-blogs-count", (req, res) => {
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
});

app.post("/search-users", (req, res) => {
  const { query } = req.body;

  const findQuery = {
    "personal_info.username": new RegExp(query, "i"),
  };

  User.find({
    "personal_info.userName": new RegExp(query, "i"),
  })
    .limit(50)
    .select(
      "personal_info.fullName personal_info.userName personal_info.profile_img -_id"
    )
    .then((users) => {
      return res.status(200).json({ users });
    })
    .catch((err) => {
      return res.status(500).json({ error: err });
    });
});

app.post("/get-profile", (req, res) => {
  const { userName } = req.body;

  User.findOne({ "personal_info.userName": userName })
    .select("-personal_info.password -google_auth -updatedAt -blogs")
    .then((user) => {
      return res.status(200).json(user);
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
});

app.post("/get-blog", (req, res) => {
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
});

app.post("/like-blog", verifyJWT, (req, res) => {
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
});

app.post("/is-liked-by-user", verifyJWT, (req, res) => {
  const { _id } = req.body;

  const user_id = req.user;

  Notification.exists({ user: user_id, type: "like", blog: _id })
    .then((result) => {
      return res.status(200).json({ result });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
});

app.post("/add-comment", verifyJWT, (req, res) => {
  let user_id = req.user;
  let { _id, comment, blog_author, replying_to } = req.body;

  if (!comment.length) {
    return res
      .status(403)
      .json({ error: "Write something to leave a comment" });
  }

  const commentObj = {
    blog_id: _id,
    blog_author,
    comment,
    commented_by: user_id,
  };

  if (replying_to) {
    commentObj.parent = replying_to;
    commentObj.isReply = true;
  }

  new Comment(commentObj).save().then(async (commentFile) => {
    let { comment, commentedAt, children } = commentFile;

    Blog.findOneAndUpdate(
      { _id },
      {
        $push: { comments: commentFile._id },
        $inc: {
          "activity.total_comments": 1,
          "activity.total_parent_comments": replying_to ? 0 : 1,
        },
      }
    ).then((blog) => {
      console.log("New Comments Created");
    });

    let notificationObj = {
      type: replying_to ? "reply" : "comment",
      blog: _id,
      notification_for: blog_author,
      user: user_id,
      comment: commentFile._id,
    };

    if (replying_to) {
      notificationObj.replied_on_comment = replying_to;

      await Comment.findOneAndUpdate(
        { _id: replying_to },
        { $push: { children: commentFile._id } }
      ).then((replyingToCommentDoc) => {
        notificationObj.notification_for = replyingToCommentDoc.commented_by;
      });
    }

    new Notification(notificationObj).save().then((notification) => {
      console.log("New Notification Created");
    });

    return res.status(200).json({
      comment,
      commentedAt,
      _id: commentFile._id,
      user_id,
      children,
    });
  });
});

app.post("/get-blog-comments", (req, res) => {
  const { blog_id, skip } = req.body;

  const maxLimit = 5;

  Comment.find({ blog_id, isReply: false })
    .populate(
      "commented_by",
      "personal_info.fullName personal_info.userName personal_info.profile_img"
    )
    .skip(skip)
    .limit(maxLimit)
    .sort({
      commentedAt: -1,
    })
    .then((comment) => {
      return res.status(200).json(comment);
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.message });
    });
});

app.post("/get-replies", (req, res) => {
  const { _id, skip } = req.body;

  const maxLimit = 5;

  Comment.findOne({ _id })
    .populate({
      path: "children",
      options: {
        limit: maxLimit,
        skip: skip,
        sort: { commentedAt: -1 },
      },
      populate: {
        path: "commented_by",
        select:
          "personal_info.profile_img personal_info.userName personal_info.fullName",
      },
      select: "-blog_id -updatedAt",
    })
    .select("children")
    .then((doc) => {
      console.log("Line 671", doc.children);
      return res.status(200).json({ replies: doc.children });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
});

const deleteComments = (_id) => {
  Comment.findOneAndDelete({ _id })
    .then((comment) => {
      if (comment.parent) {
        Comment.findOneAndUpdate(
          { _id: comment.parent },
          { $pull: { children: _id } }
        ).then((comment) => {
          console.log("Comment Deleted from Parent");
        });
      }

      Notification.findOneAndDelete({ comment: _id }).then((notification) => {
        console.log("Comment Notification Deleted");
      });

      Notification.findOneAndDelete({ reply: _id }).then((notification) => {
        console.log("Comment Notification Deleted");
      });

      Blog.findOneAndUpdate(
        { _id: comment.blog_id },
        {
          $pull: { comments: _id },
          $inc: {
            "activity.total_comments": -1,
            "activity.total_parent_comments": comment.parent ? 0 : -1,
          },
        }
      ).then((blog) => {
        if (comment.children.length) {
          comment.children.map((replies) => {
            deleteComments(replies);
          });
        }
      });
    })
    .catch((err) => {
      console.log(err.message);
    });
};

app.post("/delete-comment", verifyJWT, (req, res) => {
  const userId = req.user;

  const { _id } = req.body;

  console.log("Req Body", req);

  Comment.findOne({ _id }).then((comment) => {
    if (userId == comment.commented_by || userId == comment.blog_author) {
      deleteComments(_id);
      return res.status(200).json({ status: "Done" });
    } else {
      return res.status(403).json({ error: "You can not delete the comment" });
    }
  });
});

app.listen(PORT, () => {
  console.log("Server Running on Port -> " + PORT);
});
