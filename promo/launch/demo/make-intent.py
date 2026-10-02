"""Writes intent.json (or, with --draft, intent-draft.json): the sample deck the
launch film shows.

An unbranded engineering review of a team's AI platform, built from
platform-notes.md and metrics.csv. Every element is native — text, icons,
cards, a chart, a diagram, a timeline and a roadmap — so the whole deck stays
editable.

    python3 make-intent.py intent.json
    python3 make-intent.py intent-draft.json --draft

The draft is the same deck with one first-draft choice the engine catches:
the bright amber on the cost badge. The film shows that verdict and the
EditOp that answers it (film/edit-results.json).
"""

import json
import sys

OUT = sys.argv[1]
DRAFT = "--draft" in sys.argv[2:]


def head(a, b=None, sub=None, btone="accent", at="c1-11 r1-2"):
    words = [{"text": a, "role": "title", "size": 44, "width": "auto"}]
    if b:
        words.append({"text": b, "role": "title", "size": 44, "tone": btone, "width": "auto"})
    items = [{"row": {"gap": "space.1", "items": words}}]
    if sub:
        items.append({"text": sub, "role": "lead", "tone": "muted"})
    return {"at": at, "column": {"gap": "space.1", "justify": "start", "items": items}}


def badge(icon, fill, tone, size=56, glyph=26):
    return {"column": {"surface": "dot-" + fill, "width": size, "height": size, "align": "center", "justify": "center", "items": [
        {"icon": icon, "tone": tone, "width": glyph, "height": glyph}]}}


def check(text, icon="circle-check", tone="accent", role="small"):
    # A fixed height keeps list rhythm even: rows otherwise reserve uneven extra height.
    return {"row": {"gap": "space.1.5", "align": "center", "height": 22 if role == "small" else 26, "items": [
        {"icon": icon, "tone": tone, "width": 20, "height": 20},
        {"text": text, "role": role}]}}


TINTS = {"indigo-tint": "#EEF0FF", "cyan-tint": "#E4F6FA", "violet-tint": "#F3EEFF", "green-tint": "#E7F6EE", "amber-tint": "#FFF4E2", "rose-tint": "#FDECEE"}

