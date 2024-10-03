const express = require('express');
const app = express();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
const port = 4000;

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Mongoose connect successfully"))
    .catch((err) => console.log("Mongoose cannot connect", err));
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});
const User = mongoose.model("User", userSchema);
const messageSchema = new mongoose.Schema({
    senderId: { type: String, required: true },
    receiverId: { type: String, required: true },
    text: { type: String, required: true },
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

app.post('/user/signup', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(409).send("User already exists");
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();
        res.status(201).send("User created successfully");
    } catch (err) {
        res.status(500).send("Server internal error: " + err.message);
    }
});


app.get('/user/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const user = await User.findById(id).select('-password');
        if (!user) return res.status(404).send("User not found");
        res.status(200).json(user);
    } catch (err) {
        res.status(500).send("Server internal error: " + err.message);
    }
});

app.get('/alluser', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json(users);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error while fetching users");
    }
});

app.post('/user/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).send("All fields are required");
    }
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        res.status(200).json({ message: "User logged in successfully", userId: user._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error, please try again later" });
    }
});


app.post('/user/accept-friend-request', async (req, res) => {
    const { userId, senderId } = req.body;
    try {
        const user = await User.findById(userId);
        const sender = await User.findById(senderId);
        if (!user || !sender) return res.status(404).send("User not found");
        user.friendRequests = user.friendRequests.filter(id => id.toString() !== senderId);
        if (!user.friends) user.friends = [];
        if (!sender.friends) sender.friends = [];
        user.friends.push(senderId);
        sender.friends.push(userId);
        await user.save();
        await sender.save();
        res.status(200).send("Friend request accepted");
    } catch (err) {
        res.status(500).send("Server internal error: " + err.message);
    }
});

app.get('/user/:id/friend-requests', async (req, res) => {
    const { id } = req.params;
    try {
        const user = await User.findById(id).populate('friendRequests', 'name email');
        if (!user) return res.status(404).send("User not found");
        res.status(200).json(user.friendRequests);
    } catch (err) {
        res.status(500).send("Server internal error: " + err.message);
    }
});

app.post('/user/send-friend-request', async (req, res) => {
    const { senderId, receiverId } = req.body;
    if (!senderId || !receiverId) {
        return res.status(400).json({ message: 'Sender ID and Receiver ID are required.' });
    }
    try {
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ message: 'Receiver not found.' });
        }
        if (receiver.friendRequests.includes(senderId)) {
            return res.status(400).json({ message: 'Friend request already sent.' });
        }
        receiver.friendRequests.push(senderId);
        await receiver.save();
        return res.status(200).json({ message: 'Friend request sent successfully!' });
    } catch (err) {
        console.error('Error sending friend request:', err);
        return res.status(500).json({ message: 'Server error. Please try again.' });
    }
});

app.get('/chat/:currentUserId/:friendId', async (req, res) => {
    const { currentUserId, friendId } = req.params;
    try {
        const messages = await Message.find({
            $or: [
                { senderId: currentUserId, receiverId: friendId },
                { senderId: friendId, receiverId: currentUserId },
            ],
        }).sort({ createdAt: 1 });
        res.status(200).json(messages);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

app.post('/chat/send', async (req, res) => {
    const { senderId, receiverId, message } = req.body;
    const newMessage = new Message({
        senderId,
        receiverId,
        text: message,
    });
    try {
        await newMessage.save();
        res.status(201).json(newMessage);
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: 'Error sending message' });
    }
});

const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: "Something went wrong!" });
};
app.use(errorHandler);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
248