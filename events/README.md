# events/ — the append-only record for The Atelier — Wedding Engine

What happened in this repo, in order, never rewritten.

Rules:
- Append only. An event is never edited and never deleted.
- One file per event: `YYYY-MM-DD-short-slug.md`
- An event records what happened, when, and what evidence proves it.
- A correction is a new event that supersedes an old one. The old one stays.

At v0.1 this record is written by hand. It becomes engine-generated when the
AIOS worker loop lands — at which point these files stop being memory and
start being a mirror of the event stream.