intent = {
    "schema": "slide-agent.intent/1",
    "brief": {"title": "AI platform — Q4 engineering review", "audience": "Engineering leadership",
              "goal": "Show the platform's results and agree the 2027 roadmap and what it needs", "format": "16:9"},
    "direction": {"concept": "A modern engineering review: crisp white cards on a cool canvas, deep navy headlines with one word in electric indigo, numbers set in mono like live metrics, and every idea anchored by a round tinted icon badge.", "fit": "ask"},
    "data": {
        "latency": {"categories": ["Q1", "Q2", "Q3", "Q4"], "series": [{"name": "p95 latency (ms)", "values": [310, 262, 214, 180]}]},
        "traffic": {"categories": ["Q1", "Q2", "Q3", "Q4"], "series": [{"name": "Requests / sec (thousands)", "values": [14, 21, 32, 43]}]},
    },
    "design": {"language": {
        "color": {
            "palette": {
                "canvas": "#F5F7FB", "card": "#FFFFFF", "navy": "#0B1B33", "slate": "#55627A", "line": "#E1E6EF",
                "indigo": "#4F46E5", "cyan": "#0891B2", "violet": "#7C3AED", "green": "#15803D", "amber": "#B45309", "rose": "#BE123C",
                "indigoDeep": "#3730A3", "amberBright": "#F5A524", "track": "#EEF1F7", **{k.replace("-tint", "Tint"): v for k, v in TINTS.items()},
            },
            "roles": {"background": "canvas", "surface": "card", "text": "navy", "muted": "slate", "accent": "indigo", "accentAlt": "cyan", "rule": "line"},
            "data": ["indigo", "cyan", "violet"],
        },
        "type": {
            "display": {"family": "Plus Jakarta Sans", "weight": 800, "tracking": -0.02},
            "body": {"family": "Plus Jakarta Sans", "weight": 500},
            "mono": {"family": "JetBrains Mono", "weight": 500},
            "scale": {"base": 17, "ratio": 1.25},
        },
        "space": {"unit": 8, "margin": 44, "gutter": 16},
        "grid": {"columns": 12, "rows": 8},
        "shape": {"radius": 14, "stroke": 0, "shadow": "soft"},
        "surfaces": {
            "card": {"fill": "card", "radius": 16, "pad": "space.3", "shadow": "soft"},
            "tile": {"fill": "card", "radius": 16, "pad": "space.2", "shadow": "soft"},
            "panel": {"fill": "indigoTint", "radius": 20, "pad": "space.3"},
            "rose": {"fill": "roseTint", "radius": 18, "pad": "space.2.5"},
            "mint": {"fill": "greenTint", "radius": 18, "pad": "space.2.5"},
            "track": {"fill": "track", "radius": 10},
            **{"dot-" + k: {"fill": k.replace("-tint", "Tint"), "radius": 100} for k in TINTS},
            "dot-indigo": {"fill": "indigo", "radius": 100},
            "dot-indigo-deep": {"fill": "indigoDeep", "radius": 100},
        },
        "charts": {"axis": "hairline", "gridlines": "subtle", "legend": "none", "labels": "end"},
        "chrome": {"slideNumber": True, "position": "bottom-right"},
    }},
    "components": {
        "agenda": {"params": ["n", "title", "detail", "fill"], "root": {"row": {"gap": "space.2.5", "align": "center", "items": [
            {"column": {"surface": "dot-{fill}", "width": 46, "height": 46, "justify": "center", "items": [
                {"text": "{n}", "role": "h3", "tone": "card", "font": "mono", "align": "center"}]}},
            {"column": {"gap": "space.0.5", "items": [{"text": "{title}", "role": "h3"}, {"text": "{detail}", "role": "body", "tone": "muted"}]}}]}}},
        "kpi": {"params": ["icon", "fill", "tone", "value", "label", "detail"], "root": {"column": {"surface": "tile", "gap": "space.1", "justify": "center", "items": [
            badge("{icon}", "{fill}", "{tone}", 50, 24),
            {"space": "space.1"},
            {"text": "{value}", "role": "display", "size": 46, "font": "mono", "tone": "{tone}"},
            {"text": "{label}", "role": "h3"},
            {"text": "{detail}", "role": "small", "tone": "muted"}]}}},
        "feature": {"params": ["icon", "fill", "tone", "title", "detail"], "root": {"column": {"surface": "tile", "gap": "space.1", "align": "center", "justify": "center", "items": [
            badge("{icon}", "{fill}", "{tone}", 50, 24),
            {"text": "{title}", "role": "h3", "align": "center"},
            {"text": "{detail}", "role": "small", "tone": "muted", "align": "center"}]}}},
        "item": {"params": ["icon", "tone", "title", "detail"], "root": {"row": {"gap": "space.2", "height": 44, "items": [
            {"icon": "{icon}", "tone": "{tone}", "width": 22, "height": 22},
            {"column": {"gap": "space.0.25", "items": [{"text": "{title}", "role": "body", "weight": 700}, {"text": "{detail}", "role": "small", "tone": "muted"}]}}]}}},
    },
    "slides": [],
}
S = intent["slides"]

# 1 cover
S.append({"id": "cover", "message": "The platform is faster, leaner, and ready to scale", "compose": {"grid": "12x8", "items": [
    {"at": "c1-6 r1-8", "column": {"gap": "space.3", "justify": "center", "items": [
        {"text": "Engineering review · Q4 2026", "role": "label", "tone": "accent", "case": "upper", "font": "mono", "tracking": 0.1},
        {"text": "Faster, leaner, ready to scale", "role": "display", "size": 56},
        {"text": "The AI platform: results, architecture, and what comes next", "role": "lead", "tone": "muted"}]}},
    {"at": "c7-12 r1-8", "bleed": ["right", "top", "bottom"], "surface": "panel", "column": {"pad": "space.5", "gap": "space.2", "justify": "center", "items": [
        {"text": "p95 latency", "role": "label", "font": "mono", "tone": "muted", "case": "upper", "tracking": 0.1},
        {"text": "310 → 180 ms", "role": "display", "size": 44, "font": "mono", "tone": "accent"},
        {"chart": {"data": "latency", "chart": "column", "highlight": "Q4"}, "grow": 1}]}}]}})

