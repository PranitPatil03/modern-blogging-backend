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
import { getAuth } from "firebase-admin/auth";
import serviceAccountKey from "./mordern-blogging-platfrom-firebase-adminsdk-et5e8-0590012c08.json" assert { type: "json" };

const PORT = 3000;

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

  console.log("REQ Body==>", req.body, "<==REQ Body");

  let { title, description, banner, tags, content, draft } = req.body;

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
    title
      .replace(/[^a-zA-Z0-9]/g, "")
      .replace(/[\s+]/g, "-")
      .trim() + nanoid();

  const blog = new Blog({
    title,
    description,
    banner,
    content,
    tags,
    author: authorID,
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
});

app.post("/search-blogs", (req, res) => {
  let { tag, page, query } = req.body;

  let findQuery;

  if (tag) {
    findQuery = { tags: tag, draft: false };
  } else if (query) {
    findQuery = { draft: false, title: new RegExp(query, "i") };
  }

  const maxLimit = 2;

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
  const { tag, query } = req.body;

  let findQuery;

  if (tag) {
    findQuery = { tags: tag, draft: false };
  } else if (query) {
    findQuery = { draft: false, title: new RegExp(query, "i") };
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

app.listen(PORT, () => {
  console.log("Server Running on Port -> " + PORT);
});
