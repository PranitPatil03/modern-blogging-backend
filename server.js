import express from "express";
import mongoose from "mongoose";
import "dotenv/config";
import bcrypt from "bcrypt";
import cors from "cors";
import admin from "firebase-admin";
import { nanoid } from "nanoid";
import jwt from "jsonwebtoken";
import serviceAccountKey from "./mordern-blogging-platfrom-firebase-adminsdk-et5e8-0590012c08.json" assert { type: "json" };
import { getAuth } from "firebase-admin/auth";
import User from "./Schema/User.js";

const PORT = 3000;

const app = express();
app.use(express.json());
app.use(cors());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

let emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
let passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,20}$/;

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

mongoose.connect(process.env.DB_LOCATION, {
  autoIndex: true,
});

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

app.listen(PORT, () => {
  console.log("Server Running on Port -> " + PORT);
});
