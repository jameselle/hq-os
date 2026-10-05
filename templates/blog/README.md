# Blog publisher contract

HQ's daily blog writes a draft, checks it, and (once the owner allows it) hands it to the business's own
**publisher adapter**. The adapter is a private command in `$HQ_DATA/businesses/<slug>/`, connected by
`blog-connection.json` (`{"command": ["/path/to/node", "/path/to/blog-publisher.mjs"]}`). HQ runs it with one JSON
object on stdin and reads one JSON object from stdout. Exit 1 with one line on stderr on failure; never print a
credential. The adapter reads its own credentials (Keychain, its own config); HQ never passes any.

## Actions

`{"action":"list"}` returns what the site already has, so a new post never repeats one and can link to the others:

```json
{"posts": [{"slug": "how-odds-work", "title": "How odds work", "url": "https://example.com/blog/how-odds-work/", "publishedAt": "2026-10-01T00:00:00Z"}]}
```

`{"action":"publish","post":{…}}` publishes one post and returns where it lives:

```json
{"url": "https://example.com/blog/how-odds-work/", "publishedAt": "2026-10-06T05:31:00Z"}
```

The post:

| Field | Type | Notes |
|---|---|---|
| `slug` | string | lowercase-kebab, unique on the site |
| `title` | string | 20 to 65 characters |
| `description` | string | the meta description, 70 to 160 characters |
| `markdown` | string | the body, in the subset below; no H1 (the page renders the title) |
| `keyword` | string | the search it targets |
| `category` | string | optional; the adapter maps it to the site's own categories |
| `sources` | `[{title, url}]` | public sources, rendered as a "Sources" list |
| `faq` | `[{q, a}]` | rendered as questions and answers, with FAQ schema where the site supports it |
| `date` | ISO date | publication date |

HQ reads the url back (HTTP 200 and the title on the page) before it counts the post as published. A site that
publishes with a delay (a build or a cache) returns its url anyway; HQ retries the read-back for up to an hour.

## Markdown subset

Only these, so every site can render it safely: `##` and `###` headings, paragraphs, `-` and `1.` lists,
`**bold**`, `*italic*`, `[text](https://…)` links, `> ` quotes, and GitHub pipe tables. No HTML, no images, no
code fences (sites that want code samples can opt in later).

## Try it

`folder-publisher.mjs` here "publishes" into a local folder as HTML files, so you can run the whole pipeline
before connecting a real site.
