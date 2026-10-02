import json, sys
OUT = sys.argv[1]

def head(a, b=None, sub=None, btone="accent", at="c1-11 r1-2"):
    words = [{"text": a, "role": "title", "size": 46, "width": "auto"}]
    if b: words.append({"text": b, "role": "title", "size": 46, "tone": btone, "width": "auto"})
    items = [{"row": {"gap": "space.1", "items": words}}]
    if sub: items.append({"text": sub, "role": "lead", "tone": "muted"})
    return {"at": at, "column": {"gap": "space.1", "justify": "start", "items": items}}

def badge(icon, fill, tone, size=56, glyph=26):
    return {"column": {"surface": "dot-" + fill, "width": size, "height": size, "align": "center", "justify": "center", "items": [
        {"icon": icon, "tone": tone, "width": glyph, "height": glyph}]}}

def check(text, icon="circle-check", tone="accent", role="body"):
    # A fixed height keeps list rhythm even: rows otherwise reserve uneven extra height.
    return {"row": {"gap": "space.1.5", "align": "center", "height": 22 if role == "small" else 26, "items": [
        {"icon": icon, "tone": tone, "width": 20, "height": 20},
        {"text": text, "role": role}]}}

intent = {
  "schema": "slide-agent.intent/1",
  "brief": {"title": "Pockito — product update", "audience": "Stakeholders, October product update",
            "goal": "Show progress on Pockito and agree the roadmap and the support it needs", "format": "16:9"},
  "direction": {"concept": "Friendly fintech: airy white cards on a soft canvas, deep navy headlines with one word in fresh teal, every idea anchored by a round pastel icon badge, and the app's own art doing the smiling.", "fit": "ask"},
  "design": {"language": {
    "color": {
      "palette": {
        "canvas": "#F5F7F9", "card": "#FFFFFF", "navy": "#0F2A44", "slate": "#55657A", "line": "#E2E8EE",
        "teal": "#12998A", "green": "#1C9A5C", "ocean": "#3A8FA6",
        "blue": "#3B82F6", "purple": "#8B5CF6", "pink": "#E8679B", "orange": "#F2873A", "yellow": "#F2B630", "red": "#E0454B",
        "orangeDeep": "#BF5410", "tealDeep": "#0E7A6F", "oceanDeep": "#2C6E83", "pinkDeep": "#C03E78", "amberDeep": "#9C6A00",
        "sky": "#EAF3FA", "peach": "#FDF0EA", "mint": "#E8F6EF", "rose": "#FCEDED", "track": "#EEF2F5"
      },
      "roles": {"background": "canvas", "surface": "card", "text": "navy", "muted": "slate", "accent": "teal", "accentAlt": "green", "rule": "line"},
      "data": ["teal", "blue", "purple"]
    },
    "type": {
      "display": {"family": "Plus Jakarta Sans", "weight": 800, "tracking": -0.02},
      "body": {"family": "Plus Jakarta Sans", "weight": 500},
      "scale": {"base": 17, "ratio": 1.25}
    },
    "space": {"unit": 8, "margin": 44, "gutter": 16},
    "grid": {"columns": 12, "rows": 8},
    "shape": {"radius": 14, "stroke": 0, "shadow": "soft"},
    "surfaces": {
      "card": {"fill": "card", "radius": 16, "pad": "space.3", "shadow": "soft"},
      "tile": {"fill": "card", "radius": 16, "pad": "space.2", "shadow": "soft"},
      "sky": {"fill": "sky", "radius": 18, "pad": "space.2.5"},
      "peach": {"fill": "peach", "radius": 18, "pad": "space.2.5"},
      "mint": {"fill": "mint", "radius": 16, "pad": "space.2.5"},
      "rose": {"fill": "rose", "radius": 18, "pad": "space.2.5"},
      "track": {"fill": "track", "radius": 10},
      "dot-mint": {"fill": "mint", "radius": 100}, "dot-sky": {"fill": "sky", "radius": 100}, "dot-peach": {"fill": "peach", "radius": 100},
      "dot-rose": {"fill": "rose", "radius": 100}, "dot-track": {"fill": "track", "radius": 100},
      "dot-teal-deep": {"fill": "tealDeep", "radius": 100}, "dot-ocean-deep": {"fill": "oceanDeep", "radius": 100}
    },
    "texture": [
      {"id": "sky-wash", "primitive": "gradient-wash", "params": {"from": "canvas", "to": "sky", "angle": 0, "opacity": 1}}
    ],
    "chrome": {"slideNumber": True, "position": "bottom-right"}
  }},
  "components": {
    "agenda": {"params": ["n", "title", "detail", "fill"], "root": {"row": {"gap": "space.2.5", "align": "center", "items": [
        {"column": {"surface": "dot-{fill}", "width": 46, "height": 46, "justify": "center", "items": [
            {"text": "{n}", "role": "h3", "tone": "card", "align": "center"}]}},
        {"column": {"gap": "space.0.5", "items": [{"text": "{title}", "role": "h3"}, {"text": "{detail}", "role": "body", "tone": "muted"}]}}]}}},
    "pillar": {"params": ["icon", "fill", "tone", "title", "detail"], "root": {"column": {"gap": "space.1.5", "align": "center", "items": [
        badge("{icon}", "{fill}", "{tone}", 64, 30),
        {"text": "{title}", "role": "h3", "align": "center"},
        {"text": "{detail}", "role": "small", "tone": "muted", "align": "center"}]}}},
    "feature": {"params": ["icon", "fill", "tone", "title", "detail"], "root": {"column": {"surface": "tile", "gap": "space.1", "align": "center", "justify": "center", "items": [
        badge("{icon}", "{fill}", "{tone}", 50, 24),
        {"text": "{title}", "role": "h3", "align": "center"},
        {"text": "{detail}", "role": "small", "tone": "muted", "align": "center"}]}}},
    "risk": {"params": ["icon", "tone", "title", "detail"], "root": {"row": {"gap": "space.2", "height": 44, "items": [
        {"icon": "{icon}", "tone": "{tone}", "width": 22, "height": 22},
        {"column": {"gap": "space.0.25", "items": [{"text": "{title}", "role": "body", "weight": 700}, {"text": "{detail}", "role": "small", "tone": "muted"}]}}]}}},
    "screen": {"params": ["asset", "alt", "title", "detail"], "root": {"column": {"gap": "space.1", "align": "center", "items": [
        {"image": {"asset": "{asset}", "alt": "{alt}", "fit": "contain"}, "grow": 1},
        {"text": "{title}", "role": "h3", "align": "center"},
        {"text": "{detail}", "role": "small", "tone": "muted", "align": "center"}]}}}
  },
  "slides": []
}
S = intent["slides"]

