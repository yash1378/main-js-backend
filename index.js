const express = require("express");
const { google } = require("googleapis");
const jwt = require("jsonwebtoken");
const bodyParser = require('body-parser');
const twilio = require('twilio');

const cors = require("cors");
const axios = require("axios");
const { createClient } = require("redis");
require("dotenv").config();
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3001;
// In-memory storage for phone numbers and OTPs (for demo purposes)
const otpStorage = {};


// Connect to Redis server on localhost:8001
const client = createClient({
  url:"redis://redis-18627.c305.ap-south-1-1.ec2.cloud.redislabs.com:18627",
  password: process.env.REDIS_PASSWORD,
});

client.connect().catch(console.error);
client.on("error", (err) => console.log("Redis Client Error", err));

const googleClientId = process.env.GOOGLE_CLIENT_ID;

const googleClientSecret = process.env.GOOGLE_SECRET;
// Twilio credentials (replace with your own)
const accountSid = 'AC07b0f1ba572d368d2bd65ae3a97c3e78';
const authToken = '3b8cb6a7d3b2f26293af314337991518';
const clienttwilio = new twilio(accountSid, authToken);
const jwtSecret = "yash";
const oauth2Client = new google.auth.OAuth2(
  googleClientId,
  googleClientSecret,
    "https://jsmainsitebackend.onrender.com/api/auth/google/callback"
  // "http://localhost:3001/api/auth/google/callback"
);


app.use(cors('*'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: false }));

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

app.get("/api/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"], // Add required scopes
  });
  res.redirect(authUrl);
});

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

    const present = await client.get(data.email);
    var pre = false;

    if (present === null) {
      // If the email is not present in Redis, create a new record
      const userData = {
        Name: "",
        Coaching:"",
        Class:"",
        testScores: [], // Initially, no test scores
      };
      pre=true;

      await client.set(data.email, JSON.stringify(userData));
    }

      res.redirect(`https://mainsite-lyart.vercel.app/?jwt=${sessionToken}&new=${pre}`);
    // res.redirect(`http://localhost:3000/?jwt=${sessionToken}&new=${pre}`);
  } catch (error) {
    console.error("Error fetching user information:", error.message);
    res.status(500).send("Error fetching user information");
  }
});

app.post('/sendOTP', (req, res) => {
  const { name, phone } = req.body;

  // Generate a random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000);
  // Save the OTP in storage
  const otpId = uuidv4();
  otpStorage[otpId] = { phone, otp };

  // Send OTP via Twilio
  clienttwilio.messages
      .create({
          body: `Hello ${name}, your OTP is: ${otp}`,
          from: '+19493475457',
          to: `+91${phone}` // Assuming Indian phone numbers, adjust as needed
      })
      .then(message => {
          console.log(`OTP sent: ${message.sid}`);
          res.send({"otpId":otpId});
      })
      .catch(error => {
          console.error(error.message);
          res.status(500).send('Error sending OTP');
      });
});

// ... (previous code)

app.post('/api/verifyOTP/:otpId', async (req, res) => {
  const otpId = req.params.otpId;
  const enteredOtp = req.body.enteredOtp;

  // Check if the OTP ID exists in storage
  if (otpStorage[otpId]) {
    const storedOtp = otpStorage[otpId].otp;

    // Check if the entered OTP matches the stored OTP
    if (enteredOtp === storedOtp.toString()) {
      // OTP verification successful
      const phone = otpStorage[otpId].phone;
      const present = await client.get(String(phone));
      var pre = false;

      if (present === null) {
        // If the email is not present in Redis, create a new record
        const userData = {
          Name: "",
          Coaching: "",
          Class: "",
          testScores: [], // Initially, no test scores
        };
        pre = true;

        await client.set(String(phone), JSON.stringify(userData));
      }

      // Generate JWT token
      const jwtToken = jwt.sign({ phone }, jwtSecret, { expiresIn: '1h' });

      // Remove the used OTP ID from storage
      delete otpStorage[otpId];

      res.status(200).json({ message: pre, jwtToken });
    } else {
      res.status(400).json({ message: 'Incorrect OTP. Please try again.' });
    }
  } else {
    res.status(404).json({ message: 'Invalid OTP ID' });
  }
});

