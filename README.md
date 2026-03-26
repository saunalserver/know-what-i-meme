# Know What I Meme

A real-time, Jackbox-style multiplayer party game where friends compete to find the perfect GIF for ridiculous prompts.

## 🎮 How to Play
1. **Create a Room**: The host creates a game room and shares the unique 4-character room code.
2. **Join the Fun**: Players join from their own devices by entering the room code and selecting a profile.
3. **Vote on Prompts**: Players vote on which ridiculous prompt to use for the round.
4. **GIF Search**: Use the integrated Klipy-powered search to find the perfect GIF that matches the chosen prompt.
5. **Vote for the Best**: Review everyone's submissions anonymously and vote for your favorite meme.
6. **Win the Game**: Accumulate points across multiple rounds to be crowned the ultimate meme master!

## ✨ Key Features
- **Real-time Gameplay**: Powered by Socket.io for instantaneous updates across all devices.
- **Robust Reconnection**: Interrupted sessions? Players can seamlessly rejoin active games without losing their state.
- **Safari Optimized**: Features hardware-accelerated animations and specialized layout fixes for a smooth experience on iOS and macOS devices.
- **Integrated GIF Browser**: Optimized Klipy API integration for fast, relevant GIF searching.
- **Mobile-First Design**: Responsive interface built with React and TailwindCSS, perfect for phone-as-a-controller gameplay.

## 🛠️ Tech Stack
- **Frontend**: React, TailwindCSS, Framer Motion, Lucide React
- **Backend**: Node.js, Express, Socket.io
- **API**: Klipy GIF API
- **Deployment**: Production-ready with support for path-based routing (e.g., `/kwim/`)

## 🚀 Quick Start
1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Configure environment**: Create a `.env` file with your `KLIPY_API_KEY`.
4. **Start development**:
   - Server: `npm run dev:server` (Port 3002)
   - Frontend: `npm run dev` (Port 5173)
5. **Access**: Open `http://localhost:5173` in your browser.

## 🛡️ License
MIT
