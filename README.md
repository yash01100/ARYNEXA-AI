# ARYNEXA AI

**An AI-Powered Personal Assistant for Chatting, Learning, Document Assistance, and Image Creation.**

ARYNEXA AI is a full-stack AI assistant built using React, Node.js, Express, and MongoDB. It brings conversational AI, study assistance, document uploads, image generation, and user account management into one application.

## Features

- **AI Chat:** Interact with the AI assistant through a conversational interface.
- **User Authentication:** Register, log in, view the current account, and log out.
- **Forgot Password:** Request a password reset and reset the account password.
- **Persistent Chat History:** Save conversations to MongoDB and retrieve them after refreshing or logging in again.
- **Image Generation:** Generate images from text prompts.
- **Prompt Enhancement:** Improve image prompts before generation.
- **Study Mode:**
  - Exam-oriented study notes
  - 10 practice MCQs with answers and explanations
  - Quick revision sheets
- **Document Upload:** Upload documents for AI-assisted workflows.
- **Guest Access:** Explore supported application features without a permanent account.

## Technology Stack

### Frontend
- React 19
- Vite 8
- React Markdown
- Remark GFM
- CSS

### Backend
- Node.js
- Express 5
- MongoDB Node.js Driver
- JWT
- bcryptjs
- Multer
- Cookie Parser
- Express Rate Limit

### AI and External Services

The backend includes integrations for:

- Google GenAI
- Groq
- OpenAI
- Cloudflare
- Hugging Face
- Resend email service

Availability of individual integrations depends on their configuration and valid API credentials.

### Database
- MongoDB Atlas
- Persistent user and chat-history data

## Project Structure

```text
ARYNEXA-AI/
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── AuthScreen.jsx
│   │   ├── AuthScreen.css
│   │   ├── CreateImage.jsx
│   │   ├── CreateImage.css
│   │   └── StudyMode.jsx
│   └── package.json
│
├── server/
│   ├── auth.js
│   ├── database.js
│   ├── passwordReset.js
│   ├── server.js
│   └── package.json
│
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB Atlas account or a MongoDB connection string
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/yash01100/ARYNEXA-AI.git
cd ARYNEXA-AI
```

### 2. Install Frontend Dependencies

```bash
cd client
npm install
```

### 3. Install Backend Dependencies

Open another terminal:

```bash
cd server
npm install
```

### 4. Configure Environment Variables

Create a `.env` file inside the `server` directory.

Configure the variables required by the services you enable:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection |
| `NODE_ENV` | Application environment |
| `CLIENT_URL` | Frontend origin |
| `CLIENT_ORIGINS` | Allowed frontend origins |
| `API_BASE_URL` | Backend API base URL |
| `COOKIE_SAME_SITE` | Session cookie policy |
| `GEMINI_API_KEY` | Google Gemini integration |
| `GOOGLE_AI_API_KEY` | Google AI integration |
| `GROQ_API_KEY` | Groq integration |
| `HF_TOKEN` | Hugging Face integration |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API access |
| `RESEND_API_KEY` | Email service |
| `RESEND_FROM_EMAIL` | Sender email address |

Use only the variables required by your selected integrations. Never commit real API keys, database credentials, tokens, or passwords.

### 5. Start the Backend

```bash
cd server
npm start
```

The backend runs on:

```text
http://localhost:5050
```

### 6. Start the Frontend

In another terminal:

```bash
cd client
npm run dev
```

Open the local frontend URL printed by Vite in your terminal.

## API Overview

The following routes are confirmed in the current backend source.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register an account |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Log out |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| GET | `/api/health` | Health check |
| POST | `/api/chat` | AI chat |
| POST | `/api/upload` | Document upload |
| POST | `/api/image/enhance-prompt` | Enhance image prompt |
| POST | `/api/image/generate` | Generate an image |
| GET | `/api/history` | Retrieve chat history |
| PUT | `/api/history` | Save chat history |
| DELETE | `/api/history` | Clear chat history |
| POST | `/api/new-chat` | Start a new chat |

Some endpoints require authentication.

## Security

- Password hashing with bcryptjs
- JWT-based authentication
- Session cookies
- Rate limiting on sensitive authentication routes
- Environment-based secret configuration
- Git ignore rules for environment files and local backups

## Current Project Status

The project has been developed and tested locally. The frontend production build and backend syntax checks have passed. Authentication, chat-history persistence, image generation, and Study Mode have been tested locally.

**Note:** A successful local test does not guarantee production deployment readiness. Live deployment and production configuration must be verified separately.

## Future Improvements

- Production deployment and monitoring
- Improved mobile responsiveness
- More robust error handling
- Expanded AI-assisted workflows
- Automated backend and frontend tests
- Improved documentation and API examples

## Author

**Yash Raj**

B.Tech – Computer Science and Engineering

GitHub: [yash01100](https://github.com/yash01100)

---

*ARYNEXA AI — One Assistant for Conversation, Creativity, and Learning.*




