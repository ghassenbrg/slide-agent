---
layout: home

hero:
  name: Slide Agent
  text: Describe a deck. Get real PowerPoint.
  tagline: An open-source AI agent that designs native, editable decks — from Claude Code, Codex, GitHub Copilot, Gemini, VS Code, or any MCP app.
  image:
    src: /icon.png
    alt: Slide Agent
  actions:
    - theme: brand
      text: Install
      link: /guide/install
    - theme: alt
      text: What is Slide Agent?
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/ghassenbrg/slide-agent

features:
  - icon: 🎨
    title: A design system for every deck
    details: Your model chooses the concept, palette, typefaces and composition for the subject in front of it. There is no house style.
  - icon: 📐
    title: The engine does the precise part
    details: Grid layout, text measured against the real font files, contrast checks, routed diagram connectors — computed, not guessed.
  - icon: 📊
    title: Real PowerPoint
    details: Native .pptx with real text boxes, theme colours, embedded fonts, native charts with their data, tables, diagrams and icons.
  - icon: ✅
    title: It checks its own work
    details: Every build returns a verdict. Overflow, contrast and layout problems are fixed or reported, and finalize validates the package and rebuilds it from its intent.
  - icon: 🧩
    title: Works where you work
    details: A VS Code extension, a skill for Claude Code, Codex, Copilot and Gemini, an MCP server, a CLI and a TypeScript library.
  - icon: 🔓
    title: Free and open source
    details: MIT licensed. Node.js is the only requirement.
---

<script setup>
import PresentationGallery from './.vitepress/theme/PresentationGallery.vue';
</script>

<div style="max-width: 1152px; margin: 64px auto 0; padding: 0 24px;">

## Every deck gets its own design.

A few examples from the showcase: an executive review, an architecture deck, an analytics
story, a product launch and a transformation strategy. None of them came from a fixed template.
Slide Agent designed each look for its brief, and it will design a new one for yours.

<PresentationGallery />

[Open the showcase →](/showcase)

</div>
