import aws from "aws-sdk";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import User from "../model/User.js";
import Comment from "../model/Comment.js";
import Notification from "../model/Notification.js";
import Blog from "../model/Blog.js";

const s3 = new aws.S3({
  region: "ap-south-1",
  accessKeyId: process.env.AWS_SECRET_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

export const generateUploadURL = async () => {
  const date = new Date();

  const ImageName = `${nanoid()}-${date.getTime()}.jpeg`;

  return await s3.getSignedUrlPromise("putObject", {
    Bucket: "modern-blogging-platform",
    Key: ImageName,
    Expires: 1000,
    ContentType: "image/jpeg",
  });
};

export const formatDataToSend = (user) => {
  const accessToken = jwt.sign({ id: user._id }, process.env.SECRET_ACCESS_KEY);

  return {
    accessToken,
    profile_img: user.personal_info.profile_img,
    fullName: user.personal_info.fullName,
    userName: user.personal_info.userName,
  };
};

export const generateUsername = async (email) => {
  const userName = email.split("@")[0];

  const isUserNameNotUnique = await User.exists({
    "personal_Info.userName": userName,
  }).then((result) => result);

  isUserNameNotUnique ? (userName += nanoid().substring(0, 5)) : "";

  return userName;
};

export const deleteComments = (_id) => {
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

      Notification.findOneAndUpdate(
        { reply: _id },
        { $unset: { reply: 1 } }
      ).then((notification) => {
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
