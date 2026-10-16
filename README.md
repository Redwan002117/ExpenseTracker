# ExpenseTracker

A responsive personal expense and budget tracker for students, built with **HTML, CSS and vanilla JavaScript** — no frameworks, no build step, no backend.

The interface follows a "Soft & Cool" glassmorphic design system: a cool slate canvas, white rounded cards, the Nunito typeface, tinted glows instead of grey shadows, and tactile press animations.

## Features

| Feature | Description |
|---|---|
| Dashboard | Monthly balance hero card that changes colour as you approach your budget, income / expense / daily-average stats, recent transactions, a spending donut and a smart insight card |
| Add / edit / delete | Bottom-sheet form (centred dialog on desktop) with amount, type, category, date and note, plus validation |
| Transactions | Search, type pills, category and month filters, grouped by day with daily totals |
| Reports | Spending split by category, income vs expenses for the last 6 months, top categories, savings rate |
| Budget | Overall monthly limit plus optional per-category limits; warnings at 80% and when you go over |
| Smart insight | Highlights your biggest category, compares with last month and suggests an action |
| Export & backup | Export CSV (opens in Excel / Google Sheets), download and restore a JSON backup |
| Sample data | Three months of realistic example data to explore the app |
| Dark / light mode | Follows the system by default; can be set manually and is remembered |
| Responsive | Fixed sidebar on desktop, floating glass bottom navigation on mobile |
| Keyboard | Press <kbd>N</kbd> to add a transaction, <kbd>Esc</kbd> to close dialogs |

All data is stored in the browser with `localStorage`, so it stays on the device.

## Run it

No installation needed. Either:

- open `index.html` in a browser, or
- serve the folder, e.g. `npx serve .` or `python -m http.server`, and visit the printed URL.

### Deploy to GitHub Pages

Repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**. The site will be live at `https://<username>.github.io/ExpenseTracker/`.

## Project structure

```
ExpenseTracker/
├── index.html        # Markup for all views, icon sprite, dialogs
├── css/
│   └── style.css     # Design tokens, light/dark themes, components, responsive layout
└── js/
    ├── store.js      # Data model, categories, localStorage persistence, queries, backup/restore
    ├── charts.js     # Donut and bar charts drawn on <canvas> (no chart library)
    └── app.js        # Routing, rendering, forms, filters, budgets, alerts, theme, export
```

## Tech

- **HTML5** — semantic structure, hash-based routing between views
- **CSS3** — custom properties (design tokens), grid/flexbox, `backdrop-filter`, media queries, `prefers-color-scheme`, `prefers-reduced-motion`
- **JavaScript (ES6+)** — DOM rendering, `localStorage`, Canvas 2D charts, Blob downloads, File API

## Future improvements

- User accounts and cloud sync
- Recurring transactions
- Shared budgets with roommates
- Installable PWA with offline support
