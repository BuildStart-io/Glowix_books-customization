# Backend Live Deployment Guide (சமீபத்திய மாற்றங்கள் மட்டும்)

இந்த வழிகாட்டி இப்போது செய்யப்பட்ட Backend மாற்றங்களை (`supabase/functions/ai-chat-Glowix_books/index.ts`) உங்களது **Live Server (Production)**-க்கு கொண்டு செல்வதற்கான மிக எளிய வழிமுறைகளை விளக்குகிறது.

---

## 1. என்ன மாற்றங்கள் செய்யப்பட்டன? (Scope)

* **மாற்றப்பட்ட கோப்பு:** `supabase/functions/ai-chat-Glowix_books/index.ts`
* **Database மாற்றங்கள்:** **எதுவும் இல்லை (Zero DB Migrations).** தேவையான அனைத்து columns (`category`, `stock_quantity`, `description`, `is_preorder`) ஏற்கனவே `glowix_books` schema-வில் உள்ளன.
* **Environment Variables (`.env`) மாற்றங்கள்:** **எதுவும் இல்லை.**

---

## 2. Live Server-இல் செய்ய வேண்டிய 2 எளிய படிகள்

### படி 1: Live Server-இல் Git Pull செய்யவும்
உங்களது Live Server (VPS/Cloud)-இல் SSH மூலம் லாகின் செய்து, திட்டத்தின் கோப்பகத்திற்குள் சென்று சமீபத்திய மாற்றங்களை இழுக்கவும்:

```bash
cd /path/to/Glowix_books
git pull origin master
```

> **குறிப்பு:** `docker/volumes/functions` கோப்பகம் ஏற்கனவே `supabase/functions`-க்கு symlink செய்யப்பட்டுள்ளதால், `git pull` செய்தவுடன் மாற்றங்கள் தானாகவே Edge Function-க்கு கிடைத்துவிடும்.

---

### படி 2: Edge Functions Docker Container-ஐ Restart செய்யவும்
புதிய TypeScript குறியீட்டை Deno ரன்டைம் உடனடியாக இயக்கி cache-ஐ புதுப்பிக்க, functions container-ஐ மட்டும் restart செய்யவும்:

```bash
# docker கோப்பகத்திற்குள் செல்லவும்
cd docker

# Edge functions-ஐ மட்டும் restart செய்யவும்
docker compose restart functions
```

*(அல்லது நேரடி container restart கட்டளையைப் பயன்படுத்தலாம்):*
```bash
docker restart supabase-edge-functions
```

> ⚠️ **முக்கியம்:** முழு docker-ஐயோ (`docker compose down/up`), Database (`supabase-db`)-ஐயோ restart செய்யத் தேவையில்லை. `functions` container-ஐ மட்டும் restart செய்தால் போதும் (Down time: 1 முதல் 2 வினாடிகள் மட்டுமே).

---

### படி 3 (விரும்பினால்): Logs-ஐ சரிபார்க்கவும்
Edge functions சரியாக restart ஆகி இயங்குகிறதா என்பதைப் பார்க்க:

```bash
docker logs --tail 50 -f supabase-edge-functions
```

---

## 3. (மாற்று வழி) நீங்கள் Supabase Cloud / CLI பயன்படுத்தினால்:
ஒருவேளை நீங்கள் Self-hosted Docker-க்கு பதிலாக Supabase Cloud அல்லது Supabase CLI வழியாக deploy செய்கிறீர்கள் என்றால், இந்தக் கட்டளையை மட்டும் இயக்கவும்:

```bash
supabase functions deploy ai-chat-Glowix_books --no-verify-jwt
```

---

## 4. Live-இல் சோதனை செய்யும் முறை (Verification):

1. உங்கள் பிசினஸ் WhatsApp எண்ணிற்கு `"1"` அல்லது `"combo"` என்று அனுப்பவும்.
   * **எதிர்பார்க்கப்படும் முடிவு:** காம்போ ஆஃபர்கள் வரும். ஒவ்வொன்றிலும் உள்ள புத்தகங்களின் பட்டியல் (Includes: ...) அழகாகக் காட்டப்பட்டு, *"Which combo set would you like to choose? 😊"* என்று கேட்கும்.
2. அதேபோல `"2"` அல்லது `"single"` அனுப்பினால் தனித்தனி புத்தகங்கள் வரும்.
3. ஆர்டரின் இறுதி கட்டத்தில்:
   * `"1"` அனுப்பினால் உடனே Cash on Delivery (COD) உறுதி செய்யப்பட்டு ஆர்டர் பதிவு செய்யப்படும்.
   * `"2"` அனுப்பினால் Bank Transfer விவரங்கள் காட்டப்படும்.

---

## 5. Frontend Update (கூடுதல் தகவல்):
நீங்கள் Frontend-ஐயும் Live-க்கு கொண்டு செல்ல விரும்பினால்:
* **Vercel / Netlify-இல் host செய்யப்பட்டிருந்தால்:** GitHub-ல் `master` branch-ல் push செய்த உடனேயே தானாகவே live ஆகியிருக்கும்.
* **Server-இல் static build செய்யப்பட்டிருந்தால்:**
  ```bash
  cd frontend
  npm run build
  ```
