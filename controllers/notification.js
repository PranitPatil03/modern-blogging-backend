import Notification from "../model/Notification.js";

export const newNotification = (req, res) => {
   const user_id = req.user;

  Notification.exists({
    notification_for: user_id,
    seen: false,
    user: { $ne: user_id },
  })
    .then((result) => {
      if (result) {
        return res.status(200).json({ new_notification_available: true });
      } else {
        return res.status(200).json({ new_notification_available: false });
      }
    })
    .catch((err) => {
      console.error(`Error in getting notifications ${err.message}`);
      return res.status(500).json({ err: err.message });
    });
};

export const notifications = (req, res) => {
  const user_id = req.user;

  let { page, filter, deletedDocCount } = req.body;

  const maxLimit = 10;

  const findQuery = { notification_for: user_id, user: { $ne: user_id } };

  const skipDocs = (page - 1) * maxLimit;

  if (filter != "all") {
    findQuery.type = filter;
  }

  if (deletedDocCount) {
    skipDocs -= deletedDocCount;
  }

  Notification.find(findQuery)
    .skip(skipDocs)
    .limit(maxLimit)
    .populate("blog", "title blog_id")
    .populate(
      "user",
      "personal_info.fullName personal_info.userName personal_info.profile_img"
    )
    .populate("comment", "comment")
    .populate("replied_on_comment", "comment")
    .populate("reply", "comment")
    .sort({ createdAt: -1 })
    .select("createdAt type seen reply")
    .then((notifications) => {
      Notification.updateMany(findQuery, { seen: true })
        .skip(skipDocs)
        .limit(maxLimit)
        .then((notification) => {
          console.log("Notification has been seen", notification);
        });
      return res.status(200).json({ notifications });
    })
    .catch((err) => {
      console.error(err.message);
      return res.status(500).send({ err: err.message });
    });
};

export const allNotificationsCount = (req, res) => {
  const user_id = req.user;

  let { filter } = req.body;

  const findQuery = { notification_for: user_id, user: { $ne: user_id } };

  if (filter != "all") {
    findQuery.type = filter;
  }

  Notification.countDocuments(findQuery)
    .then((count) => {
      return res.status(200).json({ totalDocs: count });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.message });
    });
};
