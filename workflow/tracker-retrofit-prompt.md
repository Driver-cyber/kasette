# Tracker Retrofit Prompt
## Add the project tracker workflow to an existing project

Paste this prompt into a Claude session for any existing project to add the tracker system.
Replace the bracketed placeholders before pasting.

---

```
I want to add a standardized build tracker to this project as a founding doc.

The tracker is a standalone HTML file that:
1. Displays a visual two-column priority board for this project (rendered in browser)
2. Contains a machine-readable JSON block that feeds a cross-project dashboard

Here's what I need you to do:

**Step 1 — Create [PROJECT-NAME]-tracker.html**

Model the file after this structure. It must include both the visual HTML AND the
`<script id="tracker-data" type="application/json">` block at the bottom.

The JSON schema is:
{
  "project": "Short project name (used as unique ID in the dashboard)",
  "description": "One-line description of what this project is",
  "updated": "YYYY-MM-DD",
  "columns": [
    {
      "name": "Column header (e.g. repo name or workstream)",
      "sub": "Short subtitle (tech stack, platform, etc.)",
      "priorities": [
        { "title": "Priority title", "note": "Brief context" },
        { "title": "Priority title", "note": "Brief context" },
        { "title": "Priority title", "note": "Brief context" }
      ],
      "backlog": [
        "Backlog item or bug note",
        "Another item"
      ]
    }
  ]
}

Use 1 column for single-repo projects, 2 columns for multi-repo or multi-workstream.
The "next 3 priorities" should reflect the actual current state of the project.
Read DECISIONS.md (or equivalent) to understand current state before writing priorities.

Visual style: dark walnut background (#2C1A0E), amber (#F2A24A) accents, wheat (#F5DEB3)
text, Plus Jakarta Sans UI font, Fraunces serif for headers. Match the cassette-tracker.html
pattern from the kasette repo if you have access to it.

**Step 2 — Update CLAUDE.md (or equivalent project instructions)**

Add these two bullets to the Memory & Strategy / session startup section:
- "Check the tracker: Also check `[PROJECT-NAME]-tracker.html` for current priorities
  and what's actively being built. Update it at the end of any session that changes priorities."

Add this to the Maintenance Rules section:
- "Build tracker: Update `[PROJECT-NAME]-tracker.html` at the end of any session that
  changes priorities or completes planned work. Update the 'updated' date in both the
  visual header and the JSON block."

**Step 3 — Update DECISIONS.md (or equivalent)**

Add a brief entry noting the tracker was added and what the initial priorities are.

**Step 4 — Commit everything with a message like:**
"Add build tracker as founding doc — [PROJECT-NAME]-tracker.html"

Before writing, read the project's current DECISIONS.md and any status docs to make sure
the tracker accurately reflects where things actually stand. Don't invent priorities.
```

---

## Notes on using this prompt

- **Paste it into an active session** for the existing project — Claude will have the full
  project context and can write accurate priorities
- **Update the date** in the JSON block (`"updated": "YYYY-MM-DD"`) at the end of each
  session that changes priorities
- **Dashboard compatible**: once the tracker has the `#tracker-data` JSON block, drag the
  HTML file into `project-dashboard.html` to add it to your cross-project view
- **Two columns vs one**: use two columns for multi-repo projects (web + native, frontend +
  backend), one column for single-track projects
- **Don't overthink the priorities**: 3 items, in order of when you'll work on them. The
  backlog is for everything else.
