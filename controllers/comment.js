import Blog from "../model/Blog.js";
import Comment from "../model/Comment.js";
import Notification from "../model/Notification.js";
import { deleteComments } from "../services/services.js";

export const addComment = (req, res) => {
  let user_id = req.user;
  let { _id, comment, blog_author, replying_to, notification_id } = req.body;

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

      if (notification_id) {
        Notification.findOneAndUpdate(
          { _id: notification_id },
          { reply: commentFile._id }
        )
          .then((notification) => {
            console.log(notification);
          })
          .catch((err) => {
            console.log(err);
          });
      }
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
};

export const getBlogComments = (req, res) => {
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
};

export const getReplies = (req, res) => {
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
};

export const deleteComment = (req, res) => {
  const userId = req.user;

  const { _id } = req.body;

  console.log("Req Body", req);

  Comment.findOne({ _id }).then((comment) => {
    if (userId == comment?.commented_by || userId == comment?.blog_author) {
      deleteComments(_id);
      return res.status(200).json({ status: "Done" });
    } else {
      return res.status(403).json({ error: "You can not delete the comment" });
    }
  });
};
