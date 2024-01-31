import bcrypt from "bcrypt";
import User from "../model/User.js";
import { getAuth } from "firebase-admin/auth";
import { emailRegex, passwordRegex } from "../constants/contants.js";
import { formatDataToSend, generateUsername } from "../services/services.js";

export const createUser = (req, res) => {
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
};

export const loginUser = (req, res) => {
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
};

export const googleAuth = async (req, res) => {
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
};
