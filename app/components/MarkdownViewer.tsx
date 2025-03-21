"use client";

import { useState, useEffect } from "react";
import React from "react";
import axios from "axios";
import { FaSpinner } from "react-icons/fa";
import { useCallback } from "react";
import ReactMarkdown from "react-markdown"; // Importing react-markdown
import remarkGfm from "remark-gfm"; 
import remarkBreaks from 'remark-breaks';

interface MarkdownViewerProps {
  pdfUrl: string | null;
}

interface Risk {
  clause: string;
  risky_text: string;
  reason: string;
}

const RiskItem: React.FC<{ risk: Risk }> = ({ risk }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 border-b border-gray-700 pb-2">
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <h3 className="text-lg font-semibold">📌 {risk.clause}</h3>
        <button className="text-sm text-blue-400 focus:outline-none">
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 text-sm">
          <p>
            <strong>🔍 Risky Text:</strong> {risk.risky_text}
          </p>
          <p className="mt-1">
            <strong>⚠️ Reason:</strong> {risk.reason}
          </p>
        </div>
      )}
    </div>
  );
};

// const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ pdfUrl }) => {
const MarkdownViewer: React.FC<MarkdownViewerProps> = React.memo(({ pdfUrl }) => {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiResponse, setAiResponse] = useState("The potential risky clauses are listed below:\n\n");

  const downloadFileAndExtractText = useCallback(async (fileUrl: string) => {
    try {
      let filename = fileUrl.split("/stream/")[1];
      filename = filename.replace(/^uploads\/uploads\//, "uploads/");
  
      console.log("📂 Using filename for text extraction:", filename);
  
      // Step 1: Download file from your own backend
      const fileResponse = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/download/${filename}`,
        { responseType: "blob" }
      );
  
      const fileBlob = fileResponse.data;
      const file = new File([fileBlob], filename);
  
      // Step 2: Upload it to the backend for extraction
      const formData = new FormData();
      formData.append("file", file);

      const extractResponse = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/extract_text/`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
  
      const extractedText = extractResponse.data.extracted_text;
      console.log("📝 Extracted text from backend:", extractedText.substring(0, 500));
      return extractedText;
    } catch (error) {
      console.error("❌ Error extracting text from backend:", error);
      setError("❌ Error extracting text from backend.");
      return "";
    }
  }, []);


  const analyzeTextWithAI = useCallback(async (text: string) => {
    setLoading(true);
    setError("");
    setRisks([]);
    setAiResponse("");
  
    const MAX_RETRIES = 3;
    let accumulatedResponse = "";
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🤖 AI Analysis Attempt ${attempt}...`);
  
        // Make a request to the backend API instead of OpenAI API
        const response = await fetch("/api/mou-analyzer", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            promptText: text, // Send the text to the API
          }),
        });
  
        if (!response.body) throw new Error("No stream body received");
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        // Reading and processing the stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break; // When the stream is done, stop reading

          // Decode the chunk and append it to the accumulated response
          const chunk = decoder.decode(value, { stream: true });

          // Directly append the chunk (which is plain text) to the accumulated response
          accumulatedResponse += chunk
          console.log("Received chunk:", chunk);
          console.log(accumulatedResponse);
          setAiResponse(accumulatedResponse); // Update the UI with the new content
      }

        break;

      } catch (error) {
        console.error(`❌ Error on attempt ${attempt}:`, error);
        if (attempt === MAX_RETRIES) {
          setError("❌ Gagal menganalisis dokumen: Tidak ada respons dari AI setelah beberapa kali percobaan.");
          setLoading(false);
          return;
        }
      }
    }

    console.log(accumulatedResponse);

    if (!accumulatedResponse) {
      setError("❌ Gagal menganalisis dokumen: Tidak ada respons yang valid dari AI.");
      setLoading(false);
      return;
    }

    // 🔹 Parse AI Response into Risks
    const riskMatches = accumulatedResponse.matchAll(/\*\*Klausul\s+([\w\s().,]+):\*\*\s*['\"]?(.*)['\"]?\s*\.?\s*\*\*Alasan:\*\*\s*['\"]?(.*)['\"]?(?:\n|$)/g);
    const extractedRisks: Risk[] = Array.from(riskMatches, (match: RegExpMatchArray) => ({
      clause: cleanText(`Klausul ${match[1]}`),
      risky_text: cleanText(match[2]),
      reason: cleanText(match[3]),
    }));

    console.log("⚠️ Extracted Risks:", extractedRisks);

    setRisks(extractedRisks.length ? extractedRisks : [{
      clause: "N/A",
      risky_text: "Tidak ditemukan klausul berisiko",
      reason: "Dokumen tampak aman"
    }]);

    setLoading(false);
  }, []);
    
  const processDocument = useCallback(async () => {
      setLoading(true);
      setError("");
      try {
        if (!pdfUrl) {
          setLoading(false);
          return;
        }
        const extractedText = await downloadFileAndExtractText(pdfUrl);
        if (extractedText) await analyzeTextWithAI(extractedText);
      } catch (err) {
        console.error("❌ Error processing document:", err);
        setError("Error processing document.");
      } finally {
        setLoading(false);
      }
    }, [pdfUrl, downloadFileAndExtractText, analyzeTextWithAI]);

  const cleanText = (text: string) => {
    return text.replace(/\*\*/g, "").trim();
  };
  // Debounced useEffect
  useEffect(() => {
    if (!pdfUrl) return;

    console.log("📢 Loading PDF...");
    const timeoutId = setTimeout(() => {
      processDocument();
    }, 300); // Prevents multiple executions

    return () => clearTimeout(timeoutId); // Cleanup to prevent multiple runs
  }, [pdfUrl, processDocument]);

  return (
    <div className="grid grid-cols-2 gap-4 h-screen">
      <div className="bg-[#1A1A1A] text-white p-4 rounded-md overflow-y-auto">
        {loading && <FaSpinner data-testid="spinner" className="text-4xl animate-spin" />}
        {error && <p>{error}</p>}
        {!loading && !error && risks.length === 0 && <p>No risks found.</p>}
        {!loading && risks.map((risk, index) => <RiskItem key={index} risk={risk} />)}
      </div>
      <div className="bg-gray-800 text-white p-4 rounded-md overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">AI Response:</h3>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            p: (props) => <p className="text-sm" {...props} />,
          }}          
          >
          {aiResponse || "Waiting for AI response..."}
        </ReactMarkdown>
      </div>
    </div>
  );
});

MarkdownViewer.displayName = "MarkdownViewer";
export default MarkdownViewer;
