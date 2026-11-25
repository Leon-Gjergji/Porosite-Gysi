# 🍛 Porositë e ditës (Te Gysi)

A small web app for the group's daily food order from Te Gysi. Everyone has their own account and enters their own order, and the app builds:

- the text for the restaurant (e.g. `Dopjo me 4 3x`)
- how much each person pays, plus the total
- a weekly and monthly leaderboard: who ate the most qebapa
- a history of past days

## Accounts and permissions

- Each person creates an account with their own username and password. To create one they need the **group code** (`GROUP_PASSWORD` in Vercel), so strangers can't sign up.
- Everyone can see all orders, but can only save or delete **their own** order.
- **Admins** can change or delete anyone's order, add orders for friends without an account, set a new password for someone, make other users admin and delete accounts.
- Admins are set with `ADMIN_USERNAMES` in Vercel (comma-separated, e.g. `Leon,Atida`). Admins can also make other users admin from the *Llogaria* page.
- Old orders were saved under a name. If someone signs up with the **same name** they used before, those orders (and their qebapa) count as theirs.

**Stack:** plain HTML/CSS/JS (no build step), Vercel serverless functions in `/api` and Upstash Redis (free) as the database.

## Files

```
index.html      page layout
style.css       design
app.js          everything that happens in the browser
menu.js            MENU + PRICES + text formatting (used by browser and API)
api/auth.js        sign up, log in, log out, change password
api/orders.js      read / save / delete orders for a day (own order only, admins all)
api/leaderboard.js weekly / monthly qebap leaderboard
api/users.js       admin: list users, new password, make admin, delete
api/history.js     list of past days
api/_db.js         database, passwords (scrypt), sessions
```

To change a price or add an item, edit `menu.js`.

## Deploy (about 5 minutes)

1. **GitHub:** create a new repository and upload all these files (keep the `api` folder).
2. **Vercel:** go to *Add New → Project*, import the repo, leave the settings as they are (Framework: *Other*) and click *Deploy*.
3. **Database:** in the Vercel project, open the **Storage** tab, then *Create Database*, then **Upstash for Redis** (Free plan), then *Connect* to this project.
   This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
4. **Settings:** go to *Settings → Environment Variables* and add
   - `GROUP_PASSWORD` = the group code your friends need to create an account
   - `ADMIN_USERNAMES` = your username (and other admins), comma-separated
5. **Redeploy:** go to the *Deployments* tab, open the ⋯ menu on the latest one and click *Redeploy*. The new variables only take effect after a redeploy.

Then send the link and the group code to the group chat. Everyone creates their own account.

## Run locally (optional)

```bash
npm install
npm i -g vercel
vercel link            # connect to your Vercel project
vercel env pull .env.local
vercel dev
```

Without database variables, `vercel dev` stores orders in memory. That's only for testing, and the orders are lost when you stop it.
