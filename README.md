# 🤖 BotHost

Simple self-hosted bot hosting panel. Upload a `.js` (Node) or `.py` (Python) bot, set env vars, then Start / Stop / Restart and watch live logs.

## Features
- Upload bot files from the browser
- Start / stop / restart
- Env vars per bot (e.g. `TOKEN`)
- Live logs
- Mobile-friendly UI, works on Termux

## Setup
```bash
git clone https://github.com/<your-username>/bothost.git
cd bothost
npm install
PORT=3000 npm start
```
Open `http://localhost:3000`. No login by default. To enable one, start with `ADMIN_PASSWORD=yourpassword`.

### Termux
```bash
pkg install nodejs python git
```
then run the same steps above.

## Security notes
- No password by default. **If the site is reachable from the internet, set `ADMIN_PASSWORD`**, otherwise anyone can upload and run code on your machine.
- Bots run as child processes with a minimal env, but are **not sandboxed**. Only host code you trust.
- For public / multi-user hosting, add Docker isolation, user accounts and HTTPS.

## License
MIT

## Running 24/7
GitHub only stores the code. To keep it online you need a host that runs 24/7:

- **VPS** (Oracle Free Tier, Hetzner, DigitalOcean, etc.):
  ```bash
  git clone https://github.com/<your-username>/bothost.git && cd bothost
  npm install && npm install -g pm2
  pm2 start server.js --name bothost
  pm2 save && pm2 startup
  ```
- **Docker / Railway / Fly.io / Render**: use the included `Dockerfile`. **Mount a persistent volume at `/app/bots`**, otherwise uploaded bots are wiped on every redeploy.
- **Termux**: only runs while the phone and Termux stay alive (`termux-wake-lock`). Not truly 24/7.

Bots auto-restart if they crash, and any bot that was running comes back automatically after the server restarts.
