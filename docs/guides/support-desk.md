# Support: who's waiting, what they ask, and where it goes next

The Support & Community tab shows, for the current business:
- **Waiting for a reply:** each conversation by a private reference, its theme, where it came from and how long it has
  waited, with a link to answer it in the business's own admin.
- **What customers ask about** (90 days, by theme) and **where new customers get stuck** (people who wrote within 14 days
  of signing up).
- **Conversations by week,** answered, the weekly median time to the first reply, and ratings.

No message text, names, emails or ids reach HQ. Themes come from keyword rules run inside the business's own database
on the customer's first message. Code: `lib/support.ts`, `components/SupportBoard.tsx`.

## Where it goes next

Once a week (the first refresh of each ISO week) the themes go into the business's brain as a **signal** from Support to:
- **Email & Lifecycle:** where new customers get stuck, to fix in the onboarding emails
- **Data & Analytics:** themes and ratings
- **Product & Engineering:** feature requests and bugs

Each department reads it with `npm run hq -- brain read <slug> <dept>`, so `/hq:dept email` plans from it.

## Running it

`npm run hq -- support refresh <slug|--all>` (daily at 06:00 with the scorecard), `support show <slug>`,
`support digest <slug>` (writes this week's signal if it isn't there yet).

## The adapter contract

`$HQ_DATA/businesses/<slug>/support-connection.json` → `{"command": [...], "readOnly": true}`. Output:

```ts
{ version: 1, observedAt: string,
  answerAt?: string,                 // where the owner answers (no query string)
  channels?: string[], blind?: string[],   // what it covers, and what HQ can't see, in plain words
  waiting: [{ ref: "s-1a2b3c4d", channel, theme, openedFrom, openedAt, lastAt, unread }],
  themes: { [theme]: count },        // 90 days
  stuck?: { [theme]: count },        // customers within 14 days of signing up
  weekly: [{ week: "2026-W41", opened, answered, medianReplyHours | null }],
  ratings?: { up, down } }
```

Labels are checked for personal-data shapes like the scorecard's; a reference is a short prefix and hex digest, never
an id or address.