# 2 agenda
agenda = [("01", "Results", "What the platform delivered this year"), ("02", "Architecture", "How a request flows today"),
          ("03", "Reliability", "Milestones, quarter by quarter"), ("04", "Roadmap", "2027, lane by lane"), ("05", "What we need", "Risks and the support to manage them")]
S.append({"id": "agenda", "message": "Five things to cover: results, architecture, reliability, roadmap, and asks", "compose": {"grid": "12x8", "items": [
    head("Today's", "Agenda", at="c1-7 r1-2"),
    {"at": "c1-7 r2-8", "column": {"gap": "space.1.25", "justify": "center", "items": [
        {"use": "agenda", "n": n, "title": t, "detail": d, "fill": "indigo-deep" if k % 2 == 0 else "indigo"} for k, (n, t, d) in enumerate(agenda)]}},
    {"at": "c8-12 r2-7", "surface": "panel", "column": {"gap": "space.2", "justify": "center", "items": [
        {"text": "At a glance", "role": "label", "font": "mono", "tone": "muted", "case": "upper", "tracking": 0.1},
        {"text": "12 services", "role": "h2", "font": "mono"},
        {"text": "4 regions", "role": "h2", "font": "mono"},
        {"text": "43k requests / sec", "role": "h2", "font": "mono", "tone": "accent"}]}}]}})

# 3 results
kpis = [("gauge", "indigo-tint", "indigo", "−42%", "p95 latency", "310 → 180 ms"),
        ("shield-check", "green-tint", "green", "99.98%", "Uptime", "Up from 99.91%"),
        ("coins", "amber-tint", "amberBright" if DRAFT else "amber", "−31%", "Cost per request", "$0.42 → $0.29 per 1k"),
        ("zap", "cyan-tint", "cyan", "3.1×", "Peak throughput", "14k → 43k req/s")]
S.append({"id": "results", "message": "Latency down 42%, uptime 99.98%, cost per request down 31%", "compose": {"grid": "12x8", "items": [
    head("Key", "Results", "Four numbers from a year of platform work.", at="c1-10 r1-2"),
    {"at": "c1-12 r3-7", "row": {"gap": "space.2", "items": [{"use": "kpi", "icon": i, "fill": f, "tone": t, "value": v, "label": l, "detail": d} for i, f, t, v, l, d in kpis]}}]}})

# 4 traffic
S.append({"id": "traffic", "message": "Traffic tripled while latency fell", "compose": {"grid": "12x8", "items": [
    head("Traffic", "tripled", "Requests per second by quarter, in thousands.", at="c1-10 r1-2"),
    {"at": "c1-8 r3-8", "surface": "card", "chart": {"data": "traffic", "chart": "column", "highlight": "Q4"}},
    {"at": "c9-12 r3-8", "surface": "panel", "column": {"gap": "space.1", "justify": "center", "items": [
        {"text": "Q1 → Q4", "role": "label", "font": "mono", "tone": "muted", "case": "upper", "tracking": 0.1},
        {"text": "14k → 43k", "role": "display", "size": 40, "font": "mono", "tone": "accent"},
        {"text": "requests per second, with p95 latency down from 310 to 180 ms", "role": "body", "tone": "muted"}]}}]}})

