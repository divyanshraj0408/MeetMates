# Pingo 🎥 | College-Exclusive Video Chat  

### Pingo is a college-exclusive platform that allows students to connect via random video calls. By using their college email IDs for authentication, students can interact in a safe and verified environment, fostering new connections within the campus.  
---
## 🚀 Features  

1. **College Email Authentication** – Ensures only students from the college can join.  
2. **Random Video Matching** – Connects users with a random peer for seamless conversations.  
3. **Real-Time Video Streaming** – Powered by **WebRTC** for smooth peer-to-peer communication.  
4. **Secure & Private** – Prevents unauthorized access and ensures data privacy.  
5. **Minimal & Intuitive UI** – A simple, distraction-free interface for easy interaction.  
6. **Abuse Prevention** – Includes **reporting & blocking** features to maintain a positive experience.  
---
## 🧠 How It Works

1. **Authentication**:  
   Users sign in using Google OAuth restricted to college email domains. Their token is validated on the backend (`/api/verify-token`) before connecting to the Socket.IO server.

2. **Matching**:  
   Users can opt for a video or audio-only chat. When they click "Start Chat", a `findChat` event is emitted. The server then pairs them with another waiting user.

3. **Connection Setup**:  
   If video is enabled, Pingo establishes a **WebRTC** peer-to-peer connection between the two users, allowing low-latency video communication. If not, only text-based messaging is enabled.

4. **Chat Session**:  
   Once connected, users can chat freely. Messages are relayed via `sendMessage` and `message` events. The UI handles rendering local/remote streams and chat history.

5. **Next/Leave**:  
   Clicking "Next" or leaving the session triggers a disconnect from the current room. The app resets the state and automatically searches for a new partner.

6. **Safety**:  
   Users can report/exit at any time. The backend supports blocking or moderation enhancements.

---

## 🛠️ Tech Stack  

- **Frontend:** React (Vite)  
- **Backend:** Node.js + Express  
- **Database:** MongoDB (Mongoose ORM)  
- **Real-Time Communication:** WebRTC + Socket.io  
- **Authentication:** Google OAuth (Restricted to College Emails)  

## 🔧 Installation & Setup  

### Clone the Repository  
```bash
git clone https://github.com/your-username/meetmates.git
cd meetmates
```
### Install Dependencies
```
cd frontend
npm install
cd ..
cd backend
npm install
cd ..
```
### Set Environment Variables
Frontend (`frontend/.env`)
```
VITE_BACKEND_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=get client id from google auth
```
Backend (`backend/.env`)
```
MONGODB_URI=mongodburl
JWT_SECRET=jwt
CORS_ORIGIN=http://localhost:5173,https://www.meetmates.space
PORT=3001
```
### 🎯 Future Enhancements

- Interest-Based Matching – Connect students with similar interests.
- Text Chat Feature – Add real-time messaging alongside video calls.
- AI Moderation – Implement AI-based content moderation for safety.
    
### 📜 License

This project is open-source under the MIT License.

### 🔗 Contributions are welcome! Feel free to submit issues or feature requests.
Mates behind MeetMates: [Sagar Kumar Jha](https://github.com/sagar-03) ,[Shivansh Sharma](https://www.linkedin.com/in/shivanssharma/) & Me.
