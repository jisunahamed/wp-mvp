"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, RefreshCw, Send, Smartphone, Key, LogIn } from "lucide-react";

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState<"register" | "connect" | "send">("register");

    // Auth State
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [userId, setUserId] = useState("");

    // Session State
    const [sessionName, setSessionName] = useState("");
    const [sessionId, setSessionId] = useState("");
    const [qrCode, setQrCode] = useState("");
    const [connectionStatus, setConnectionStatus] = useState("disconnected");

    // Message State
    const [phoneNumber, setPhoneNumber] = useState("");
    const [messageText, setMessageText] = useState("");

    // UI State
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    // Load saved credentials
    useEffect(() => {
        const savedKey = localStorage.getItem("wp_api_key");
        const savedUser = localStorage.getItem("wp_user_id");
        if (savedKey) {
            setApiKey(savedKey);
            setActiveTab("connect");
        }
        if (savedUser) setUserId(savedUser);
    }, []);

    // Register User
    const handleRegister = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();

            if (res.ok) {
                setApiKey(data.api_key);
                setUserId(data.user.id);
                localStorage.setItem("wp_api_key", data.api_key);
                localStorage.setItem("wp_user_id", data.user.id);
                addLog("Registration successful! API Key saved.");
                setActiveTab("connect");
            } else {
                addLog(`Error: ${data.error}`);
            }
        } catch (err) {
            addLog("Failed to register.");
        }
        setLoading(false);
    };

    // Create Session
    const handleCreateSession = async () => {
        if (!apiKey) return addLog("Please register or login first.");
        setLoading(true);
        try {
            const res = await fetch("/api/sessions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({ session_name: sessionName || "default" }),
            });
            const data = await res.json();

            if (res.ok) {
                setSessionId(data.session_id);
                setConnectionStatus("created");
                addLog(`Session created: ${data.session_id}`);
                // Start polling for QR
                pollQrCode(data.session_id);
            } else {
                addLog(`Error: ${data.error}`);
            }
        } catch (err) {
            addLog("Failed to create session.");
        }
        setLoading(false);
    };

    // Poll QR Code
    const pollQrCode = async (sid: string) => {
        let attempts = 0;
        const interval = setInterval(async () => {
            if (attempts > 20) {
                clearInterval(interval);
                addLog("Stopped polling QR (timeout).");
                return;
            }

            try {
                const res = await fetch(`/api/sessions/${sid}/qr`, {
                    headers: { "Authorization": `Bearer ${apiKey}` }
                });
                const data = await res.json();

                if (res.ok) {
                    if (data.qr) {
                        setQrCode(data.qr);
                        setConnectionStatus("qr_ready");
                    }
                    if (data.status === "connected") {
                        setConnectionStatus("connected");
                        setQrCode("");
                        addLog("WhatsApp Connected Successfully!");
                        clearInterval(interval);
                        setActiveTab("send");
                    }
                }
            } catch (e) {
                console.error(e);
            }
            attempts++;
        }, 3000);
    };

    // Send Message
    const handleSendMessage = async () => {
        if (!sessionId) return addLog("No active session selected.");
        setLoading(true);
        try {
            const res = await fetch("/api/messages/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    to: phoneNumber,
                    text: messageText
                }),
            });
            const data = await res.json();
            if (res.ok) {
                addLog(`Message sent to ${phoneNumber}`);
                setMessageText("");
            } else {
                addLog(`Send Error: ${data.error}`);
            }
        } catch (err) {
            addLog("Failed to send message.");
        }
        setLoading(false);
    };

    return (
        <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            {/* Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/50">
                <button
                    onClick={() => setActiveTab("register")}
                    className={`flex-1 p-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "register" ? "text-green-400 border-b-2 border-green-500 bg-green-500/10" : "text-slate-400 hover:text-slate-200"
                        }`}
                >
                    <LogIn size={16} /> Register / Login
                </button>
                <button
                    onClick={() => setActiveTab("connect")}
                    className={`flex-1 p-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "connect" ? "text-green-400 border-b-2 border-green-500 bg-green-500/10" : "text-slate-400 hover:text-slate-200"
                        }`}
                >
                    <Smartphone size={16} /> Connect WhatsApp
                </button>
                <button
                    onClick={() => setActiveTab("send")}
                    className={`flex-1 p-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === "send" ? "text-green-400 border-b-2 border-green-500 bg-green-500/10" : "text-slate-400 hover:text-slate-200"
                        }`}
                >
                    <Send size={16} /> Send Message
                </button>
            </div>

            {/* Content */}
            <div className="p-6 min-h-[400px]">

                {/* Register Tab */}
                {activeTab === "register" && (
                    <div className="space-y-4 max-w-md mx-auto mt-8">
                        <h2 className="text-xl font-bold text-white mb-6">Get your API Key</h2>
                        <div className="space-y-2">
                            <label className="text-sm text-slate-400">Email</label>
                            <input
                                className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-green-500 outline-none"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="user@example.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-slate-400">Password</label>
                            <input
                                type="password"
                                className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white focus:ring-2 focus:ring-green-500 outline-none"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            onClick={handleRegister}
                            disabled={loading}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded transition disabled:opacity-50"
                        >
                            {loading ? "Registering..." : "Create Account"}
                        </button>

                        {apiKey && (
                            <div className="mt-6 p-4 bg-green-900/20 border border-green-800 rounded-lg">
                                <p className="text-green-400 text-sm font-mono break-all mb-2">API Key: {apiKey}</p>
                                <p className="text-slate-500 text-xs text-center">Auto-saved to browser.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Connect Tab */}
                {activeTab === "connect" && (
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h2 className="text-xl font-bold text-white">1. Create Session</h2>
                            <input
                                className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white"
                                placeholder="Session Name (e.g. My Phone)"
                                value={sessionName}
                                onChange={e => setSessionName(e.target.value)}
                            />
                            <button
                                onClick={handleCreateSession}
                                disabled={loading || !apiKey}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded transition disabled:opacity-50"
                            >
                                {loading ? "Creating..." : "Start Session"}
                            </button>
                            {!apiKey && <p className="text-red-400 text-sm">⚠️ Please register first.</p>}
                        </div>

                        <div className="flex flex-col items-center justify-center bg-white/5 rounded-lg p-8">
                            {connectionStatus === "created" && <p className="text-yellow-400 animate-pulse">Initializing...</p>}

                            {qrCode ? (
                                <div className="bg-white p-4 rounded-lg">
                                    <QRCodeSVG value={qrCode} size={200} />
                                </div>
                            ) : connectionStatus === "connected" ? (
                                <div className="text-center text-green-400">
                                    <Check size={48} className="mx-auto mb-2" />
                                    <p className="font-bold">Connected!</p>
                                </div>
                            ) : (
                                <div className="text-slate-600 text-center">
                                    <Smartphone size={48} className="mx-auto mb-2 opacity-50" />
                                    <p>QR Code will appear here</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Send Tab */}
                {activeTab === "send" && (
                    <div className="space-y-4 max-w-md mx-auto mt-4">
                        <h2 className="text-xl font-bold text-white mb-6">Send Test Message</h2>

                        {!sessionId && (
                            <div className="p-3 bg-yellow-900/20 border border-yellow-800 text-yellow-200 text-sm rounded">
                                ⚠️ No active session found. Please connect in the previous tab first.
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm text-slate-400">Phone Number</label>
                            <input
                                className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white"
                                placeholder="1234567890"
                                value={phoneNumber}
                                onChange={e => setPhoneNumber(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-slate-400">Message</label>
                            <textarea
                                className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white h-24"
                                placeholder="Hello from API!"
                                value={messageText}
                                onChange={e => setMessageText(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={handleSendMessage}
                            disabled={loading || !sessionId}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded transition disabled:opacity-50"
                        >
                            {loading ? "Sending..." : "Send Message"}
                        </button>
                    </div>
                )}

            </div>

            {/* Logs Window */}
            <div className="bg-black/50 p-4 border-t border-slate-800 h-32 overflow-y-auto font-mono text-xs text-slate-400">
                {logs.length === 0 && <p className="opacity-50">System logs will appear here...</p>}
                {logs.map((log, i) => (
                    <p key={i} className="border-b border-white/5 pb-1 mb-1 last:border-0">{log}</p>
                ))}
            </div>
        </div>
    );
}