# 5 architecture
S.append({"id": "architecture", "message": "Every request flows through one router to the right model", "compose": {"grid": "12x8", "items": [
    head("Platform", "Architecture", "How a request flows today. The model router is new this year.", at="c1-11 r1-2"),
    {"at": "c1-12 r3-6", "diagram": {"grammar": "flow", "nodes": [
        {"id": "apps", "label": "Client apps"}, {"id": "gw", "label": "API gateway"}, {"id": "router", "label": "Model router", "emphasis": "accent"},
        {"id": "pool", "label": "Inference pool"}, {"id": "vec", "label": "Vector store"}],
        "edges": [{"from": "apps", "to": "gw"}, {"from": "gw", "to": "router"}, {"from": "router", "to": "pool"}, {"from": "pool", "to": "vec"}]}},
    {"at": "c1-12 r7-8", "row": {"gap": "space.2", "items": [
        check("Stateless services, autoscaled", role="body"), check("Traced end to end", role="body"), check("Canary deploys on every change", role="body")]}}]}})

# 6 reliability timeline
quarters = [("Q1 2026", "Foundation", "done", ["Gateway v2", "Distributed tracing", "SLOs per service", "On-call rotation"]),
            ("Q2 2026", "Scale", "done", ["Autoscaling", "GPU pool", "Caching layer", "Load tests"]),
            ("Q3 2026", "Intelligence", "done", ["Model router", "Eval suite", "Cost dashboards", "Canary deploys"]),
            ("Q4 2026", "Resilience", "now", ["Multi-region", "Vector store v2", "Chaos tests", "SOC 2 prep"])]


def node(state):
    if state == "done":
        return {"icon": "circle-check", "tone": "green", "width": 34, "height": 34}
    return {"column": {"surface": "dot-indigo", "width": 34, "height": 34, "align": "center", "justify": "center", "items": [
        {"icon": "circle-dot", "tone": "card", "width": 20, "height": 20}]}}


mark = {"done": ("circle-check", "green"), "now": ("circle-dot", "indigo")}
S.append({"id": "reliability", "message": "Three quarters shipped; Q4 resilience work is under way", "compose": {"grid": "12x8", "items": [
    head("Reliability", "Milestones", "Quarter by quarter, from foundation to resilience.", at="c1-10 r1-2"),
    {"at": "c1-12 r3", "row": {"gap": "space.2", "items": [
        {"column": {"gap": "space.0.5", "align": "center", "items": [{"text": q, "role": "h3", "font": "mono", "align": "center"}, {"text": l, "role": "small", "tone": "muted", "align": "center"}]}} for q, l, _, _ in quarters]}},
    {"at": "c1-9 r4", "column": {"justify": "center", "items": [{"shape": "rect", "fill": "green", "height": 4}]}},
    {"at": "c10-12 r4", "column": {"justify": "center", "items": [{"shape": "rect", "fill": "indigo", "height": 4}]}},
    {"at": "c1-12 r4", "row": {"gap": "space.2", "items": [{"column": {"align": "center", "justify": "center", "items": [node(s)]}} for _, _, s, _ in quarters]}},
    {"at": "c1-12 r5-8", "row": {"gap": "space.2", "items": [
        {"column": {"gap": "space.1.5", "items": [check(x, icon=mark[s][0], tone=mark[s][1]) for x in xs]}} for _, _, s, xs in quarters]}}]}})

# 7 capabilities
feats = [("trending-up", "indigo-tint", "indigo", "Autoscaling", "Scales on queue depth, not CPU"),
         ("route", "cyan-tint", "cyan", "Model routing", "Right model for each request"),
         ("activity", "violet-tint", "violet", "Observability", "Traces, metrics and logs in one place"),
         ("database-zap", "amber-tint", "amber", "Smart caching", "Repeat prompts served in milliseconds"),
         ("shield-check", "green-tint", "green", "Security", "Scoped keys, audit trail, PII redaction"),
         ("gauge", "rose-tint", "rose", "Cost controls", "Budgets and alerts per team")]
S.append({"id": "capabilities", "message": "Six capabilities every team now gets by default", "compose": {"grid": "12x8", "items": [
    head("Platform", "Capabilities", "What every team gets by default.", at="c1-10 r1-2"),
    {"at": "c1-12 r3-5", "row": {"gap": "space.2", "items": [{"use": "feature", "icon": i, "fill": f, "tone": t, "title": ti, "detail": d} for i, f, t, ti, d in feats[:3]]}},
    {"at": "c1-12 r6-8", "row": {"gap": "space.2", "items": [{"use": "feature", "icon": i, "fill": f, "tone": t, "title": ti, "detail": d} for i, f, t, ti, d in feats[3:]]}}]}})

