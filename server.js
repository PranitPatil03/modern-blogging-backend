import express from "express";
import mongoose from "mongoose";
import "dotenv/config";
import bcrypt from "bcrypt";

const PORT = 3000;

const app = express();

app.use(express.json());

mongoose.connect(process.env.DB_LOCATION, {
  autoIndex: true,
});

app.listen(PORT, () => {
  console.log("Server Running on Port -> " + PORT);
});
