# Badminton Match Deck

A focused web app for watching official BWF full-match badminton videos from the newest relevant tournaments.

The app shows one match at a time with next/previous navigation, keyboard arrows, and mobile swipe controls. When served with Node, it refreshes from BWF TV's official YouTube feed and falls back to the bundled curated list in `videos.js`.

## Run Locally

```sh
npm start
```

Then open `http://localhost:4173`.

## Deploy on Render

This repo includes `render.yaml` for Render Blueprints.

Render settings:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