// ... (rest of the code)



app.post("/mainsdata", verifyJWT, async (req, res) => {
  try {
    const data = req.body;
    const {phone} = req.user;
    console.log(req.user)
    let email;
    if(!phone){
      email = req.user.user.email;
    }
    else{
      email = phone;
    }
    console.log(email)
    // Retrieve user data from Redis
    const userDataStr = await client.get(email);

    if (userDataStr) {
      // Parse the string into an object
      const userData = JSON.parse(userDataStr);

      // Create new data for the mains test
      const newdata = {
        date: data.date,
        type: "mains",
        totalMarks: 300,
        maths: {
          marksScored: data.correctm,
          sillyError: data.sillym,
          revision: data.slightm,
          toughness: data.toughm,
          theory: data.theorym,
        },
        physics: {
          marksScored: data.correctp,
          sillyError: data.sillyp,
          revision: data.slightp,
          toughness: data.toughp,
          theory: data.theoryp,
        },
        chemistry: {
          marksScored: data.correctc,
          sillyError: data.sillyc,
          revision: data.slightc,
          toughness: data.toughc,
          theory: data.theoryc,
        },
      };

      // Push the new data into the testScores array
      userData.testScores.push(newdata);

      // Update the record in Redis
      await client.set(email, JSON.stringify(userData));

      res.status(200).json({ message: "User data saved successfully" });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error("Error saving user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


app.post("/advdata", verifyJWT, async (req, res) => {
  try {
    const data = req.body;
    const {phone} = req.user;
    let email;
    if(!phone){
      email = req.user.user.email;
    }
    else{
      email = phone;
    }
    // Retrieve user data from Redis
    const userDataStr = await client.get(email);

    if (userDataStr) {
      // Parse the string into an object
      const userData = JSON.parse(userDataStr);
      const date = new Date();
      // Create new data for the mains test
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

      // Push the new data into the testScores array
      userData.testScores.push(newdata);

      // Update the record in Redis
      await client.set(email, JSON.stringify(userData));

      res.status(200).json({ message: "User data saved successfully" });
    }
    TestEntry.arrayField.push(newdata);
    await TestEntry.save();
    res.status(200).json({ message: "User data saved successfully" });
  } catch (error) {
    console.error("Error saving user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/mainsdata", verifyJWT, async (req, res) => {
  try {

    const {phone} = req.user;
    let userEmail;
    if(!phone){
      userEmail = req.user.user.email;
    }
    else{
      userEmail = phone;
    }
    // Retrieve user data from Redis
    const userDataStr = await client.get(userEmail);

    if (userDataStr) {
      const userData = JSON.parse(userDataStr);
      res.json(userData);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error("Error retrieving user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/api/submit", verifyJWT, async (req, res) => {
  try {
    const data = req.body;
    // const { user } = req.user;
    const {phone} = req.user;
    let email;
    if(!phone){
      email = req.user.user.email;
    }
    else{
      email = phone;
    }
    // Retrieve user data from Redis
    const userDataStr = await client.get(email);

    if (userDataStr) {
      // Parse the string into an object
      const userData = JSON.parse(userDataStr);

      // Update user data with the submitted information
      userData.Name = data.name;
      userData.Coaching = data.dropdown2Value;
      userData.Class = data.dropdown1Value;

      // Update the record in Redis
      await client.set(email, JSON.stringify(userData));

      res.status(200).json({ message: "User data saved successfully" });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error("Error saving user data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});



// // Define an API endpoint to fetch and save data
// app.get("/fetch", async (req, res) => {
//   try {
//     // Fetch data from a fake API (JSONPlaceholder)
//     const r = await client.get("fakeApiData");
//     console.log(r);
//     if (r !== null) {
//       console.log("from redis");
//       res.json({ success: true, r });
//       //   return;
//     }
//     // res.json({ success: true, r });
//     const { data } = await axios.get(
//       "https://jsonplaceholder.typicode.com/todos/4"
//     );

//     // Save data to Redis
//     client.set("fakeApiData", JSON.stringify(data));

//     res.json({ success: true, data });
//   } catch (error) {
//     console.error("Error fetching and saving data:", error);
//     res.status(500).json({ success: false, error: "Internal Server Error" });
//   }
// });

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
