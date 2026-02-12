import Image from "next/image";
import Link from "next/link";
import Dashboard from "./components/Dashboard";

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 md:p-24 bg-slate-950 text-white selection:bg-green-500/30">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          WhatsApp API SaaS &nbsp;
          <span className="font-bold text-green-400">v1.0.0</span>
        </p>
        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          <a
            className="flex place-items-center gap-2 p-8 lg:p-0 hover:text-green-400 transition"
            href="https://jisun.online"
            target="_blank"
            rel="noopener noreferrer"
          >
            By{' '}
            <span className="font-bold">Jisun Ahamed</span>
          </a>
        </div>
      </div>

      <div className="relative flex place-items-center py-20 before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-to-br before:from-transparent before:to-green-700 before:opacity-10 before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-to-t after:from-green-900 after:via-green-900 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-green-700 before:dark:opacity-10 after:dark:from-green-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">
        <div className="text-center px-4">
          <h1 className="text-5xl font-bold tracking-tighter sm:text-7xl bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-600">
            WhatsApp API
          </h1>
          <p className="mt-4 text-xl text-slate-400 max-w-2xl mx-auto">
            Serverless WhatsApp API for Developers. <br />
            <span className="text-sm font-mono text-slate-600">No UI required. Pure JSON.</span>
          </p>

          <div className="mt-10 flex gap-4 justify-center">
            <a
              href="#docs"
              className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 transition font-semibold"
            >
              Get Started
            </a>
            <div className="px-6 py-3 rounded-lg border border-slate-700 bg-slate-900/50 text-slate-300">
              Status: <span className="text-green-500 font-bold">● Online</span>
            </div>
          </div>
        </div>
      </div>

      <div id="dashboard" className="w-full flex justify-center mb-24 scroll-mt-24">
        <Dashboard />
      </div>

      <div id="docs" className="mb-32 grid text-left lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-1 gap-12 scroll-mt-20">

        {/* Step 1: Register */}
        <section className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-green-800/50">
          <h2 className="mb-3 text-2xl font-semibold flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-sm">1</span>
            Register User
          </h2>
          <p className="text-slate-400 mb-4">
            Create a new user account to get your generic <code className="text-green-400">api_key</code>.
            Save this key!
          </p>
          <div className="bg-black/50 rounded-lg p-4 font-mono text-xs md:text-sm overflow-x-auto border border-slate-800 relative group/code">
            <p className="text-slate-500 mb-2"># POST /api/auth/register</p>
            <pre className="text-blue-300">
              {`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'YOUR_DOMAIN'}/api/auth/register \\
-H "Content-Type: application/json" \\
-d '{"email": "user@example.com", "password": "secureUser123"}'`}
            </pre>
          </div>
        </section>

        {/* Step 2: Create Session */}
        <section className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-green-800/50">
          <h2 className="mb-3 text-2xl font-semibold flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-sm">2</span>
            Create Session
          </h2>
          <p className="text-slate-400 mb-4">
            Initialize a WhatsApp session. This will return a <code className="text-green-400">session_id</code>.
          </p>
          <div className="bg-black/50 rounded-lg p-4 font-mono text-xs md:text-sm overflow-x-auto border border-slate-800">
            <p className="text-slate-500 mb-2"># POST /api/sessions</p>
            <pre className="text-blue-300">
              {`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'YOUR_DOMAIN'}/api/sessions \\
-H "Authorization: Bearer YOUR_API_KEY" \\
-H "Content-Type: application/json" \\
-d '{"session_name": "my-whatsapp-1"}'`}
            </pre>
          </div>
        </section>

        {/* Step 3: Scan QR */}
        <section className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-green-800/50">
          <h2 className="mb-3 text-2xl font-semibold flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-sm">3</span>
            Scan QR Code
          </h2>
          <p className="text-slate-400 mb-4">
            Get the QR code to scan with your WhatsApp mobile app. Poll this endpoint every few seconds.
          </p>
          <div className="bg-black/50 rounded-lg p-4 font-mono text-xs md:text-sm overflow-x-auto border border-slate-800">
            <p className="text-slate-500 mb-2"># GET /api/sessions/:id/qr</p>
            <pre className="text-blue-300">
              {`curl -X GET ${typeof window !== 'undefined' ? window.location.origin : 'YOUR_DOMAIN'}/api/sessions/SESSION_ID_HERE/qr \\
-H "Authorization: Bearer YOUR_API_KEY"`}
            </pre>
          </div>
        </section>

        {/* Step 4: Send Message */}
        <section className="group rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-green-800/50">
          <h2 className="mb-3 text-2xl font-semibold flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-sm">4</span>
            Send Message
          </h2>
          <p className="text-slate-400 mb-4">
            Once connected, send a text message to any number.
          </p>
          <div className="bg-black/50 rounded-lg p-4 font-mono text-xs md:text-sm overflow-x-auto border border-slate-800">
            <p className="text-slate-500 mb-2"># POST /api/messages/send</p>
            <pre className="text-blue-300">
              {`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'YOUR_DOMAIN'}/api/messages/send \\
-H "Authorization: Bearer YOUR_API_KEY" \\
-H "Content-Type: application/json" \\
-d '{
  "session_id": "SESSION_ID_HERE",
  "to": "1234567890",
  "text": "Hello from API!"
}'`}
            </pre>
          </div>
        </section>

      </div>
    </main>
  );
}
