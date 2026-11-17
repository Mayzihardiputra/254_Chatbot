const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const sendBtn = document.getElementById("send-btn");

// Menyimpan riwayat percakapan untuk dikirim ke backend
let conversationHistory = [];

// Fungsi menambahkan gelembung chat ke layar
function appendMessage(text, isUser = false) {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message");
    msgDiv.classList.add(isUser ? "user-message" : "bot-message");
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgDiv;
}

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = userInput.value.trim();
    if (!text) return;

    // 1. Tampilkan pesan pengguna dan simpan ke riwayat
    appendMessage(text, true);
    conversationHistory.push({ role: "user", content: text });

    // Reset input & nonaktifkan tombol selama proses berlangsung
    userInput.value = "";
    userInput.disabled = true;
    sendBtn.disabled = true;

    // 2. Buat gelembung kosong untuk balasan AI (streaming)
    const botMsgDiv = appendMessage("...", false);
    let fullBotReply = "";
    let isFirstChunk = true;

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: conversationHistory })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 3. Baca stream dari backend
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data: ")) continue;

                const dataStr = trimmed.slice(6).trim();
                if (dataStr === "[DONE]") continue;

                try {
                    const parsed = JSON.parse(dataStr);
                    if (parsed.content) {
                        if (isFirstChunk) {
                            botMsgDiv.textContent = "";
                            isFirstChunk = false;
                        }
                        fullBotReply += parsed.content;
                        botMsgDiv.textContent = fullBotReply;
                        chatBox.scrollTop = chatBox.scrollHeight;
                    }
                } catch (err) {
                    // Abaikan potongan JSON yang belum lengkap atau pesan error string
                    if (typeof dataStr === "string" && dataStr.startsWith('"')) {
                        botMsgDiv.textContent = JSON.parse(dataStr);
                    }
                }
            }
        }

        // Simpan balasan lengkap AI ke riwayat percakapan
        if (fullBotReply) {
            conversationHistory.push({ role: "assistant", content: fullBotReply });
        }

    } catch (error) {
        console.error("Error:", error);
        botMsgDiv.textContent = "Maaf, gagal terhubung ke server.";
    } finally {
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
});