# 1 cover
S.append({"id": "cover", "message": "Pockito is becoming a smarter, simpler finance app — this is where we are", "compose": {"grid": "12x8", "items": [
  {"at": "c1-12 r1-8", "bleed": ["left", "right", "top", "bottom"], "texture": "sky-wash"},
  {"at": "c1-7 r1-8", "column": {"gap": "space.3", "justify": "center", "items": [
     {"row": {"gap": "space.1", "align": "center", "items": [
        {"icon": "sprout", "tone": "green", "width": 34, "height": 34},
        {"text": "Pockito", "role": "h2", "tone": "accent", "width": "auto"}]}},
     {"space": "space.2"},
     {"text": "Building a Smarter & Simpler Finance App", "role": "display", "size": 54},
     {"text": "Product Update", "role": "h2"},
     {"text": "Oct 2026 · Simple finance, happier together", "role": "body", "tone": "muted"}]}},
  {"at": "c8-12 r1-8", "bleed": ["right", "top", "bottom"], "image": {"asset": "app-art/otter.png", "alt": "Pockito's otter mascot holding a gold coin on a hilltop above a coastal city", "fit": "cover", "focal": [0.45, 0.5]}}]}})

# 2 agenda
fills = ["ocean-deep", "teal-deep", "teal-deep", "ocean-deep", "ocean-deep"]
items = [("01", "Product Overview", "Vision, users, and key goals"), ("02", "Progress & Milestones", "What we've delivered"),
         ("03", "Demo Highlights", "Key features in action"), ("04", "Roadmap", "Next steps and timeline"), ("05", "Risks & Support Needed", "What we need to succeed")]
