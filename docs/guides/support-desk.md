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

`$HQ_DATA/businesses/<slug>/support-connection.json` → `{"command": [...], "readOnly": true}`, or
`{"commands": [[...], [...]], "readOnly": true}` for several sources (say the database and a support mailbox). Several
sources merge into one board: waiting rows, themes and weeks add up, a week's reply time is the answered-weighted mean
of each source's median (an estimate), and a source that fails is left out and named under "Not seen by HQ". Output:

```ts
{ version: 1, observedAt: string,
  answerAt?: string,                 // where the owner answers (no query string)
  channels?: string[], blind?: string[],   // what it covers, and what HQ can't see, in plain words
  waiting: [{ ref: "s-1a2b3c4d", channel, theme, openedFrom, openedAt, lastAt, unread, answerAt? }],  // answerAt: this row's own link
  themes: { [theme]: count },        // 90 days
  stuck?: { [theme]: count },        // customers within 14 days of signing up
  weekly: [{ week: "2026-W41", opened, answered, medianReplyHours | null }],
  ratings?: { up, down } }
```

Labels are checked for personal-data shapes like the scorecard's; a reference is a short prefix and hex digest, never
an id or address.

## Support email

`templates/support/gmail.mjs` reads a business's support addresses in Gmail with the **read-only** scope and reports the
same snapshot. Subjects and the first message's snippet are read on this Mac only to pick a theme; nothing but
references (`e-` + a hash), themes, counts and timings leaves the script. A thread counts when a person (not a list,
auto-reply, bounce or no-reply sender) wrote to or was answered from a support address. Mail forwarded into a personal
inbox counts once, even if it also sits in a second mailbox.

1. **An OAuth client, once per machine.** In Google Cloud Console: create a project, enable the Gmail API, set up the
   OAuth consent screen, then Credentials → Create OAuth client ID → **Desktop app**, and download its JSON.
   - Google Workspace mailboxes: choose **Internal** on the consent screen. Tokens don't expire.
   - Personal Gmail: choose **External** and then **Publish app** (it stays unverified, so Google shows a warning you
     click through). Left in *Testing*, Google expires the token after 7 days and the board goes blind every week.
2. **Sign in each mailbox** (opens the browser; the refresh token goes to the Keychain, service `hq-gmail`):
   `node templates/support/gmail.mjs connect <mailbox> --client ~/Downloads/client_secret_….json` the first time, then
   `node templates/support/gmail.mjs connect <other mailbox>` for each further mailbox. Delete the downloaded JSON after.
3. **Configure the business:** `$HQ_DATA/businesses/<slug>/support-gmail.json`:
   `{"mailboxes": ["<where the mail lands>"], "addresses": ["<support address>"], "ownDomains": ["<your domain>"]}`
   (`ownAddresses` lists single senders instead of whole domains). A form the site emails to the support address with
   Reply-To the customer counts as the customer's message, so it needs the site's sender to be one of yours.
   and add `["node", "<repo>/templates/support/gmail.mjs", "report", "<that file>"]` to `commands` in
   `support-connection.json`.
4. `npm run hq -- support refresh <slug>`. A mailbox in the config that isn't signed in is counted under "Not seen by HQ".

To disconnect: remove HQ at myaccount.google.com/permissions and delete the `hq-gmail` Keychain item.
