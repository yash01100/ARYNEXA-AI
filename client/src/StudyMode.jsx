import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
const API = "http://localhost:5050/api";
function StudyMode() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generate = async (type) => {
    if (!topic.trim() || loading) return;
    const prompts = {
      notes: `Create clear, exam-oriented study notes on "${topic.trim()}". Include headings, definitions, examples, key points and a short summary. Explain in beginner-friendly Hinglish.`,
      mcqs: `Create 10 exam-oriented MCQs on "${topic.trim()}". Give four options A, B, C, D for each question, the correct answer and a short explanation.`,
      revision: `Create a quick revision sheet on "${topic.trim()}". Include key concepts, definitions, formulas where applicable, important exam questions and a concise recap. Explain in beginner-friendly Hinglish.`
    };
    setLoading(true);
    setError("");
    setResult("");
    try {
      const response = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: `study-${Date.now()}`,
          message: prompts[type],
          mode: "study"
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`);
      }
      setResult(data.answer || "No answer received. Please try again.");
    } catch (err) {
      setError(err.message || "Backend connection failed.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="study-panel">
      <div className="study-heading">
        <span className="study-icon">📚</span>
        <div>
          <h2>Study Mode</h2>
          <p>Learn smarter with AI-powered study tools.</p>
        </div>
      </div>
      <label className="study-label" htmlFor="study-topic">
        Enter your subject or topic
      </label>
      <input
        id="study-topic"
        className="study-topic-input"
        type="text"
        placeholder="e.g. DBMS, Operating Systems, DSA..."
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") generate("notes");
        }}
      />
      <div className="study-actions">
        <button type="button" disabled={!topic.trim() || loading} onClick={() => generate("notes")}>
          📝 Generate Notes
        </button>
        <button type="button" disabled={!topic.trim() || loading} onClick={() => generate("mcqs")}>
          🎯 Practice MCQs
        </button>
        <button type="button" disabled={!topic.trim() || loading} onClick={() => generate("revision")}>
          ⚡ Quick Revision
        </button>
      </div>
      {loading && <p className="study-loading">Preparing your study material...</p>}
      {error && <p className="study-error">Error: {error}</p>}
      {result && (
        <div className="study-result">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {result}
          </ReactMarkdown>
        </div>
      )}
    </section>
  );
}
export default StudyMode;

