const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Groq = require("groq-sdk");
const { connectDB, getDB } = require("./database");
const cookieParser = require("cookie-parser");

dotenv.config();

const { registerAuthRoutes, ensureSessionIndexes, requireAuth } = require("./auth");
const {
  sendVerificationEmail,
  registerVerificationRoutes,
  ensureVerificationIndexes
} = require("./emailVerification");
const {
  registerPasswordResetRoutes,
  ensurePasswordResetIndexes
} = require("./passwordReset");

const app = express();
// Per-chat document and image context
const chatContexts = new Map();
function getChatContext(chatId) {
  if (!chatContexts.has(chatId)) {
    chatContexts.set(chatId, {
      documentText: "",
      documentName: "",
      imageData: "",
      imageMimeType: ""
    });
  }
  return chatContexts.get(chatId);
}
const allowedOrigins = (process.env.CLIENT_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
registerAuthRoutes(app);
registerVerificationRoutes(app);
registerPasswordResetRoutes(app);

// ===============================
// GEMINI AI
// ===============================
const ai = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ===============================
// FILE UPLOAD
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

// ===============================
// TEMP DOCUMENT / IMAGE CONTEXT
// ===============================
let documentText = "";
let documentName = "";

let imageData = "";
let imageMimeType = "";

// ===============================
// ===============================
// USER REGISTRATION
// ===============================
const bcrypt = require("bcryptjs");

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required."
      });
    }
    if (name.length > 80) {
      return res.status(400).json({
        success: false,
        message: "Name must be 80 characters or fewer."
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and no more than 72 bytes."
      });
    }
    const users = getDB().collection("users");
    const existingUser = await users.findOne(
      { email },
      { projection: { _id: 1 } }
    );
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const newUser = {
      name,
      email,
      passwordHash,
      emailVerified: false,
      authProvider: "email",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await users.insertOne(newUser);
    let verificationEmailSent = false;
    try {
      await sendVerificationEmail({
        ...newUser,
        _id: result.insertedId
      });
      verificationEmailSent = true;
    } catch (emailError) {
      console.error("REGISTRATION EMAIL ERROR:", emailError.message);
    }
    return res.status(201).json({
      success: true,
      message: verificationEmailSent
        ? "Account created. Please check your email to verify your account."
        : "Account created, but verification email could not be sent. Please request a new verification email.",
      verificationEmailSent,
      user: {
        id: result.insertedId.toString(),
        name,
        email,
        emailVerified: false
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }
    console.error("Registration error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create account right now."
    });
  }
});
// HEALTH CHECK
// ===============================
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "ARYNEXA AI backend is running",
    ai: "Groq",
  });
});

// ===============================
// DOCUMENT / IMAGE UPLOAD
// ===============================
app.post("/api/upload", requireAuth, upload.single("document"), async (req, res) => {
  try {
    const chatId = String(req.body?.chatId || "").trim();
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: "Chat ID is required for document upload."
      });
    }
    const context = getChatContext(chatId);
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded.",
      });
    }

    const file = req.file;



    // ===========================
    // PDF
    // ===========================
    if (file.mimetype === "application/pdf") {
      const parsed = await pdfParse(file.buffer);

      context.documentText = parsed.text || "";
      context.documentName = file.originalname;

      chatContexts.set(chatId, context);
      return res.json({
        success: true,
        message: `${file.originalname} uploaded successfully.`,
        type: "pdf",
        fileName: file.originalname,
        textLength: context.documentText.length,
      });
    }

    // ===========================
    // DOCX
    // ===========================
    if (
      file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({
        buffer: file.buffer,
      });

      context.documentText = result.value || "";
      context.documentName = file.originalname;

      chatContexts.set(chatId, context);
      return res.json({
        success: true,
        message: `${file.originalname} uploaded successfully.`,
        type: "docx",
        fileName: file.originalname,
        textLength: context.documentText.length,
      });
    }

    // ===========================
    // OLD .DOC
    // ===========================
    if (file.mimetype === "application/msword") {
      return res.status(400).json({
        success: false,
        message:
          "Old .doc files are not supported yet. Please upload .docx or PDF.",
      });
    }

    // ===========================
    // IMAGE
    // ===========================
    if (
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/jpg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/webp"
    ) {
      context.imageData = file.buffer.toString("base64");
      context.imageMimeType = file.mimetype;
      context.documentName = file.originalname;

      chatContexts.set(chatId, context);
      return res.json({
        success: true,
        message: `${file.originalname} uploaded successfully.`,
        type: "image",
        fileName: file.originalname,
      });
    }

    // ===========================
    // UNSUPPORTED
    // ===========================
    return res.status(400).json({
      success: false,
      message:
        "Unsupported file type. Please upload PDF, DOCX, JPG, JPEG, PNG or WEBP.",
    });
  } catch (error) {
    console.error("UPLOAD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "File upload failed.",
    });
  }
});

