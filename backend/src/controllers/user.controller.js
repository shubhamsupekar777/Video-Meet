import httpStatus from "http-status";
import { User } from "../models/user.model.js";
import bcrypt, { hash } from "bcrypt"

import crypto from "crypto"
import { Meeting } from "../models/meeting.model.js";
const login = async (req, res) => {

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Please Provide" })
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User Not Found" })
        }


        let isPasswordCorrect = await bcrypt.compare(password, user.password)

        if (isPasswordCorrect) {
            let token = crypto.randomBytes(20).toString("hex");

            user.token = token;
            await user.save();
            return res.status(httpStatus.OK).json({ token: token })
        } else {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid Username or password" })
        }

    } catch (e) {
        return res.status(500).json({ message: `Something went wrong ${e}` })
    }
}


const register = async (req, res) => {
    const { name, username, password } = req.body;


    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(httpStatus.FOUND).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name,
            username: username,
            password: hashedPassword
        });

        await newUser.save();

        res.status(httpStatus.CREATED).json({ message: "User Registered" })

    } catch (e) {
        res.json({ message: `Something went wrong ${e}` })
    }

}


// user.controller.js
const getUserHistory = async (req, res) => {
    try {
        const token = req.query.token; // GET param
        if (!token) return res.status(400).json({ message: "Token is required" });

        const user = await User.findOne({ token });
        if (!user) return res.status(404).json({ message: "User not found" });

        const meetings = await Meeting.find({ user_id: user.username }).sort({ date: -1 }); // optional: latest first

        res.status(200).json({ history: meetings }); // always return key 'history'
    } catch (e) {
        res.status(500).json({ message: `Something went wrong: ${e}` });
    }
};
const addToHistory = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: "Authorization header missing" });

        const token = authHeader.split(" ")[1]; // Bearer <token>
        if (!token) return res.status(401).json({ message: "Token missing" });

        const user = await User.findOne({ token });
        if (!user) return res.status(404).json({ message: "User not found" });

        const { meeting_code } = req.body;
        if (!meeting_code) return res.status(400).json({ message: "Meeting code required" });

        console.log("Saving meeting for:", user.username, "code:", meeting_code); // ✅ debug log

        const newMeeting = new Meeting({
            user_id: user.username,
            meetingCode: meeting_code
        });

        await newMeeting.save();

        res.status(201).json({ message: "Added code to history" });
    } catch (e) {
        res.status(500).json({ message: `Something went wrong: ${e}` });
    }
};




export { login, register, getUserHistory, addToHistory }