S.append({"id": "agenda", "message": "Five things to cover: product, progress, demo, roadmap, and risks", "compose": {"grid": "12x8", "items": [
  head("Today's", "Agenda", at="c1-7 r1-2"),
  {"at": "c1-6 r2-8", "column": {"gap": "space.1.25", "justify": "center", "items": [
      {"use": "agenda", "n": n, "title": t, "detail": d, "fill": f} for (n, t, d), f in zip(items, fills)]}},
  {"at": "c7-12 r1-8", "image": {"asset": "app-art/agenda-phone.png", "alt": "Pockito home screen showing total balance, a shared space and recent expenses", "fit": "contain"}}]}})

# 3 vision
pillars = [("users", "mint", "teal", "Shared Spaces", "Expenses, budgets and settlements"),
           ("wallet-cards", "sky", "blue", "Complete Money Management", "Accounts, wallets, subscriptions"),
           ("sparkles", "peach", "orangeDeep", "AI-Powered Simplicity", "Smart insights and automation"),
           ("heart", "rose", "red", "A Happier Financial Life", "Built for real life, together")]
S.append({"id": "vision", "message": "One app for individuals and couples to manage money together", "compose": {"grid": "12x8", "items": [
  head("Product", "Vision", "A modern finance app for individuals and couples to manage money together, effortlessly.", at="c1-10 r1-2"),
  {"at": "c1-12 r3-6", "row": {"gap": "space.3", "align": "center", "connect": "dots", "items": [
      {"use": "pillar", "icon": i, "fill": f, "tone": t, "title": ti, "detail": d} for i, f, t, ti, d in pillars]}},
  {"at": "c1-12 r7-8", "surface": "mint", "row": {"gap": "space.2", "align": "center", "justify": "center", "items": [
      {"text": "“Make managing money simple, transparent, and even enjoyable — for individuals and the people they care about.”", "role": "body", "italic": True, "align": "center"},
      {"icon": "sprout", "tone": "green", "width": 32, "height": 32}]}}]}})

# 4 users
S.append({"id": "users", "message": "We design for individuals and for couples who share money", "compose": {"grid": "12x8", "items": [
  head("Target", "Users", "Designed for both individual and shared finance needs.", at="c1-10 r1-2"),
  {"at": "c1-6 r3-8", "surface": "sky", "column": {"gap": "space.0.75", "items": [
      {"image": {"asset": "app-art/individual.png", "alt": "Illustration of a young man checking his phone", "fit": "contain"}, "height": 132},
      {"text": "Individuals", "role": "h3"},
      check("Track personal expenses", role="small"), check("Manage accounts & subscriptions", role="small"), check("Get AI insights", role="small"), check("Simple and clean experience", role="small")]}},
  {"at": "c7-12 r3-8", "surface": "peach", "column": {"gap": "space.0.75", "items": [
      {"image": {"asset": "app-art/couple.png", "alt": "Illustration of a smiling couple", "fit": "contain"}, "height": 132},
      {"text": "Couples / Shared Spaces", "role": "h3"},
      check("Shared expenses", tone="orangeDeep", role="small"), check("Budgets & categories", tone="orangeDeep", role="small"), check("Fair settlements", tone="orangeDeep", role="small"), check("Transparency for peace of mind", tone="orangeDeep", role="small")]}}]}})

# 5 features
feats = [("users", "mint", "green", "Spaces", "Shared expenses, budgets, settlements"),
         ("wallet", "sky", "blue", "Accounts & Wallets", "Bank accounts, transfers, balances"),
         ("chart-pie", "track", "purple", "Expenses", "Categories, tags, receipts (OCR)"),
         ("calendar-check", "peach", "orangeDeep", "Budgets", "Track and get alerts"),
         ("bell", "rose", "red", "Notifications", "Stay informed"),
         ("sparkles", "peach", "amberDeep", "AI Insights", "Smart analysis and suggestions")]
