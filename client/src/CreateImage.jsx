import { useEffect, useState } from "react";
import "./CreateImage.css";
const API = "http://localhost:5050/api";
function CreateImage() {
  const [mode, setMode] = useState("generate");
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setFilePreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setFilePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [file]);
  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      event.target.value = "";
      return;
    }
    if (selectedFile.size > 15 * 1024 * 1024) {
      setError("Image size must be less than 15 MB.");
      event.target.value = "";
      return;
    }
    setFile(selectedFile);
    setError("");
    setGeneratedImage("");
  };
  const enhancePrompt = async () => {
    if (!prompt.trim()) {
      setError("Pehle apna image idea likho.");
      return;
    }
    setEnhancing(true);
    setError("");
    try {
      const response = await fetch(`${API}/image/enhance-prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: prompt.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.enhancedPrompt) {
        throw new Error(data.message || "Unable to enhance prompt.");
      }
      setPrompt(data.enhancedPrompt);
    } catch (err) {
      setError(err.message || "Unable to enhance your prompt right now.");
    } finally {
      setEnhancing(false);
    }
  };  const generateImage = async () => {
    if (!prompt.trim()) {
      setError("Please describe the image you want to create.");
      return;
    }
    if (mode === "edit" && !file) {
      setError("Please upload an image that you want to edit.");
      return;
    }
    setLoading(true);
    setError("");
    setGeneratedImage("");
    try {
      let response;
      if (mode === "generate") {
        response = await fetch(`${API}/image/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ prompt: prompt.trim() })
        });
      } else {
        const formData = new FormData();
        formData.append("prompt", prompt.trim());
        formData.append("image", file);
        response = await fetch(`${API}/image/edit`, {
          method: "POST",
          body: formData
        });
      }
      const data = await response.json();
      if (!response.ok || !data.success || !data.image) {
        throw new Error(
          data.message ||
          data.detail ||
          data.error ||
          "Image generation failed. Please try again."
        );
      }
      setGeneratedImage(data.image);
    } catch (err) {
      setError(
        err.message ||
        "Unable to connect to ARYNEXA AI image service."
      );
    } finally {
      setLoading(false);
    }
  };
  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setGeneratedImage("");
  };
  return (
    <section className="create-image-page">
      <div className="create-image-heading">
        <div className="create-image-icon">AI</div>
        <div>
          <h2>Create Image</h2>
          <p>Turn your imagination into images with ARYNEXA AI.</p>
        </div>
      </div>
      <div className="image-mode-tabs">
        <button
          className={mode === "generate" ? "selected" : ""}
          onClick={() => switchMode("generate")}
          type="button"
        >
          Text to Image Text to Image
        </button>
        <button
          className={mode === "edit" ? "selected" : ""}
          onClick={() => switchMode("edit")}
          type="button"
        >
          Edit Image Edit Image
        </button>
      </div>
      <div className="image-workspace">
        <div className="image-controls">
          <label className="image-field-label" htmlFor="image-prompt">
            {mode === "generate" ? "Describe your image" : "How should we edit it?"}
          </label>
          <textarea
            id="image-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              mode === "generate"
                ? "Example: A beautiful futuristic city at sunset, cinematic lighting, ultra detailed..."
                : "Example: Change the background to a beautiful mountain landscape..."
            }
            rows={5}
            disabled={loading}
          />
          <button
            className="enhance-prompt-button"
            onClick={enhancePrompt}
            disabled={loading || enhancing || !prompt.trim()}
            type="button"
          >
            {enhancing ? "Enhancing prompt..." : "✨ Enhance Prompt"}
          </button>          {mode === "edit" && (
            <div className="image-upload-area">
              <label htmlFor="source-image">
                <span className="upload-symbol">+</span>
                <strong>Upload an image</strong>
                <span>PNG, JPG, WEBP | Maximum 15 MB</span>
              </label>
              <input
                id="source-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                disabled={loading}
              />
              {filePreview && (
                <div className="source-image-preview">
                  <img src={filePreview} alt="Selected image preview" />
                  <div>
                    <span>{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      disabled={loading}
                    >
                      Remove image
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {error && (
            <p className="image-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="generate-image-button"
            onClick={generateImage}
            disabled={loading || enhancing || !prompt.trim() || (mode === "edit" && !file)}
            type="button"
          >
            {loading
              ? "Creating your image..."
              : mode === "generate"
                ? "AI Generate Image"
                : "AI Edit Image"}
          </button>
          <p className="image-model-note">
            Powered by Cloudflare FLUX 2 Klein | AI-generated images
          </p>
        </div>
        <div className="image-result-area">
          <div className="image-result-header">
            <h3>Image Preview</h3>
            {generatedImage && <span>Ready</span>}
          </div>
          {loading ? (
            <div className="image-empty-state">
              <div className="image-loader"></div>
              <h3>Creating your image</h3>
              <p>This may take a little time. Please wait...</p>
            </div>
          ) : generatedImage ? (
            <div className="generated-image-container">
              <img
                src={generatedImage}
                alt="AI generated result"
              />
              <a
                className="download-image-button"
                href={generatedImage}
                download="arynexa-generated-image.png"
              >
                Download Image
              </a>
            </div>
          ) : (
            <div className="image-empty-state">
              <div className="empty-image-icon">AI</div>
              <h3>Your creation will appear here</h3>
              <p>
                {mode === "generate"
                  ? "Enter a prompt and generate your first AI image."
                  : "Upload an image and describe the changes you want."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
export default CreateImage;