// ===============================
// CHAT
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, mode, history = [], chatId } = req.body;
    const safeChatId = String(chatId || "").trim();
    if (!safeChatId) {
      return res.status(400).json({
        success: false,
        message: "Chat ID is required."
      });
    }
    const { documentText, documentName, imageData, imageMimeType } =
      getChatContext(safeChatId);
    const safeHistory = Array.isArray(history)
      ? history
          .filter((item) =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string"
          )
          .slice(-12)
          .map((item) => ({
            role: item.role,
            content: item.content.slice(0, 8000)
          }))
      : [];

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    // ===========================
    // SYSTEM INSTRUCTION
    // ===========================
    let instruction = `
You are ARYNEXA AI, a professional personal AI assistant.

Your job is to provide:
- Clear answers
- Accurate explanations
- Helpful examples
- Step-by-step guidance when needed
- Beginner-friendly explanations for programming students
- Professional formatting

The user may use ARYNEXA for:
- General questions
- Programming
- Study
- Coding
- Documents
- Images
- Productivity
- Project development

Always answer naturally and helpfully.
CONVERSATION MEMORY RULES:
- Read the previous conversation messages before answering the latest user message.
- Treat the latest message as a continuation when it refers to earlier code, answers, examples, or explanations.
- If the user says "the code you just generated", "explain this", "continue", or similar, use the relevant previous assistant response from the conversation history.
- Do not ask the user to paste code again if that code is already available in the conversation history.
- For code follow-ups, explain the relevant earlier code, provide requested dry runs, and show output.
- If the required earlier context truly is not present, ask a concise clarification instead of pretending to remember it.
`;

    // ===========================
    // MODES
    // ===========================
    if (mode === "study") {
      instruction += `
You are currently in STUDY MODE.

Explain concepts like a good college teacher.
Use:
- Simple explanations
- Important definitions
- Examples
- Key points
- Exam-oriented information when useful
`;
    }

    if (mode === "coding") {
      instruction += `
You are currently in CODING MODE.

Act like a senior software engineer helping a beginner.

When appropriate:
- Explain the logic first
- Give clean code
- Explain important lines
- Mention common errors
- Suggest improvements
`;
    }

    if (mode === "tasks") {
      instruction += `
You are currently in TASK MODE.

Help the user organize work into practical steps.
Give:
- Task breakdown
- Priorities
- Simple action items
- Clear next steps
`;
    }

    // ===========================
    // DOCUMENT CONTEXT
    // ===========================
    if (documentText && mode !== "study") {
      instruction += `

The user uploaded a document named "${documentName}".

Use the following document content when answering:

---------------- DOCUMENT START ----------------

${documentText}

---------------- DOCUMENT END ----------------

Answer questions about this document using the provided content.
If the answer is not present in the document, clearly say that.
`;
    }


    // GROQ REQUEST
    const userContent = imageData
      ? [
          {
            type: "text",
            text: instruction + "\n\nUser message:\n" + message
          },
          {
            type: "image_url",
            image_url: {
              url: "data:" + imageMimeType + ";base64," + imageData
            }
          }
        ]
      : instruction + "\n\nUser message:\n" + message;
    const completion = await ai.chat.completions.create({
      model: imageData
        ? "qwen/qwen3.8-27b"
        : "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: instruction },
        ...safeHistory,
        {
          role: "user",
          content: imageData
            ? [
                { type: "text", text: message },
                {
                  type: "image_url",
                  image_url: {
                    url: "data:" + imageMimeType + ";base64," + imageData
                  }
                }
              ]
            : message
        }
      ],
      max_tokens: 3000
    });
    const answer = completion.choices?.[0]?.message?.content ||
      "Sorry, ARYNEXA could not generate a response.";
    return res.json({
      success: true,
      answer,
      model: imageData
        ? "qwen/qwen3.8-27b"
        : "openai/gpt-oss-120b"
    });

  } catch (error) {
    console.error("GROQ ERROR DETAILS:", { message: error?.message, status: error?.status, code: error?.code, type: error?.type, stack: error?.stack });

    return res.status(500).json({
      success: false,
      message: error?.message || "Groq request failed.",
      error: error?.status || error?.code || "UNKNOWN_ERROR",
    });
  }
});

