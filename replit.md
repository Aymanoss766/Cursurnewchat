# Facebook Messenger AI Chatbot

## Overview
A Facebook Messenger chatbot powered by OpenRouter AI models. Supports multiple Facebook Pages (up to 15) simultaneously and WhatsApp integration via device linking. Users message your Facebook Pages or WhatsApp and receive AI-generated responses automatically. The dashboard allows dynamic configuration of AI text models, image generation services, Facebook Page management, and WhatsApp connection.

## Architecture
- **Backend**: Express server with webhook routes for Facebook Messenger + WhatsApp via Baileys
- **Frontend**: React dashboard for bot configuration and monitoring
- **AI**: OpenRouter API (configurable model, default: stepfun/step-3.5-flash:free)
- **Database**: PostgreSQL (Neon-backed) via Drizzle ORM for persistent bot config, pages, users, and sessions
- **Auth**: Simple admin password login with JWT tokens (password: stored in ADMIN_PASSWORD env var)
- **WhatsApp**: Baileys library for WhatsApp Web multi-device connection with pairing code authentication (no QR code), auto-reconnects on server restart

## Key Routes
### Public (no auth required)
- `GET /webhook` - Facebook webhook verification (uses stored verify token)
- `POST /webhook` - Receives and processes incoming messages (routes to correct page token via entry.id)

### Protected (requires authentication)
- `GET /api/status` - Returns configuration status including pagesCount and whatsappConnected
- `GET /api/config` - Returns current bot configuration (masked API keys/tokens)
- `GET /api/pages` - List all connected Facebook Pages (masked tokens)
- `POST /api/pages` - Add a new Facebook Page (validates token with Graph API, max 15)
- `DELETE /api/pages/:id` - Remove a connected Facebook Page
- `POST /api/config/ai` - Update AI text model configuration (API key + model)
- `POST /api/config/image` - Update image generation configuration (API key + URL + model)
- `POST /api/config/verify-token` - Update Verify Token dynamically
- `POST /api/whatsapp/connect` - Start WhatsApp linking (accepts phoneNumber, returns pairing code)
- `POST /api/whatsapp/disconnect` - Disconnect WhatsApp session
- `GET /api/whatsapp/status` - Get current WhatsApp connection status
- `POST /api/whatsapp/verify` - Verify if WhatsApp connection is established

## Dashboard Features
- Login page with admin password form (show/hide toggle, gradient design)
- Admin panel header with logout button
- Configuration status cards (Verify Token, Facebook Pages count, OpenRouter Key, WhatsApp status)
- Webhook URL display with copy button
- Facebook Credentials panel (blue gradient header, multi-page management with add/remove, counter badge X/15, Verify Token config, Live/Secured badges)
- WhatsApp Connection panel (green gradient header, phone number input, pairing code display, verify button, connection status)
- AI Text Model configuration (change OpenRouter API key and model dynamically)
- Image Generation configuration (generic - supports any image API provider)
- Setup guide with step-by-step Facebook integration instructions
- All data persists across page reloads and server restarts via PostgreSQL

## Environment Variables (Secrets)
- `OPENROUTER_API_KEY` - Default OpenRouter API key (can be overridden from dashboard)
- `PAGE_ACCESS_TOKEN` - Default Facebook Page Access Token (auto-added as first page on startup)
- `VERIFY_TOKEN` - Custom verification token for webhook setup
- `ADMIN_PASSWORD` - Admin login password (default: ayman1515)
- `SESSION_SECRET` - Express session secret (used for JWT signing)
- `DATABASE_URL` - PostgreSQL connection string (auto-provisioned)

## Database Tables
- `users` - Admin users (id, email, firstName, lastName, profileImageUrl)
- `sessions` - Express sessions for auth persistence
- `bot_config` - Bot configuration (API keys, model settings, verify token, WhatsApp phone for auto-reconnect)
- `facebook_pages` - Connected Facebook Pages (name, pageId, accessToken)

## Project Structure
- `server/index.ts` - Express app setup with auth wiring
- `server/db.ts` - Drizzle database connection
- `server/routes.ts` - Webhook routes + config/pages/whatsapp endpoints (protected with auth)
- `server/storage.ts` - DatabaseStorage class using PostgreSQL
- `server/whatsapp.ts` - WhatsApp service module (Baileys connection, pairing code, message handling)
- `server/firebaseAuth.ts` - Admin password auth middleware with JWT token creation/verification
- `shared/schema.ts` - Drizzle schemas for bot_config, facebook_pages + re-exports auth models
- `shared/models/auth.ts` - Users and sessions schemas
- `client/src/App.tsx` - App router with auth-aware rendering
- `client/src/pages/landing.tsx` - Login landing page
- `client/src/pages/dashboard.tsx` - Configuration dashboard with user header
- `client/src/hooks/use-auth.ts` - Authentication React hook

## Running
The app runs via `npm run dev` on port 5000 (Replit default). The webhook URL for Facebook is the published app URL + `/webhook`.
