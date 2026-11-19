import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState } from "react";
import "./App.css";
import StudyMode from "./StudyMode";
import CreateImage from "./CreateImage";
import AuthScreen from "./AuthScreen";

const API = "http://localhost:5050/api";

const createChatId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${crypto.randomUUID()}`;

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [isGuest, setIsGuest] = useState(() => sessionStorage.getItem("arynexa_guest_mode") === "true");
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return data.user || null;
      })
      .then((user) => {
        if (active) {
          if (user) sessionStorage.removeItem("arynexa_guest_mode");
          setAuthUser(user);
          setIsGuest(!user && sessionStorage.getItem("arynexa_guest_mode") === "true");
        }
      })
      .catch((error) => {
        console.error("Session check failed:", error);
        if (active) setAuthUser(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const handleGuest = () => {
    sessionStorage.setItem("arynexa_guest_mode", "true");
    setAuthUser(null);
    setIsGuest(true);
    setMessages([]); setMessage(""); setMode("chat"); setDocumentName("");
  };
  const handleLogin = (user) => {
    sessionStorage.removeItem("arynexa_guest_mode");
    setIsGuest(false); setAuthUser(user);
  };
  const handleLogout = async () => {
    if (isGuest) {
      sessionStorage.removeItem("arynexa_guest_mode");
      sessionStorage.removeItem("arynexa_guest_history");
      setIsGuest(false); setHistory([]); setMessages([]); setMessage("");
      setMode("chat"); setDocumentName("");
      return;
    }
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      setAuthUser(null);
    }
  };
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const [mode, setMode] = useState("chat");
  // VOICE ASSISTANT FEATURE
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [voiceRate, setVoiceRate] = useState(() => {
    const savedRate = Number(localStorage.getItem("arynexa_voice_rate"));
    return [0.75, 0.9, 0.92, 1, 1.25, 1.5].includes(savedRate) ? savedRate : 0.92;
  });
  const recognitionRef = useRef(null);

  const [history, setHistory] = useState([]);
  const [historyOwner, setHistoryOwner] = useState(null);
  const activeHistoryOwner = authUser
    ? `account:${authUser.id}`
    : isGuest ? "guest" : null;
  const [currentChatId, setCurrentChatId] = useState(() => createChatId());
  const currentChatIdRef = useRef(currentChatId);
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);
  // Load account history from MongoDB; guest history remains session-only.
  useEffect(() => {
    if (authLoading || !activeHistoryOwner) return;
    let active = true;
    const loadHistory = async () => {
      try {
        let chats = [];
        if (activeHistoryOwner === "guest") {
          const parsed = JSON.parse(
            sessionStorage.getItem("arynexa_guest_history") || "[]"
          );
          chats = Array.isArray(parsed) ? parsed : [];
        } else {
          const response = await fetch(`${API}/history`, {
            credentials: "include"
          });
          if (!response.ok) {
            throw new Error(`History load failed (${response.status})`);
          }
          const data = await response.json();
          chats = Array.isArray(data.chats) ? data.chats : [];
          localStorage.setItem(
            `arynexa_history_${authUser.id}`,
            JSON.stringify(chats)
          );
        }
        if (active) {
          setHistory(chats);
          setHistoryOwner(activeHistoryOwner);
        }
      } catch (error) {
        console.error("History load failed:", error);
        if (active && activeHistoryOwner.startsWith("account:")) {
          const accountId = activeHistoryOwner.slice("account:".length);
          let cached = [];
          try {
            const parsed = JSON.parse(
              localStorage.getItem(`arynexa_history_${accountId}`) || "[]"
            );
            cached = Array.isArray(parsed) ? parsed : [];
          } catch {
            cached = [];
          }
          setHistory(cached);
          setHistoryOwner(activeHistoryOwner);
        }
      }
    };
    loadHistory();
    return () => {
      active = false;
    };
  }, [authLoading, activeHistoryOwner]);
  // Save only after the matching owner has finished loading.
  useEffect(() => {
    if (!activeHistoryOwner || historyOwner !== activeHistoryOwner) return;
    if (activeHistoryOwner === "guest") {
      try {
        sessionStorage.setItem(
          "arynexa_guest_history",
          JSON.stringify(history)
        );
      } catch (error) {
        console.error("Guest history save failed:", error);
      }
      return;
    }
    const accountId = activeHistoryOwner.slice("account:".length);
    try {
      localStorage.setItem(
        `arynexa_history_${accountId}`,
        JSON.stringify(history)
      );
    } catch (error) {
      console.error("Account history cache failed:", error);
    }
    fetch(`${API}/history`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ chats: history })
    }).then(response => {
      if (!response.ok) {
        throw new Error(`History save failed (${response.status})`);
      }
    }).catch(error => {
      console.error("MongoDB history save failed:", error);
    });
  }, [history, historyOwner, activeHistoryOwner]);
  // ================= SAVE CHAT =================

  const saveHistory = (msgs, chatId) => {
    if (!chatId) return;

    const userMessages = msgs.filter(
      (msg) => msg.role === "user"
    );

    if (userMessages.length === 0) return;

    setHistory((previousHistory) => {
      const existingChat = previousHistory.find(
        (chat) => chat.id === chatId
      );

      const firstQuestion =
        existingChat?.title ||
        userMessages[0].text.trim();

      const title =
        firstQuestion.length > 45
          ? firstQuestion.substring(0, 45) + "..."
          : firstQuestion;

      const updatedChat = {
        id: chatId,
        title,
        messages: msgs,
        updatedAt: Date.now()
      };

      const otherChats = previousHistory.filter(
        (chat) => chat.id !== chatId
      );

      const newHistory = [
        updatedChat,
        ...otherChats
      ].slice(0, 50);
      return newHistory;
    });
  };

  // ================= SEND MESSAGE =================
  const sendMessage = async () => {
    if (!message.trim() || loading) return;
    const userMessage = message.trim();
    const updatedMessages = [
      ...messages,
      { role: "user", text: userMessage }
    ];
    setMessages(updatedMessages);
    setMessage("");
    setLoading(true);
    const chatId = currentChatIdRef.current;
    saveHistory(updatedMessages, chatId);
    try {
      const response = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chatId,
          message: userMessage,
          mode: isGuest ? "chat" : mode,
          history: messages
            .filter((msg) =>
              ["user", "assistant"].includes(msg.role) &&
              typeof msg.text === "string" &&
              msg.text.trim()
            )
            .slice(-12)
            .map((msg) => ({
              role: msg.role,
              content: msg.text
            }))
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || `Request failed (${response.status})`);
      }
      const finalMessages = [
        ...updatedMessages,
        { role: "assistant", text: data.answer || "I couldn't generate a response. Please try again." }
      ];
      setMessages(finalMessages);
      saveHistory(finalMessages, chatId);
    } catch (error) {
      console.error("ARYNEXA chat error:", error);
      const errorText = error.name === "TypeError"
        ? "Backend connection failed. Please check that the ARYNEXA server is running."
        : `Sorry, I couldn't complete that request. ${error.message || "Please try again."}`;
      const finalMessages = [
        ...updatedMessages,
        { role: "assistant", text: errorText }
      ];
      setMessages(finalMessages);
      saveHistory(finalMessages, chatId);
    } finally {
      setLoading(false);
    }
  };  // ================= UPLOAD =================

  const uploadDocument = async (file) => {
    if (isGuest) return;
    if (!file) return;
    const formData = new FormData();
    formData.append("document", file);
    formData.append("chatId", currentChatIdRef.current);
    let latestMessages = messages;
    const appendAndSave = (message) => {
      latestMessages = [...latestMessages, message];
      setMessages(latestMessages);
      saveHistory(latestMessages, currentChatIdRef.current);
    };
    appendAndSave({ role: "assistant", text: `Uploading "${file.name}"...` });
    try {
      const response = await fetch(`${API}/upload`, { method: "POST", credentials: "include", body: formData });
      const data = await response.json();
      if (data.success) {
        setDocumentName(data.fileName);
        appendAndSave({
          role: "assistant",
          text: data.type === "image"
            ? `[Image] "${data.fileName}" uploaded successfully. You can now ask ARYNEXA about this image.`
            : `"${data.fileName}" uploaded successfully. You can now ask questions about this document.`
        });
      } else {
        appendAndSave({ role: "assistant", text: data.message || "Upload failed." });
      }
    } catch (error) {
      console.error(error);
      appendAndSave({ role: "assistant", text: "Upload failed." });
    }
  };  // ================= NEW CHAT =================

  const newChat = () => {
    const newId = createChatId();

    currentChatIdRef.current = newId;

    setCurrentChatId(newId);
    setMessages([]);
    setMessage("");
    setDocumentName("");
    setMode("chat");

    fetch(`${API}/new-chat`, {
      method: "POST"
    }).catch(() => {});
  };

  // ================= LOAD CHAT =================

  const loadChat = (chat) => {
    if (!chat) return;

    currentChatIdRef.current = chat.id;

    setCurrentChatId(chat.id);
    setMessages(chat.messages || []);
    setMessage("");
    setMode("chat");
    setDocumentName("");


  };

  // ================= CLEAR HISTORY =================

  const clearHistory = () => {
    if (isGuest) {
      sessionStorage.removeItem("arynexa_guest_history");
    } else if (authUser) {
      localStorage.removeItem(`arynexa_history_${authUser.id}`);
      fetch(`${API}/history`, {
        method: "DELETE",
        credentials: "include"
      }).catch(error => {
        console.error("MongoDB history clear failed:", error);
      });
    }
    setHistory([]);
    const newId = createChatId();
    currentChatIdRef.current = newId;
    setCurrentChatId(newId);
    setMessages([]);
    setMessage("");
    setDocumentName("");
    setMode("chat");
  };
  // ================= MODE =================  // ================= MODE =================

  const selectMode = (selectedMode) => {
    if (isGuest && selectedMode !== "chat") return;
    setMode(selectedMode);

    const modeNames = {
      chat: "General Chat",
      study: "Study Mode",
      coding: "Coding Mode",
      tasks: "Task Mode",
      "create-image": "Create Image"
    };

    setMessages((previous) => [
      ...previous,
      {
        role: "assistant",
        text:
          `${modeNames[selectedMode]} activated. How can I help you?`
      }
    ]);
  };

  // ================= VOICE ASSISTANT FEATURE =================
  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };
  const speakLatestAnswer = () => {
    if (!("speechSynthesis" in window)) {
      setVoiceError("Speech playback is not supported in this browser.");
      return;
    }
    const latestAnswer = [...messages]
      .reverse()
      .find((item) => item.role === "assistant" && item.text);
    if (!latestAnswer) {
      setVoiceError("There is no AI answer to read aloud yet.");
      return;
    }
    const cleanText = String(latestAnswer.text)
      .replace(/```[\s\S]*?```/g, " Code block omitted. ")
      .replace(/[#*_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const hasHindi = /[\u0900-\u097F]/.test(cleanText);
    const hinglishWords = /\b(main|mai|mujhe|mujhko|mera|meri|mere|aap|tum|tera|teri|uska|iska|hum|ham|hain|hai|tha|thi|ho|hoga|hogi|kya|kaise|kaisa|kaisi|kyun|kyunki|nahi|nahin|haan|han|ji|acha|accha|achha|batao|bata|samjhao|samjha|karna|karo|kare|karen|chahiye|matlab|lekin|magar|aur|abhi|aaj|kal|yahan|wahan|kab|kahan|kitna|kitni|kaun|wala|wali|waale|bahut|bohot|thoda|zyada|mera|please)\b/i;
    const language = hasHindi || hinglishWords.test(cleanText) ? "hi-IN" : "en-IN";
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language;
    utterance.rate = voiceRate;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    const setVoiceAndSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const matchingVoices = voices.filter((voice) =>
        voice.lang.toLowerCase().replace("_", "-").startsWith(language.toLowerCase())
      );
      const preferredVoice = matchingVoices.find((voice) =>
        /natural|neural|google|microsoft/i.test(voice.name)
      );
      utterance.voice = preferredVoice || matchingVoices[0] || null;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (event) => {
        setIsSpeaking(false);
        if (event.error === "canceled" || event.error === "interrupted") {
          return;
        }
        console.error("ARYNEXA TTS ERROR:", event.error, event);
        setVoiceError("Voice playback failed: " + (event.error || "unknown error"));
      };
      setVoiceError("");
      window.speechSynthesis.speak(utterance);
    };
    window.speechSynthesis.cancel();
    window.setTimeout(setVoiceAndSpeak, 350);
  };  const toggleVoiceInput = () => {
    setVoiceError("");
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Speech recognition is unavailable. Please use Chrome or type your message.");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = "en-IN";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setMessage(transcript);
      };
      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setVoiceError("Microphone error: " + event.error + ". Check browser permissions.");
        }
      };
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (error) {
      setIsListening(false);
      setVoiceError("Could not start microphone. Check browser permissions.");
    }
  };
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  // ================= UI =================

  if (authLoading) {
    return <div className="auth-loading">Loading ARYNEXA AI...</div>;
  }
  if (!authUser && !isGuest) {
    return <AuthScreen api={API} onLogin={handleLogin} onGuest={handleGuest} />;
  }  return (
    <div className="app">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="logo">
          <div className="logo-icon">
            A
          </div>

          <span>
            ARYNEXA
          </span>
        </div>

        <button
          className="new-chat"
          onClick={newChat}
        >
          + New Chat
        </button>

        <nav>

          <div
            className={`nav-item ${
              mode === "chat" ? "active" : ""
            }`}
            onClick={() =>
              selectMode("chat")
            }
          >
            Chat
          </div>

          {!isGuest && <label className="nav-item">

            Documents

            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              hidden
              onChange={(e) => {
                uploadDocument(
                  e.target.files[0]
                );

                e.target.value = "";
              }}
            />

          </label>}

          {!isGuest && <div
            className={`nav-item ${
              mode === "study" ? "active" : ""
            }`}
            onClick={() =>
              selectMode("study")
            }
          >
            Study
          </div>}

          {!isGuest && <div
            className={`nav-item ${
              mode === "coding" ? "active" : ""
            }`}
            onClick={() =>
              selectMode("coding")
            }
          >
            Coding
          </div>}

          {!isGuest && <div
            className={`nav-item ${
              mode === "tasks" ? "active" : ""
            }`}
            onClick={() =>
              selectMode("tasks")
            }
          >
            Tasks
          </div>}

          {!isGuest && <div
            className={`nav-item ${
              mode === "create-image" ? "active" : ""
            }`}
            onClick={() => selectMode("create-image")}
          >
            Create Image
          </div>}          {!isGuest && <button
            type="button"
            className="nav-item settings-nav-button"
            onClick={() => setShowSettings(true)}
          >
            Settings
          </button>}

        </nav>

        {/* RECENT CHATS */}

        <div className="history-section">

          <div className="history-header">

            <span>
              Recent Chats
            </span>

            {history.length > 0 && (
              <button
                onClick={clearHistory}
              >
                Clear
              </button>
            )}

          </div>

          <div className="history-list">

            {history.length === 0 && (
              <small className="no-history">
                No previous chats
              </small>
            )}

            {history.map((chat) => (

              <button
                key={chat.id}
                className={`history-item ${
                  chat.id === currentChatId
                    ? "active-history"
                    : ""
                }`}
                onClick={() =>
                  loadChat(chat)
                }
              >
                {chat.title.replace(/^\s*\d+[.)]\s*/, "")}
              </button>

            ))}

          </div>

        </div>

        {/* PROFILE */}

        <div className="profile">

          <div className="avatar">
            Y
          </div>

          <div>
            <strong>{isGuest ? "Guest" : (authUser?.name || "Account")}</strong>
            <small>{isGuest ? "Temporary text-chat session" : (authUser?.email || "Personal Account")}</small>
          </div>

        </div>

        <button
          type="button"
          className="auth-logout-button"
          onClick={handleLogout}
        >
          {isGuest ? "Exit Guest" : "Log Out"}
        </button>      </aside>

      {/* MAIN */}

      <main className="main">

        <header className="header">

          <div>

            <h1>
              ARYNEXA AI
            </h1>

            <p>
              Your Intelligent Digital Companion
            </p>

          </div>

          <div className="mode-badge">
            {mode.toUpperCase()}
          </div>

        </header>
        {/* SETTINGS PANEL */}
        {showSettings && (
          <div
            className="settings-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowSettings(false);
            }}
          >
            <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
              <div className="settings-heading">
                <div>
                  <h2 id="settings-title">Settings</h2>
                  <p>Manage your ARYNEXA experience</p>
                </div>
                <button type="button" className="settings-close" onClick={() => setShowSettings(false)}>X</button>
              </div>
              <div className="settings-group">
                <h3>Voice Assistant</h3>
                <p>Choose the speed for AI voice playback.</p>
                <label className="settings-label" htmlFor="voice-speed">Playback speed</label>
                <select
                  id="voice-speed"
                  className="settings-select"
                  value={voiceRate}
                  onChange={(event) => {
                    const rate = Number(event.target.value);
                    setVoiceRate(rate);
                    localStorage.setItem("arynexa_voice_rate", String(rate));
                  }}
                >
                  <option value="0.75">0.75x - Slow</option>
                  <option value="0.9">0.9x - Relaxed</option>
                  <option value="0.92">0.92x - Default</option>
                  <option value="1">1x - Normal</option>
                  <option value="1.25">1.25x - Fast</option>
                  <option value="1.5">1.5x - Faster</option>
                </select>
                <div className="settings-status">
                  <span>Microphone</span>
                  <strong>{isListening ? "Listening" : "Inactive"}</strong>
                </div>
                <div className="settings-status">
                  <span>Voice playback</span>
                  <strong>{isSpeaking ? "Speaking" : "Inactive"}</strong>
                </div>
              </div>
              <div className="settings-group">
                <h3>Chat History</h3>
                <p>You currently have {history.length} saved chat{history.length === 1 ? "" : "s"}.</p>
                <button
                  type="button"
                  className="settings-danger-button"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to permanently clear all saved chat history?")) {
                      clearHistory();
                      setShowSettings(false);
                    }
                  }}
                >
                  Clear all chat history
                </button>
              </div>
              <div className="settings-group settings-about">
                <h3>About ARYNEXA AI</h3>
                <p>Your Intelligent Digital Companion</p>
                <span>Personal AI Assistant</span>
                <span>Chat - Study - Coding - Documents - Voice</span>
              </div>
            </section>
          </div>
        )}
        { /* CHAT AREA */ }

        {!isGuest && mode === "study" && <StudyMode onSave={saveHistory} chatId={currentChatIdRef.current} />}
        {!isGuest && mode === "create-image" && <CreateImage onSave={saveHistory} chatId={currentChatIdRef.current} />}
        <section className="chat-area" style={{ display: mode === "study" || mode === "create-image" ? "none" : undefined }}>

          {messages.length === 0 && (

            <div className="welcome">

              <div className="big-logo">
                A
              </div>

              <h2>
                {isGuest ? "Welcome, Guest!" : `Hello, ${authUser?.name?.trim()?.split(/\s+/)[0] || "there"}!`}
              </h2>

              <p>
                {isGuest ? "Try ARYNEXA with temporary text chat." : "I'm ARYNEXA, your personal AI assistant."}
              </p>

              <div className="suggestions welcome-feature-grid">
                <button className="welcome-feature-card" onClick={() => {
                  setMode("study");
                  setMessage("Explain this topic in simple words");
                }}>
                  <span className="welcome-feature-icon">📚</span>
                  <span className="welcome-feature-content">
                    <strong>Learning</strong>
                    <small>Understand topics, get notes and practice</small>
                  </span>
                </button>
                <button className="welcome-feature-card" onClick={() => {
                  setMode("coding");
                  setMessage("Help me solve this coding problem");
                }}>
                  <span className="welcome-feature-icon">💻</span>
                  <span className="welcome-feature-content">
                    <strong>Coding</strong>
                    <small>Write code, debug errors and solve problems</small>
                  </span>
                </button>
                <button className="welcome-feature-card" onClick={() => {
                  setMessage("Help me write or improve a document");
                }}>
                  <span className="welcome-feature-icon">✍️</span>
                  <span className="welcome-feature-content">
                    <strong>Writing & Documents</strong>
                    <small>Draft, improve or summarize content</small>
                  </span>
                </button>
                <button className="welcome-feature-card" onClick={() => {
                  setMode("create-image");
                }}>
                  <span className="welcome-feature-icon">🎨</span>
                  <span className="welcome-feature-content">
                    <strong>Image Creation</strong>
                    <small>Create images from your ideas</small>
                  </span>
                </button>
              </div>

            </div>

          )}

          <div className="messages">

            {messages.map(
              (msg, index) => (

                <div
                  key={index}
                  className={`message ${
                    msg.role
                  }`}
                >

                  <div className="message-avatar">

                    {msg.role === "user"
                      ? "Y"
                      : "A"}

                  </div>

                  <div className="message-content">

                    <strong>

                      {msg.role === "user"
                        ? "You"
                        : "ARYNEXA"}

                    </strong>

                    {msg.role === "user" ? (
                      <p>{msg.text || ""}</p>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.text || ""}
                      </ReactMarkdown>
                    )}
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Saved AI generated image"
                        style={{ maxWidth: "100%", borderRadius: "12px", marginTop: "12px" }}
                      />
                    )}

                  </div>

                </div>

              )
            )}

            {loading && (

              <div className="message assistant">

                <div className="message-avatar">
                  A
                </div>

                <div className="message-content">

                  <strong>
                    ARYNEXA
                  </strong>

                  <p>
                    Thinking...
                  </p>

                </div>

              </div>

            )}

          </div>

        </section>

        {/* INPUT */}

        <div className="bottom-area" style={{ display: mode === "study" || mode === "create-image" ? "none" : undefined }}>

          {documentName && (

            <div className="document-status">
              [Image] {documentName}
            </div>

          )}

          <div className="input-box">

            {!isGuest && <label className="upload-button">

              &#128206;

              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                hidden
                onChange={(e) => {

                  uploadDocument(
                    e.target.files[0]
                  );

                  e.target.value = "";

                }}
              />

            </label>}

            <input
              type="text"
              placeholder="Ask ARYNEXA anything..."
              value={message}
              onChange={(e) =>
                setMessage(
                  e.target.value
                )
              }
              onKeyDown={(e) => {

                if (e.key === "Enter") {
                  sendMessage();
                }

              }}
            />

            {!isGuest && <>
            <button
              type="button"
              className={`voice-button${isListening ? " voice-active" : ""}`}
              onClick={toggleVoiceInput}
              title={isListening ? "Stop listening" : "Speak your message"}
              aria-label={isListening ? "Stop listening" : "Speak your message"}
            >
              {isListening ? "Stop" : "Mic"}
            </button>
            <button
              type="button"
              className={`voice-button${isSpeaking ? " voice-active" : ""}`}
              onClick={isSpeaking ? stopSpeaking : speakLatestAnswer}
              title={isSpeaking ? "Stop speaking" : "Listen to latest AI answer"}
              aria-label={isSpeaking ? "Stop speaking" : "Listen to latest AI answer"}
            >
              {isSpeaking ? "Stop" : "Listen"}
            </button></>}
            <button
              className="send-button"
              onClick={sendMessage}
              disabled={loading}
            >
              Send
            </button>

          </div>

          {/* VOICE STATUS UI */}
          {!isGuest && (isListening || isSpeaking || voiceError) && (
            <p
              className={`voice-status${voiceError ? " voice-error" : ""}`}
              role={voiceError ? "alert" : "status"}
              aria-live="polite"
            >
              {voiceError || (isListening ? "Listening... Speak now." : "Speaking...")}
            </p>
          )}
          <p className="footer-text">
            ARYNEXA AI can make mistakes. Verify important information.
          </p>

        </div>

      </main>

    </div>
  );
}

export default App;

































