# AI Assistant — Setup Guide

The app has an **optional** AI helper that drafts certificate/document templates
from a plain-language description (e.g. *"a certificate of indigency for a
hospital bill, with the patient name as an input field"*). It writes the template
using the correct `{{placeholders}}`; the app fills in real resident data later,
offline, exactly as it always has.

**The app works fully without this.** If you never set it up, nothing changes —
there's just no "AI Draft" button in the template editor.

---

## Why this design is safe and works on low-spec laptops

- **No resident data is ever sent.** The AI only receives your description and the
  list of placeholder tokens (like `{{fullName}}`, `{{purok}}`). Names, birthdays,
  and everything else stay on the computer.
- **Low-spec friendly.** With a hosted provider, this computer only sends a small
  request over the internet and waits for the reply — there's **no heavy local
  computation**, so it runs fine on older 4GB laptops with no graphics card.
- **Offline-first stays intact.** Internet is only needed *while drafting a
  template*. Generating finished certificates and every other feature work fully
  offline, as before.

---

## Recommended: Google Gemini (free)

### Step 1 — Get a free API key (one time, ~2 minutes)

1. Go to **https://aistudio.google.com/apikey** and sign in with a Google account.
2. Click **Create API key**.
3. Copy the key (it looks like `AIza...`). Keep it private — treat it like a password.

> The free tier is generous and does not require a credit card. It's more than
> enough for occasional template drafting.

### Step 2 — Turn it on in the app

1. Open the app → **Settings → AI Assistant**.
2. Switch **Enable AI template drafting** to ON.
3. **Provider:** choose **Google Gemini (free tier — recommended)**. This fills in
   the Server URL and Model for you.
4. Paste your key into **API key**.
5. Click **Test connection**. You should see *"Connected — model … responded."*
6. Click **Save**.

### Step 3 — Use it

1. Go to **Templates → New template** (or edit one) to open the editor.
2. Click **✨ AI Draft** in the toolbar.
3. Describe the document, then click **Generate (replaces all)**.
   - Use **Improve current** instead to revise the template that's already there.
4. **Review and edit** the result, then **Save** as usual. The AI writes a first
   draft — always check the wording and placeholders before using it for real
   documents.

---

## Other free providers

All use the same setup — just pick the matching preset on the AI Assistant page
(or choose **Custom** and paste the values). All are OpenAI-compatible.

| Provider | Get a key | Server URL | Example model |
|---|---|---|---|
| **Google Gemini** (recommended) | aistudio.google.com/apikey | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| **Groq** (very fast) | console.groq.com/keys | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| **OpenRouter** (has free models) | openrouter.ai/keys | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct:free` |

If a free model name stops working (providers rotate them), open the provider's
docs, copy a current free model name into the **Model** box, and Save.

---

## Fully offline option (Ollama) — only for capable PCs

If a particular office wants **zero internet** for AI too, install
[Ollama](https://ollama.com) on that computer:

1. Install Ollama, then in a terminal run: `ollama pull llama3.2`
2. In **Settings → AI Assistant**, pick the **Ollama** preset (Server URL
   `http://localhost:11434/v1`, model `llama3.2`), leave the API key blank, Save.

> ⚠️ **Not for low-spec laptops.** A local model needs roughly **8GB+ RAM** and is
> slow without a graphics card. On the typical barangay laptop, use a hosted
> provider above instead.

**Automatic lag protection.** Because a local model can strain a weak laptop, the
app watches each local-AI request for slowness — long response times, the system
stalling, or very low free memory. If it detects the machine is lagging, it
aborts the request and **automatically turns the AI Assistant off** so the app
stops loading the computer. You'll see a notice; the daily certificate work is
never affected. Re-enable it in **Settings → AI Assistant** once the machine is
free, or switch to a hosted provider. (This guard applies only to local
providers — hosted ones like Gemini don't tax the laptop.)

---

## Troubleshooting

| Message | Fix |
|---|---|
| "The AI server rejected the API key" | The key is wrong or expired. Recreate it on the provider's site and paste the new one. |
| "AI free-tier limit reached for now" | You've hit the provider's hourly/daily free quota. Wait a bit, or switch providers. |
| "Could not reach the AI server" | No internet, or the Server URL is wrong. Check the connection; re-pick the provider preset. |
| "The AI request timed out" | Slow internet. Try again; the rest of the app is unaffected. |
| No "AI Draft" button in the editor | The feature is off. Turn it on in **Settings → AI Assistant**. |

The AI is a convenience for drafting. If it's ever unavailable, you can still
write and edit templates by hand exactly as before.