S.append({"id": "features", "message": "Six features bring personal and shared finance together", "compose": {"grid": "12x8", "items": [
  head("Key", "Features", "Bringing together the best of personal and shared finance.", at="c1-10 r1-2"),
  {"at": "c1-12 r3-5", "row": {"gap": "space.2", "items": [{"use": "feature", "icon": i, "fill": f, "tone": t, "title": ti, "detail": d} for i, f, t, ti, d in feats[:3]]}},
  {"at": "c1-12 r6-8", "row": {"gap": "space.2", "items": [{"use": "feature", "icon": i, "fill": f, "tone": t, "title": ti, "detail": d} for i, f, t, ti, d in feats[3:]]}}]}})

# 6 progress
quarters = [("Q2 2026", "Foundation", "done", ["Auth (Keycloak)", "Core infrastructure", "Mobile app base", "Basic expenses"]),
            ("Q3 2026", "Core Features", "done", ["Shared spaces", "Budgets", "Settlements", "Accounts & wallets", "Notifications"]),
            ("Q4 2026", "Polish & Scale", "now", ["AI insights", "OCR receipts", "Subscriptions", "UI/UX polish", "iOS widgets"]),
            ("Q1 2027", "Web & Expansion", "next", ["Web application", "Advanced analytics", "Multi-currency", "More integrations"])]
def node(state):
    if state == "done":
        return {"icon": "circle-check", "tone": "green", "width": 34, "height": 34}
    if state == "now":
        return {"layer": {"anchor": "center", "width": 34, "height": 34, "items": [{"shape": "ellipse", "fill": "blue"}, {"shape": "ellipse", "fill": "card", "width": 18, "height": 18}]}}
    return {"layer": {"anchor": "center", "width": 34, "height": 34, "items": [{"shape": "ellipse", "fill": "line"}, {"shape": "ellipse", "fill": "card", "width": 22, "height": 22}]}}
mark = {"done": ("circle-check", "green"), "now": ("circle-dot", "blue"), "next": ("circle", "slate")}
S.append({"id": "progress", "message": "Two quarters shipped; Q4 polish and scale is under way", "compose": {"grid": "12x8", "items": [
  head("Progress &", "Milestones", "Significant progress across core features.", at="c1-10 r1-2"),
  {"at": "c1-12 r3", "row": {"gap": "space.2", "items": [
      {"column": {"gap": "space.0.5", "align": "center", "items": [{"text": q, "role": "h3", "align": "center"}, {"text": l, "role": "small", "tone": "muted", "align": "center"}]}} for q, l, _, _ in quarters]}},
  {"at": "c1-7 r4", "column": {"justify": "center", "items": [{"shape": "rect", "fill": "green", "height": 4}]}},
  {"at": "c7-9 r4", "column": {"justify": "center", "items": [{"shape": "rect", "fill": "blue", "height": 4}]}},
  {"at": "c10-12 r4", "column": {"justify": "center", "items": [{"shape": "rect", "fill": "line", "height": 4}]}},
  {"at": "c1-12 r4", "row": {"gap": "space.2", "items": [{"column": {"align": "center", "justify": "center", "items": [node(s)]}} for _, _, s, _ in quarters]}},
  {"at": "c1-12 r5-8", "row": {"gap": "space.2", "items": [
      {"column": {"gap": "space.1.5", "items": [check(x, icon=mark[s][0], tone=mark[s][1], role="small") for x in xs]}} for _, _, s, xs in quarters]}}]}})

# 7 demo
screens = [("app-art/screen-home.png", "Home screen", "Home", "Overview & insights"),
           ("app-art/screen-shared.png", "Shared space screen", "Shared Space", "Expenses & members"),
           ("app-art/screen-add.png", "Add expense screen", "Add Expense", "Quick & easy"),
           ("app-art/screen-budgets.png", "Budgets screen", "Budgets", "Track & get alerts"),
           ("app-art/screen-insights.png", "AI insights screen", "AI Insights", "Personalized tips")]
