import bcrypt from "bcrypt";
import User from "../model/User.js";
import { passwordRegex } from "../constants/contants.js";
import { generateUploadURL } from "../services/services.js";
import Notification from "../model/Notification.js";
import Blog from "../model/Blog.js";

export const uploadURL = (req, res) => {
  generateUploadURL()
    .then((url) => {
      res.status(200).json({ uploadURL: url });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const uploadProfileImg = (req, res) => {
  const { updatedImgUrl } = req.body;

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
};

export const updateProfile = (req, res) => {
  const { userName, bio, social_links } = req.body;

  const bioLimit = 150;

  if (userName.length < 3) {
    return res
      .status(403)
      .json({ error: "UserName should be at least 3 characters long" });
  }

  if (bio.length > bioLimit) {
    return res
      .status(403)
      .json({ error: `Bio should be more than ${bioLimit}` });
  }

  const socialLinksArr = Object.keys(social_links);

  try {
    for (let i = 0; i < socialLinksArr.length; i++) {
      if (social_links[socialLinksArr[i]].length) {
        const hostName = new URL(social_links[socialLinksArr[i]]).hostname;

        if (
          !hostName.includes(`${socialLinksArr[i]}.com`) &&
          socialLinksArr[i] != "website"
        ) {
          return res.status(403).json({ error: "You must give correct URL" });
        }
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err });
  }

  const UpdateObj = {
    "personal_info.userName": userName,
    "personal_info.bio": bio,
    social_links,
  };

  User.findOneAndUpdate({ _id: req.user }, UpdateObj, {
    runValidators: true,
  })
    .then(() => {
      return res.status(200).json({ userName });
    })
    .catch((err) => {
      if (err.code == 11000) {
        return res.status(409).json({ error: "userName is already taken" });
      }
      return res.status(500).json({ error: err.message });
    });
};

export const changePassword = (req, res) => {
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
};

export const searchUsers = (req, res) => {
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
};

export const getProfile = (req, res) => {
  const { userName } = req.body;

  User.findOne({ "personal_info.userName": userName })
    .select("-personal_info.password -google_auth -updatedAt -blogs")
    .then((user) => {
      return res.status(200).json(user);
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const isLikedByUser = (req, res) => {
  const { _id } = req.body;

  const user_id = req.user;

  Notification.exists({ user: user_id, type: "like", blog: _id })
    .then((result) => {
      return res.status(200).json({ result });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};

export const userWrittenBlogs = (req, res) => {
  const user_id = req.user;

  let { page, draft, query, deletedDocCount } = req.body;

  const maxLimit = 5;

  const skipDocs = (page - 1) * maxLimit;

  if (deletedDocCount) {
    skipDocs -= deletedDocCount;
  }

  Blog.find({ author: user_id, draft, title: new RegExp(query, "i") })
    .skip(skipDocs)
    .limit(maxLimit)
    .sort({ publishedAt: -1 })
    .select("title banner publishedAt blog_id activity des draft -_id")
    .then((blogs) => {
      return res.status(200).json({ blogs });
    })
    .catch((err) => {
      return res.status(500).json({ err: err.message });
    });
};

export const userWrittenBlogsCount = (req, res) => {
  const user_id = req.user;

  const { query, draft } = req.body;

  Blog.countDocuments({ author: user_id, draft, title: new RegExp(query, "i") })
    .then((count) => {
      return res.status(200).json({ totalDocs: count });
    })
    .catch((err) => {
      return res.status(500).json({ err: err.message });
    });
};
