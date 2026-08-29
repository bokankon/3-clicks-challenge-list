# GD List — automatic points build

This version calculates points automatically from the level position.

## Points formula

- #1 = 200 points
- #42 = 89.59 points
- Every position between them follows a smooth exponential falloff.
- Points never go below 1.

You no longer enter points when adding or editing a level.

When an admin changes a level position, its points update automatically.
The verifier and every victor receive the new amount automatically in the leaderboard.

The values are calculated in `app.js` by:

```js
const POINTS_TOP = 200;
const POINTS_REFERENCE_POSITION = 42;
const POINTS_REFERENCE_VALUE = 89.59;

const POINTS_DECAY = Math.pow(
  POINTS_REFERENCE_VALUE / POINTS_TOP,
  1 / (POINTS_REFERENCE_POSITION - 1)
);

function getPointsFromPosition(position) {
  const safePosition = Math.max(1, Math.floor(Number(position) || 1));
  const calculated = POINTS_TOP * Math.pow(POINTS_DECAY, safePosition - 1);
  return Math.max(1, Math.round(calculated * 100) / 100);
}
```

## Admin login

Press:

`Shift + backquote`

Username:

`admin`

The page internally maps this username to:

`admin@gdlist.local`

Your password remains the password set for that Supabase Auth user.

## Deploy with GitHub + Vercel

Replace these files in your GitHub repository:

- `app.js`
- `index.html`

You can also replace all files with this build.

Commit the changes. If Vercel is connected to the repository, Vercel should deploy the new commit automatically.

## Supabase

No new SQL is required for automatic points.

The existing `points` database column can stay there. This frontend ignores it and calculates points from `position`.
