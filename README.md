# 🍛 Porositë e ditës

A small web app for the group's daily food order. Everyone enters their own order, and the app builds:

- the text for the restaurant (e.g. `Dopjo me 4 3x`)
- how much each person pays, plus the total
- a history of past days

**Stack:** plain HTML/CSS/JS (no build step), Vercel serverless functions in `/api` and Upstash Redis (free) as the database.

## Files

```
index.html      page layout
style.css       design
app.js          everything that happens in the browser
menu.js         MENU + PRICES + text formatting (used by browser and API)
api/orders.js   read / save / delete orders for a day
api/history.js  list of past days
api/_db.js      database + group password check
```

To change a price or add an item, edit `menu.js`.

## Deploy (about 5 minutes)

1. **GitHub:** create a new repository and upload all these files (keep the `api` folder).
2. **Vercel:** go to *Add New → Project*, import the repo, leave the settings as they are (Framework: *Other*) and click *Deploy*.
3. **Database:** in the Vercel project, open the **Storage** tab, then *Create Database*, then **Upstash for Redis** (Free plan), then *Connect* to this project.
   This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
4. **Password:** go to *Settings → Environment Variables* and add
   `GROUP_PASSWORD` = the password you'll give your friends.
5. **Redeploy:** go to the *Deployments* tab, open the ⋯ menu on the latest one and click *Redeploy*. The new variables only take effect after a redeploy.

Then send the link and the password to the group chat.

## Run locally (optional)

```bash
npm install
npm i -g vercel
vercel link            # connect to your Vercel project
vercel env pull .env.local
vercel dev
```

Without database variables, `vercel dev` stores orders in memory. That's only for testing, and the orders are lost when you stop it.