S.append({"id": "demo", "message": "Five screens show the main experience", "compose": {"grid": "12x8", "items": [
  head("Demo", "Highlights", "A quick look at the main experience.", btone="accentAlt", at="c1-10 r1-2"),
  {"at": "c1-12 r3-8", "row": {"gap": "space.2", "items": [{"use": "screen", "asset": a, "alt": alt, "title": t, "detail": d} for a, alt, t, d in screens]}}]}})

# 8 roadmap
lanes = [("smartphone", "green", "Mobile App (v1.0)", "c5-8", "teal"),
         ("bot", "blue", "AI Features", "c6-8", "blue"),
         ("app-window", "purple", "Web Application", "c8-12", "purple"),
         ("credit-card", "pinkDeep", "Integrations (Banks, Cards)", "c9-11", "pink"),
         ("chart-bar", "orangeDeep", "Advanced Analytics", "c10-12", "orange"),
         ("globe", "amberDeep", "Internationalization", "c11-12", "yellow")]
gantt = [{"at": "c5-13 r2-7", "surface": "track", "space": "space.1"},
         {"at": "c5-7 r1", "text": "Q4 2026", "role": "body", "weight": 600, "align": "center", "valign": "middle"},
         {"at": "c8-10 r1", "text": "Q1 2027", "role": "body", "weight": 600, "align": "center", "valign": "middle"},
         {"at": "c11-13 r1", "text": "Q2 2027", "role": "body", "weight": 600, "align": "center", "valign": "middle"}]
for k, (icon, tone, label, span, fill) in enumerate(lanes):
    r = k + 2
    gantt.append({"at": f"c1-4 r{r}", "row": {"gap": "space.1.5", "align": "center", "items": [
        {"icon": icon, "tone": tone, "width": 22, "height": 22}, {"text": label, "role": "body"}]}})
    gantt.append({"at": f"{span} r{r}", "column": {"justify": "center", "items": [{"shape": "roundRect", "fill": fill, "radius": 8, "height": 22}]}})
S.append({"id": "roadmap", "message": "From the mobile app to a full ecosystem by mid-2027", "compose": {"grid": "12x8", "items": [
  head("Roadmap", None, "From a solid mobile foundation to a full ecosystem.", at="c1-10 r1-2"),
  {"at": "c1-12 r3-8", "grid": "13x7", "items": gantt}]}})

# 9 risks
risks = [("OCR accuracy for complex receipts", "May affect user trust"), ("Scaling infrastructure", "Need to handle 500+ rows / large data"),
         ("External integrations", "Bank API availability & changes"), ("Timeline pressure", "Balancing quality and speed")]
needs = [("Engineering resources", "For web, AI & integrations"), ("Infrastructure support", "Redis, storage, monitoring"),
         ("Product feedback", "From stakeholders & early users"), ("Go-to-market support", "Marketing & user acquisition")]
S.append({"id": "risks", "message": "Four risks to manage, and the four kinds of support we need", "compose": {"grid": "12x8", "items": [
  head("Risks &", "Support Needed", "Key risks and what we need to ensure a successful launch.", btone="accentAlt", at="c1-11 r1-2"),
  {"at": "c1-6 r3-8", "surface": "rose", "column": {"gap": "space.2", "items": [
      {"row": {"gap": "space.1.5", "align": "center", "items": [{"icon": "triangle-alert", "tone": "red", "width": 26, "height": 26}, {"text": "Key Risks", "role": "h3", "tone": "red"}]}},
      *[{"use": "risk", "icon": "shield-alert", "tone": "red", "title": t, "detail": d} for t, d in risks]]}},
  {"at": "c7-12 r3-8", "surface": "mint", "column": {"gap": "space.2", "items": [
      {"row": {"gap": "space.1.5", "align": "center", "items": [{"icon": "rocket", "tone": "green", "width": 26, "height": 26}, {"text": "Support Needed", "role": "h3", "tone": "green"}]}},
      *[{"use": "risk", "icon": "circle-check", "tone": "green", "title": t, "detail": d} for t, d in needs]]}}]}})

json.dump(intent, open(OUT, "w"), indent=2, ensure_ascii=False)
print("slides:", len(S))