// ===============================
// ===============================
// HINGLISH IMAGE PROMPT ENHANCEMENT
app.post("/api/image/enhance-prompt", requireAuth, async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt || prompt.length > 1500) {
      return res.status(400).json({
        success: false,
        message: "Please enter a prompt between 1 and 1500 characters."
      });
    }
    const completion = await ai.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content: `You are ARYNEXA AI's image prompt enhancement assistant.
Convert the user's Hindi, Hinglish, or English idea into one detailed,
clear English prompt for an AI image generation model.
Rules:
- Preserve the user's original idea and intended subject.
- Understand Hindi and Hinglish naturally.
- Improve scene, composition, lighting, environment, camera and visual details.
- Do not add unrelated subjects or change the user's intention.
- Do not claim that exact real-person likeness is guaranteed.
- Return only the final image prompt, without explanations or quotation marks.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 500
    });
    const enhancedPrompt =
      completion.choices?.[0]?.message?.content?.trim();
    if (!enhancedPrompt) {
      throw new Error("AI could not enhance this prompt.");
    }
    return res.json({
      success: true,
      enhancedPrompt,
      model: "openai/gpt-oss-120b"
    });
  } catch (error) {
    console.error("PROMPT ENHANCEMENT ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to enhance prompt right now. Please try again."
    });
  }
});
// CLOUDFLARE IMAGE GENERATION
// ===============================
const IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
async function callCloudflareImage({ prompt, imageFile }) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error("Image generation service is not configured.");
  }
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${IMAGE_MODEL}`;
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", "1024");
  form.append("height", "1024");
  if (imageFile) {
    form.append(
      "input_image_0",
      new Blob([imageFile.buffer], { type: imageFile.mimetype }),
      imageFile.originalname || "input.png"
    );
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`
    },
    body: form
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Cloudflare image API failed:", {
      status: response.status,
      details: errorBody.slice(0, 2000)
    });
    let cloudflareError = {};
    try {
      cloudflareError = JSON.parse(errorBody);
    } catch {
      // Keep the original error response if it is not JSON.
    }
    const isFlagged = cloudflareError.errors?.some(
      (item) => item.code === 3030
    );
    if (isFlagged) {
      throw new Error(
        "This image request was blocked by the AI safety filter. Please try a different prompt or image."
      );
    }
    throw new Error("Image service could not complete the request.");
  }
  if (contentType.includes("application/json")) {
    const data = await response.json();
    const image =
      data?.result?.image ||
      data?.result?.output ||
      data?.image;
    if (!data.success || !image || typeof image !== "string") {
      throw new Error("Image service returned an invalid response.");
    }
    return {
      imageData: image,
      mimeType: "image/png"
    };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("Image service returned an empty image.");
  }
  return {
    imageData: buffer.toString("base64"),
    mimeType: contentType.split(";")[0] || "image/png"
  };
}
// TEXT TO IMAGE
app.post("/api/image/generate", requireAuth, async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt || prompt.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Please enter a prompt between 1 and 2000 characters."
      });
    }
    const result = await callCloudflareImage({ prompt });
    return res.json({
      success: true,
      image: `data:${result.mimeType};base64,${result.imageData}`,
      model: IMAGE_MODEL
    });
  } catch (error) {
    console.error("IMAGE GENERATION ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Image generation failed."
    });
  }
});
// IMAGE TO IMAGE EDITING
app.post(
  "/api/image/edit",
  requireAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      const prompt = String(req.body?.prompt || "").trim();
      if (!prompt || prompt.length > 2000) {
        return res.status(400).json({
          success: false,
          message: "Please enter an editing prompt between 1 and 2000 characters."
        });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please upload an image to edit."
        });
      }
      const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp"
      ];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Only PNG, JPG and WEBP images are supported."
        });
      }
      const result = await callCloudflareImage({
        prompt,
        imageFile: req.file
      });
      return res.json({
        success: true,
        image: `data:${result.mimeType};base64,${result.imageData}`,
        model: IMAGE_MODEL
      });
    } catch (error) {
      console.error("IMAGE EDIT ERROR:", error.message);
      return res.status(500).json({
        success: false,
        message: error.message || "Image editing failed."
      });
    }
  }
);
// ===============================
// ACCOUNT CHAT HISTORY (MongoDB)
// ===============================
app.get("/api/history", requireAuth, async (req, res) => {
  try {
    const record = await getDB().collection("chat_history").findOne({
      userId: req.userId
    });
    res.json({ success: true, chats: record?.chats || [] });
  } catch (error) {
    console.error("CHAT HISTORY LOAD ERROR:", error.message);
    res.status(500).json({ success: false, message: "Could not load chat history." });
  }
});
app.put("/api/history", requireAuth, async (req, res) => {
  try {
    const chats = req.body?.chats;
    if (!Array.isArray(chats) || chats.length > 50) {
      return res.status(400).json({ success: false, message: "Invalid chat history." });
    }
    const safeChats = chats.map(chat => {
      if (
        !chat ||
        typeof chat.id !== "string" ||
        !chat.id.trim() ||
        !Array.isArray(chat.messages) ||
        chat.messages.length > 500
      ) {
        throw new Error("Invalid chat entry.");
      }
      const messages = chat.messages.map(message => {
        if (
          !message ||
          !["user", "assistant"].includes(message.role) ||
          typeof message.text !== "string" ||
          message.text.length > 100000
        ) {
          throw new Error("Invalid chat message.");
        }
        const safeMessage = { role: message.role, text: message.text };
        if (message.image !== undefined) {
          if (
            typeof message.image !== "string" ||
            message.image.length > 1.5 * 1024 * 1024 ||
            !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(message.image)
          ) {
            throw new Error("Invalid or oversized image preview.");
          }
          safeMessage.image = message.image;
        }
        return safeMessage;
      });
      return {
        id: chat.id.slice(0, 150),
        title: typeof chat.title === "string" ? chat.title.slice(0, 200) : "New Chat",
        messages,
        updatedAt: Number.isFinite(Number(chat.updatedAt)) ? Number(chat.updatedAt) : Date.now()
      };
    });
    if (JSON.stringify(safeChats).length > 5 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: "Chat history is too large." });
    }
    if (safeChats.length === 0) {
      await getDB().collection("chat_history").deleteOne({ userId: req.userId });
    } else {
      await getDB().collection("chat_history").updateOne(
        { userId: req.userId },
        { $set: { chats: safeChats, updatedAt: new Date() } },
        { upsert: true }
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error("CHAT HISTORY SAVE ERROR:", error.message);
    res.status(400).json({ success: false, message: "Could not save chat history." });
  }
});
app.delete("/api/history", requireAuth, async (req, res) => {
  try {
    await getDB().collection("chat_history").deleteOne({ userId: req.userId });
    res.json({ success: true });
  } catch (error) {
    console.error("CHAT HISTORY DELETE ERROR:", error.message);
    res.status(500).json({ success: false, message: "Could not clear chat history." });
  }
});// NEW CHAT
// ===============================
app.post("/api/new-chat", (req, res) => {
  const chatId = String(req.body?.chatId || "").trim();
  if (chatId) chatContexts.delete(chatId);
  res.json({
    success: true,
    message: "Chat context cleared."
  });
});// ===============================
// SERVER
// ===============================
const PORT = 5050;
async function startServer() {
  try {
    await connectDB();
    await getDB().collection("chat_history").createIndex({ userId: 1 }, { unique: true, name: "unique_chat_history_user" });
    await ensureSessionIndexes();
    await ensureVerificationIndexes();
    await ensurePasswordResetIndexes();
    app.listen(PORT, () => {
      console.log(`ARYNEXA AI server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("SERVER STARTUP FAILED:", error.message);
    process.exit(1);
  }
}
startServer();