# 8 roadmap
lanes = [("globe", "indigo", "Multi-region active-active", "c5-8", "indigo"),
         ("cpu", "cyan", "GPU pooling v2", "c6-9", "cyan"),
         ("flask-conical", "violet", "Eval pipeline", "c7-11", "violet"),
         ("brain-circuit", "indigo", "Fine-tuning service", "c9-12", "indigo"),
         ("radar", "cyan", "Edge inference", "c10-13", "cyan"),
         ("lock", "violet", "SOC 2 Type II", "c11-13", "violet")]
gantt = [{"at": "c5-13 r2-7", "surface": "track", "space": "space.1"},
         {"at": "c5-7 r1", "text": "Q1 2027", "role": "body", "font": "mono", "weight": 600, "align": "center", "valign": "middle"},
         {"at": "c8-10 r1", "text": "Q2 2027", "role": "body", "font": "mono", "weight": 600, "align": "center", "valign": "middle"},
         {"at": "c11-13 r1", "text": "Q3 2027", "role": "body", "font": "mono", "weight": 600, "align": "center", "valign": "middle"}]
for k, (icon, tone, label, span, fill) in enumerate(lanes):
    r = k + 2
    gantt.append({"at": f"c1-4 r{r}", "row": {"gap": "space.1.5", "align": "center", "items": [
        {"icon": icon, "tone": tone, "width": 22, "height": 22}, {"text": label, "role": "body"}]}})
    gantt.append({"at": f"{span} r{r}", "column": {"justify": "center", "items": [{"shape": "roundRect", "fill": fill, "radius": 8, "height": 22}]}})
S.append({"id": "roadmap", "message": "Six workstreams take the platform multi-region by Q3 2027", "compose": {"grid": "12x8", "items": [
    head("Roadmap", "2027", "Six workstreams, three quarters.", at="c1-10 r1-2"),
    {"at": "c1-12 r3-8", "grid": "13x7", "items": gantt}]}})

# 9 asks
risks = [("GPU supply", "Lead times up to 12 weeks"), ("Vendor lock-in", "Two providers carry 80% of traffic"),
         ("On-call load", "Pages up 30% since Q2"), ("Data residency", "EU customers need in-region inference")]
needs = [("Two SREs", "For multi-region and on-call"), ("GPU budget for H1", "Reserved capacity, not spot"),
         ("Security review", "Before SOC 2 Type II"), ("Product input", "Priorities for fine-tuning")]
S.append({"id": "asks", "message": "Four risks to manage, and four things we need to manage them", "compose": {"grid": "12x8", "items": [
    head("Risks &", "Asks", "What could slow us down, and what would help.", at="c1-11 r1-2"),
    {"at": "c1-6 r3-8", "surface": "rose", "column": {"gap": "space.2", "items": [
        {"row": {"gap": "space.1.5", "align": "center", "items": [{"icon": "triangle-alert", "tone": "rose", "width": 26, "height": 26}, {"text": "Risks", "role": "h3", "tone": "rose"}]}},
        *[{"use": "item", "icon": "circle-dot", "tone": "rose", "title": t, "detail": d} for t, d in risks]]}},
    {"at": "c7-12 r3-8", "surface": "mint", "column": {"gap": "space.2", "items": [
        {"row": {"gap": "space.1.5", "align": "center", "items": [{"icon": "rocket", "tone": "green", "width": 26, "height": 26}, {"text": "What we need", "role": "h3", "tone": "green"}]}},
        *[{"use": "item", "icon": "circle-check", "tone": "green", "title": t, "detail": d} for t, d in needs]]}}]}})

json.dump(intent, open(OUT, "w"), indent=2, ensure_ascii=False)
print("slides:", len(S))
