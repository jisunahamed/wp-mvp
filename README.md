# WhatsApp API SaaS (MVP)

A serverless WhatsApp API designed for n8n workflows, powered by `@whiskeysockets/baileys`, Supabase, and Vercel.

## 🚀 Features

- **Serverless**: Runs on Vercel (stateless architecture).
- **Multi-tenant**: Supports multiple users and sessions.
- **REST API**: Simple endpoints for sending messages and managing sessions.
- **Webhooks**: Real-time incoming message notifications.
- **n8n Ready**: Optimized for workflow automation.

## 🛠️ Setup Guide

### 1. Prerequisites

- **Node.js 20+**
- **Supabase Account**: Create a project and get URL/Keys.
- **Vercel Account**: For deployment.

### 2. Environment Variables

Create a `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Database Migration

Run the SQL query in `supabase/migrations/001_initial_schema.sql` in your Supabase SQL Editor to create tables.

### 4. Deploy to Vercel

```bash
vercel deploy --prod
```

Make sure to add the environment variables in Vercel Project Settings.

---

## 📚 API Documentation

### Authentication

All requests (except options/registration) require the header:
`Authorization: Bearer <your_api_key>`

### Endpoints

#### 1. Register User

- **POST** `/api/auth/register`
- **Body**: `{ "email": "user@example.com", "password": "password" }`
- **Response**: Returns `api_key`. **Save this immediately.**

#### 2. Create Session

- **POST** `/api/sessions`
- **Body**: `{ "session_name": "my-whatsapp" }`
- **Response**: `{ "session_id": "uuid", "status": "pending" }`

#### 3. Connect (QR Code)

- **POST** `/api/sessions/:id/qr` (Polling recommended)
- **Response**: Returns base64 QR code. Scan with WhatsApp app.

#### 4. Send Message

- **POST** `/api/messages/send`
- **Body**:

  ```json
  {
    "session_id": "uuid",
    "to": "1234567890",
    "text": "Hello form API!"
  }
  ```

#### 5. Configure Webhook

- **PATCH** `/api/sessions/:id/webhook`
- **Body**: `{ "webhook_url": "https://n8n.your-domain.com/webhook/..." }`

---

## 🧩 n8n Integration Guide

### How to Receive Messages in n8n

1. **Create a "Webhook" Node** in n8n.
   - Method: `POST`
   - Path: `whatsapp-incoming`
   - Copy the **Test URL**.

2. **Register the Webhook** in this API.
   - Use the `PATCH /api/sessions/:id/webhook` endpoint.
   - Paste the n8n URL.

3. **Activate** the n8n workflow.

### Sample Payload

```json
{
  "event": "message.received",
  "session_id": "uuid",
  "message": {
    "id": "MsgID...",
    "from": "1234567890",
    "type": "text",
    "text": "Hello world"
  }
}
```

### How to Send Messages from n8n

1. **Use "HTTP Request" Node**.
2. **Method**: `POST`
3. **URL**: `https://your-api.vercel.app/api/messages/send`
4. **Header Auth**: `Authorization: Bearer sk_...`
5. **Body**:

   ```json
   {
     "session_id": "{{$json.session_id}}",
     "to": "{{$json.phone_number}}",
     "text": "Automated reply"
   }
   ```

## ⚠️ Limitations & Risks

- **Unofficial API**: Use a dedicated phone number to avoid bans on your main account.
- **Latency**: First message after idle time may take 3-5s to warm up.
- **Rate Limits**: Default 500 messages/day.
