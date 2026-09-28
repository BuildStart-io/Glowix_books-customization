# Backend Live Deployment Guide (Recent Changes Only)

This guide provides simple, step-by-step instructions to deploy only the recent backend changes (`supabase/functions/ai-chat-Glowix_books/index.ts`) to your **Live Production Server**.

---

## 1. Scope of Recent Changes

* **Modified Backend File:** `supabase/functions/ai-chat-Glowix_books/index.ts`
* **Database Migrations:** **Zero (0) Migrations Required.** All required columns (`category`, `stock_quantity`, `description`, `is_preorder`) already exist in the `glowix_books` schema.
* **Environment Variables (`.env`):** **No changes needed.**

---

## 2. Live Server Deployment (2 Simple Steps)

### Step 1: Pull Latest Changes on Live Server
Log in to your Live Server (via SSH), navigate to the project directory, and pull the latest code from `master`:

```bash
cd /path/to/Glowix_books
git pull origin master
```

> **Note:** `docker/volumes/functions` is symlinked to `../../supabase/functions`. Running `git pull` automatically updates the mounted Edge Function files.

---

### Step 2: Restart Edge Functions Container
Restart only the `functions` container so the Deno runtime immediately picks up the updated code and refreshes its cache:

```bash
# Navigate to docker directory
cd docker

# Restart edge functions container only
docker compose restart functions
```

*(Alternatively, you can run the direct docker command):*
```bash
docker restart supabase-edge-functions
```

> ⚠️ **Important:** You do **NOT** need to restart the entire docker stack (`docker compose down/up`) or the database (`supabase-db`). Restarting only the `functions` container takes only 1-2 seconds with zero disruption to the database.

---

### Step 3 (Optional): Check Logs
Verify that the edge function container restarted cleanly and is healthy:

```bash
docker logs --tail 50 -f supabase-edge-functions
```

---

## 3. Alternative: If Using Supabase CLI / Supabase Cloud
If you are deploying using the Supabase CLI instead of self-hosted Docker, simply run:

```bash
supabase functions deploy ai-chat-Glowix_books --no-verify-jwt
```

---

## 4. How to Verify on Live WhatsApp

1. **Category Selection:** Send `"1"` or `"combo"` to your business WhatsApp number.
   * **Expected:** The bot shows Book Combo bundles, itemizes the included books (`Includes: ...`), and asks: *"Which combo set would you like to choose? 😊"*.
2. **Single Selection:** Send `"2"` or `"single"` to browse individual books.
3. **Payment Step:**
   * Reply `"1"` -> The bot confirms Cash on Delivery (COD) and registers the order.
   * Reply `"2"` -> The bot displays Bank Transfer account details.

---

## 5. Frontend Update (Optional Reference)
If you also want to deploy the updated Conversations UI (`frontend/src/pages/Conversations.tsx`):
* **If hosted on Vercel / Netlify:** It deploys automatically upon pushing to the `master` branch.
* **If self-hosted as a static build on your server:**
  ```bash
  cd frontend
  npm run build
  ```
