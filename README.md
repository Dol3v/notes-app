# Encrypted Notes

End-to-end encrypted, markdown, Hebrew/RTL-first notes PWA for desktop and Android.
Sync = a private GitHub repo that only ever sees ciphertext.

## Security model

```
password ─Argon2id(64 MiB, 3 passes, random salt)─► KEK   (memory only)
KEK ─AES-GCM unwrap─► DEK (random 256-bit, non-extractable, memory only)
DEK ─AES-256-GCM─► each note (notes/<random-uuid>.enc) and device settings
```

- Stored on disk / GitHub: `vault.json` (salt, KDF params, the DEK *encrypted* under the KEK) and
  ciphertext files with random names. **No password, hash, verifier or key** is stored anywhere —
  a wrong password is detected only because decryption of the wrapped key fails.
- Titles, contents, timestamps and the GitHub token are all inside ciphertext.
- Locking (button, inactivity, or background timer) reloads the page, which discards all keys and
  decrypted text from memory.
- Strict Content-Security-Policy: the app can only talk to itself and `api.github.com`.
- No password recovery, by design.

What it cannot protect against: malware on an unlocked device, a malicious update served from the
host you deploy the app to (you control it — it's your own GitHub Pages), the Android keyboard's
own word learning (use Gboard incognito if that matters), and the browser offering to "save
password" (choose *Never* for this site). GitHub can see *when* you sync and roughly how big notes are.

## Setup

### 1. Host the app (GitHub Pages)

1. Create a repo for the **app code** (e.g. `notes-app`, can be public — it contains no data) and push this folder.
2. Repo → Settings → Pages → Source: **GitHub Actions**. The included workflow tests, builds and deploys on every push to `main`.
3. Open `https://<you>.github.io/notes-app/`.

Local: `npm install`, `npm run dev` (development) or `npm run build && npm run preview`.

### 2. Create the data repo + token

1. Create a **private, empty** repo for the data (e.g. `notes-data`).
2. Create a fine-grained token at <https://github.com/settings/personal-access-tokens/new>:
   - Repository access → *Only select repositories* → `notes-data`
   - Permissions → Repository → **Contents: Read and write**
   - Pick an expiry you're comfortable with; when it expires, paste a new one in Settings.

### 3. First device

Open the app → *Create a new vault* → Settings → Sync → enter `you/notes-data`, branch `main`, token → *Connect*.

### 4. Other devices (Android)

Open the app URL in Chrome → menu → **Add to Home screen / Install app** → *Connect to my existing vault*
→ same repo + token → enter your password.

## Sync behaviour

Git-style three-way merge per file: syncs on unlock, ~30 s after you stop typing, when the app goes
to the background, when you come back to it, and via the sync badge. If the same note was edited on
both devices between syncs, both versions are kept (one is marked *conflict copy*). Full history is
in the data repo's git log.

## Export

Settings → Export: an AES-256 zip with its own password, built entirely in memory (no plaintext temp
files). It contains `notes.zip` → one `.md` per note; the nesting hides note titles, which a normal
encrypted zip would leave readable. Open with 7-Zip/WinRAR (Windows) or ZArchiver (Android) —
Windows Explorer's built-in zip support can't open AES zips.

## Development

- `npm test` — crypto, at-rest leak checks, two-device sync against a fake GitHub (conflicts, races,
  password change), markdown/RTL, export.
- `npm run icons` — regenerate PNG icons.
- Code: `src/lib` (crypto, vault, sync, export), `src/editor` (CodeMirror + per-line RTL), `src/ui`.
