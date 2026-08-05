# Slide Agent

**Describe a presentation. Get a real PowerPoint file you can edit.**

Not a screenshot, not a template you have to fight — a native `.pptx` with
editable text boxes, shapes, tables, charts, and speaker notes, designed by the
AI model you already use in VS Code.

---

## Three steps

**1 — Install this extension.** A getting-started guide opens automatically.

**2 — Click "Slide Agent" in the status bar** (bottom right) and choose
*Set up Slide Agent*. One click, about a minute, no admin rights.

**3 — Click it again and choose *Create a presentation*.** Describe what you
need in plain language:

> A 12-slide deck for our school board on why we should fund fresh-cooked
> lunches. Warm and hopeful, not corporate. Parents will be in the room.

Pick which AI model should design it, and Slide Agent builds the file.

---

## What makes it different

**The model designs it — there is no house style.** Colours, typography,
composition, and diagrams are chosen for *your* subject and audience. A
technical runbook and a fundraising pitch come out looking like different
documents, because they should.

**Everything stays editable.** Open the result in PowerPoint and change
anything. Text is text, charts hold real data you can update, diagrams are
shapes and connectors.

**It checks its own work.** Every deck is validated against the official
PowerPoint schemas so it opens without a repair prompt, then checked for
contrast, readable type size, alt text, and nothing running off the slide. You
also get a quality score that says what would make the deck better.

**Your AI chats get it too.** Setting up the extension also teaches GitHub
Copilot, Claude Code, Codex, and other assistants to build decks. After setup,
just ask any of them for a PowerPoint.

---

## What you can do

| | |
|---|---|
| **Create Presentation** | Describe a deck, get a `.pptx` |
| **Create from Current Brief** | Turn the Markdown or text file you have open into a deck |
| **Edit Existing Presentation** | "Change every mention of Q3 to Q4 and drop slide 7" |
| **Check Installation** | Confirms everything works, including a real test build |

All of them sit behind the **Slide Agent** item in the status bar, or in the
Command Palette under `Slide Agent:`.

---

## Requirements

- **Node.js 22.12 or newer.** The extension checks for it and links you to the
  download if it is missing. This is the only prerequisite.
- **An AI model in VS Code** — GitHub Copilot, or any extension that provides a
  language model. The extension asks which one to use.

PDF and PNG previews are optional and need LibreOffice and Poppler. Creating,
editing, and checking presentations do not.

---

## Settings

| Setting | Default | What it does |
|---|---|---|
| `slideAgent.autoInstall` | `true` | Set up the engine automatically the first time you use a command |
| `slideAgent.defaultOutputDirectory` | `output` | Where the save dialog starts |
| `slideAgent.openAfterCreate` | `true` | Open the finished deck when it is ready |
| `slideAgent.cliPath` | *(empty)* | Point at a specific engine build, if you have one |

---

## Privacy and safety

Your brief goes to whichever AI model you pick in VS Code, and nowhere else.
The deck is built on your machine. Slide Agent does not fetch images from the
internet unless you explicitly turn that on, and it will not reach private or
internal network addresses even then.

---

[Documentation](https://github.com/ghassenbrg/slide-agent#readme) ·
[Report an issue](https://github.com/ghassenbrg/slide-agent/issues) ·
MIT licensed
