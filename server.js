
const express = require("express");
const { google } = require("googleapis");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;
const googleClientId = process.env.GOOGLE_CLIENT_ID;

const googleClientSecret = process.env.GOOGLE_SECRET;

const jwtSecret = "yash";
const oauth2Client = new google.auth.OAuth2(
  googleClientId,
  googleClientSecret,
  "https://jsmainsitebackend.onrender.com/api/auth/google/callback"
  // "http://localhost:3001/api/auth/google/callback"  
);

// Connect to the first MongoDB database
const mainMongoURI =
  "mongodb+srv://yashd:devweb1234@nodeexpressproject.qp0arwg.mongodb.net/JSmain?retryWrites=true&w=majority";
const mainDb = mongoose.createConnection(mainMongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mainDb.on(
  "error",
  console.error.bind(console, "Main MongoDB connection error:")
);
mainDb.once("open", () => console.log("Connected to Main MongoDB"));

// Enable CORS for all routes
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// Middleware to verify JWT
const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization;
  // console.log(invalidatedTokens)

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  jwt.verify(token.replace("Bearer ", ""), jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    // Attach decoded user information to the request object
    req.user = decoded;
    next();
  });
};

// Define a schema for the array elements
const arrayElementSchema = new mongoose.Schema({
  date: { type: String, default: "" },
  type: { type: String, default: "" },
  totalMarks: { type: Number, default: 0 },
  marksScored: { type: Number, default: 0 },
  sillyError: { type: Number, default: 0 },
  revision: { type: Number, default: 0 },
  toughness: { type: Number, default: 0 },
  theory: { type: Number, default: 0 },
});

if (!mongoose.models["TestEntry"]) {
  // Define the schema for the test entry
  const testEntrySchema = new mongoose.Schema({
    email: { type: String, unique: true, default: "" },
    Name: { type: String, default: "" },
    arrayField: [arrayElementSchema], // array of elements with the specified schema
  });
  mainDb.model("TestEntry", testEntrySchema);
}



app.get("/api/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"], // Add required scopes
  });
  res.redirect(authUrl);
});

// This api gets the callback data from the google after Oauth and also registers the user in database

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Use the OAuth2 client to get the user's profile information
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    // At this point, 'data' contains the user's information
    console.log("User Information:", data);

    // Optionally, create a JWT for session and send it to the frontend
    const sessionToken = jwt.sign({ user: data }, jwtSecret);

    const present = await mainDb.models["TestEntry"].findOne({
      // googleId: user.googleId,
      email: data.email,
    });

    if (!present) {
      const TestEntry = mainDb.model("TestEntry");
      const newEntry = new TestEntry({
        email: data.email,
        Name: data.name,
        arrayField: [],
      });
      await newEntry.save();
    }

    res.redirect(`https://mainsite-lyart.vercel.app/?jwt=${sessionToken}`);
    // res.redirect(`http://localhost:3000/?jwt=${sessionToken}`);
  } catch (error) {
    console.error("Error fetching user information:", error.message);
    res.status(500).send("Error fetching user information");
  }
});

// This api saves the mainstest data for a new test of user in the database

app.post("/mainsdata", verifyJWT, async (req, res) => {
  try {
    const data = req.body;
    const { email } = req.user.user;
    console.log(data);
    const TestEntry = await mainDb.models["TestEntry"].findOne({
      email: email,
    });
    const date = new Date();

    const newdata = {
      date: date,
      type: "mains",
      totalMarks: 300,
      marksScored: data.correct,
      sillyError: data.silly,
      revision: data.slight,
      toughness: data.tough,
      theory: data.theory,
    };
    TestEntry.arrayField.push(newdata);
    await TestEntry.save();
    res.status(200).json({ message: "User data saved successfully" });
  } catch (error) {
    console.error("Error saving user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Endpoint to get users by email
app.get("/mainsdata", verifyJWT, async (req, res) => {
  const userEmail = req.user.user.email;
  // const matchingUsers = users.filter(user => user.email === userEmail);
  const matchingUsers = await mainDb.models["TestEntry"].findOne({
    email: userEmail,
  });

  if (matchingUsers.length === 0) {
    return res
      .status(404)
      .json({ message: "No users found with the specified email" });
  }

  res.json(matchingUsers.arrayField);
});



app.post("/advdata", verifyJWT, async (req, res) => {
  try {
    const data = req.body;
    const { email } = req.user.user;
    console.log(data);
    const TestEntry = await mainDb.models["TestEntry"].findOne({
      email: email,
    });
    const date = new Date();

    const newdata = {
      date: date,
      type: "adv",
      totalMarks: 300,
      marksScored: data.correct,
      sillyError: data.silly,
      revision: data.slight,
      toughness: data.tough,
      theory: data.theory,
    };
    TestEntry.arrayField.push(newdata);
    await TestEntry.save();
    res.status(200).json({ message: "User data saved successfully" });
  } catch (error) {
    console.error("Error saving user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});



app.get("/api/protected-data", verifyJWT, (req, res) => {
  // Access user information from req.user
  const { name, email } = req.user.user;
  // console.log(req.user.user);
  console.log("Hit");
  // console.log(name);

  res.json({
    message: "Protected data accessed successfully",
    user: { name, email },
  });
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
