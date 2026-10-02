"""MySlideAgent capability showcase: five slides that each belong to a different
presentation, built from one intent.

    python3 showcase.py            # write intent.json, build into out/, print the verdict
    python3 showcase.py --finalize # also finalize (render, validate, rebuild, export)

Each slide carries its own visual system inside the shared palette:

1. Executive dashboard: cool light grey, white cards, Avenir Next, status colour.
2. Architecture review: night navy under a glow, Helvetica Neue and Menlo, domain colours.
3. Data story: warm paper, Charter headlines, ink data with a single coral signal.
4. Product keynote: white light, oversized Helvetica Neue, a native device mockup.
5. Transformation roadmap: Futura and Gill Sans, chevrons, a maturity ramp and a Gantt.

Geometry for diagrams, mockups and dashboards is art-directed in page inches
(`_abs`) and converted to grid units relative to each parent frame; text
inside every card is still measured and fitted by the engine.
"""

import json
import math
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).parent

PAGE_W, PAGE_H = 13.3333, 7.5
MARGIN = 0.5
CONTENT = (MARGIN, MARGIN, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN)
COLS, ROWS = 12, 6


# ---------------------------------------------------------------- helpers

def rel(frame, a):
    fx, fy, fw, fh = frame
    ux, uy = fw / COLS, fh / ROWS
    x, y, w, h = a
    return [round((x - fx) / ux, 4), round((y - fy) / uy, 4), round(w / ux, 4), round(h / uy, 4)]


def resolve(node, frame):
    """Turn `_abs` page-inch boxes into grid-unit boxes relative to the parent."""
    own = frame
    if "_abs" in node:
        a = node.pop("_abs")
        node["box"] = rel(frame, a)
        own = a
    for kind in ("free", "row", "column", "layer"):
        inner = node.get(kind)
        if isinstance(inner, dict):
            for child in inner.get("items", []):
                resolve(child, own if kind == "free" else frame)
    return node


def T(a, text, role="body", **kw):
    return {"_abs": a, "text": text, "role": role, **kw}


def S(a, preset="rect", **kw):
    return {"_abs": a, "shape": preset, "decorative": True, **kw}


def P(a, path, **kw):
    return {"_abs": a, "shape": {"path": path}, "decorative": True, **kw}


def free(a, items, surface=None, **kw):
    node = {"_abs": a, "free": {"items": items}, **kw}
    if surface:
        node["surface"] = surface
    return node


def box(a, surface, kind, items, **kw):
    return {"_abs": a, "surface": surface, kind: {"items": items, **kw}}


def icon(name, tone, size, **kw):
    return {"icon": name, "tone": tone, "size": size, "width": size, "height": size, **kw}


def hline(x1, x2, y, fill, weight=1.25, **kw):
    t = weight / 72
    return S((x1, y - t / 2, x2 - x1, t), fill=fill, **kw)


def vline(x, y1, y2, fill, weight=1.25, **kw):
    t = weight / 72
    return S((x - t / 2, y1, t, y2 - y1), fill=fill, **kw)


def arrow_right(x_tip, y, fill, size=0.075, **kw):
    return P((x_tip - size, y - size * 0.6, size, size * 1.2), "M0 0 L1 0.5 L0 1 Z", fill=fill, **kw)


def ring(cx, cy, d, pct, color, track, weight):
    """A progress ring: a track circle and a native arc, both editable."""
    theta = 2 * math.pi * pct
    ex, ey = 0.5 + 0.5 * math.sin(theta), 0.5 - 0.5 * math.cos(theta)
    large = 1 if pct > 0.5 else 0
    a = (cx - d / 2, cy - d / 2, d, d)
    return [
        S(a, "ellipse", fill="none", stroke=track, strokeWidth=weight),
        P(a, f"M0.5 0 A0.5 0.5 0 {large} 1 {ex:.4f} {ey:.4f}", fill="none", stroke=color, strokeWidth=weight),
    ]


# ================================================================ SLIDE 1
# Executive / PM dashboard. Avenir Next; white cards on cool grey; status colour carries meaning.

A = "Avenir Next"


def s1_text(a, text, role="small", **kw):
    return T(a, text, role, font=A, **kw)


def s1_pill(a, text, fill, tone):
    return box(a, {"fill": fill, "radius": 100}, "column", [
        {"text": text, "role": "caption", "size": 10, "font": A, "weight": "bold", "tone": tone, "align": "center"}],
        justify="center")


def s1_chip(a, name, fill, tone, size=13):
    return box(a, {"fill": fill, "radius": 7}, "column", [icon(name, tone, size)], align="center", justify="center")


def s1_kpi(x, label, value, note, pct, color):
    card = (x, 2.0, 2.933, 1.3)
    return free(card, [
        s1_text((x + 0.26, 2.2, 1.7, 0.26), label, "small", size=12, tone="s1slate"),
        s1_text((x + 0.26, 2.44, 1.7, 0.62), value, "display", size=36, weight="bold", tone="s1navy"),
        s1_text((x + 0.26, 2.98, 1.85, 0.24), note, "caption", size=11, tone="s1slate"),
        *ring(x + 2.27, 2.65, 0.82, pct, color, "s1track", 7),
    ], surface={"fill": "s1white", "radius": 10, "shadow": "soft"})


def s1_stream(cy, name, glyph, pct, color, soft, status, status_fill, status_tone):
    return [
        s1_chip((0.78, cy - 0.17, 0.34, 0.34), glyph, soft, {"s1amber": "s1amberIcon"}.get(color, color)),
        s1_text((1.24, cy - 0.15, 1.45, 0.3), name, "small", size=12.5, tone="s1navy", valign="middle"),
        S((2.75, cy - 0.05, 2.3, 0.1), "roundRect", fill="s1track", radius=3),
        S((2.75, cy - 0.05, 2.3 * pct, 0.1), "roundRect", fill=color, radius=3),
        s1_text((5.08, cy - 0.15, 0.55, 0.3), f"{round(pct * 100)}%", "small", size=12.5, weight="bold", tone="s1navy", align="right", valign="middle"),
        s1_pill((5.72, cy - 0.12, 0.66, 0.24), status, status_fill, status_tone),
    ]


def s1_milestone(x, date, name, status, kind):
    items = [s1_text((x - 0.8, 4.02, 1.6, 0.24), date, "caption", size=10.5, tone="s1slate", align="center")]
    if kind == "done":
        items.append(box((x - 0.15, 4.45 - 0.15, 0.3, 0.3), {"fill": "s1green", "radius": 100}, "column",
                         [icon("check", "s1white", 12, strokeWidth=3)], align="center", justify="center"))
        tone = "s1greenText"
    elif kind == "now":
        items.append(S((x - 0.25, 4.2, 0.5, 0.5), "ellipse", fill="s1blueSoft"))
        items.append(S((x - 0.15, 4.3, 0.3, 0.3), "ellipse", fill="s1blue"))
        items.append(S((x - 0.05, 4.4, 0.1, 0.1), "ellipse", fill="s1white"))
        tone = "s1blue"
    else:
        items.append(S((x - 0.13, 4.32, 0.26, 0.26), "ellipse", fill="s1white", stroke="s1planned", strokeWidth=1.75))
        tone = "s1slate"
    items.append(s1_text((x - 0.85, 4.72, 1.7, 0.28), name, "small", size=13, weight="bold", tone="s1navy", align="center"))
    items.append(s1_text((x - 0.85, 4.99, 1.7, 0.24), status, "caption", size=10.5, tone=tone, align="center"))
    return items


S1 = {
    "id": "executive-dashboard",
    "message": "Project Atlas is on track; GPU capacity is the one risk to the Q2 launch",
    "background": "s1bg",
    "notes": "Executive / project-management dashboard: KPI cards, progress rings, workstream bars, a milestone timeline, the key risk and the decision needed.",
    "compose": {"free": {"items": [
        # Header
        {"_abs": (0.5, 0.53, 0.26, 0.26), **icon("mountain", "s1blue", 18)},
        s1_text((0.84, 0.5, 1.5, 0.3), "ATLAS", "label", size=12, weight="bold", tone="s1navy", tracking=0.25, valign="middle"),
        s1_text((6.83, 0.5, 6.0, 0.3), "Q4 2024     |     Steering Committee     |     28 Nov", "label", size=11, tone="s1slate", align="right", valign="middle"),
        s1_text((0.5, 0.9, 10.0, 0.62), "Project Atlas — Q4 Executive Status", "title", size=30, weight="bold", tone="s1navy"),
        s1_text((0.5, 1.5, 10.0, 0.32), "Building the next-generation AI platform for a more productive enterprise", "small", size=13, tone="s1slate"),

        # KPI strip
        free((0.5, 2.0, 2.933, 1.3), [
            {"_abs": (0.76, 2.4, 0.5, 0.5), **icon("circle-check", "s1greenText", 36, strokeWidth=2.25)},
            s1_text((1.42, 2.24, 1.9, 0.4), "ON TRACK", "h3", size=20, weight="bold", tone="s1greenText", tracking=0.04),
            s1_text((1.42, 2.63, 1.9, 0.28), "Overall project health", "small", size=12, tone="s1navy"),
            s1_text((1.42, 2.88, 1.9, 0.26), "Unchanged since Q3", "caption", size=10.5, tone="s1slate"),
        ], surface={"fill": "s1greenSoft", "radius": 10}),
        s1_kpi(3.633, "Completion", "72%", "of scope delivered", 0.72, "s1blue"),
        s1_kpi(6.767, "Budget used", "64%", "$4.1M of $6.4M", 0.64, "s1violet"),
        box((9.9, 2.0, 2.933, 1.3), {"fill": "s1navy", "radius": 10, "shadow": "soft"}, "column", [
            {"text": "BOTTOM LINE", "role": "label", "size": 10, "font": A, "weight": "bold", "tone": "s1sky", "tracking": 0.2},
            {"text": "MVP ships on time. GPU capacity is the one risk to a Q2 launch.", "role": "body", "size": 14, "font": A, "weight": "bold", "tone": "s1white", "leading": 1.25},
        ], pad=[0, 18, 0, 18], gap=6, justify="center"),

        # Workstreams
        free((0.5, 3.5, 6.1, 1.9), [
            s1_text((0.78, 3.66, 3.5, 0.32), "Workstream progress", "h3", size=15, weight="bold", tone="s1navy"),
            s1_text((3.8, 3.69, 2.58, 0.28), "% complete  ·  status", "caption", size=10, tone="s1slate", align="right"),
            *s1_stream(4.25, "Product", "package", 0.82, "s1blue", "s1blueSoft", "On track", "s1greenSoft", "s1greenText"),
            *s1_stream(4.68, "Engineering", "code", 0.74, "s1violet", "s1violetSoft", "On track", "s1greenSoft", "s1greenText"),
            *s1_stream(5.11, "Go-to-Market", "megaphone", 0.58, "s1amber", "s1amberSoft", "Watch", "s1amberSoft", "s1amberText"),
        ], surface={"fill": "s1white", "radius": 10, "shadow": "soft"}),

        # Milestones
        free((6.8, 3.5, 6.033, 1.9), [
            s1_text((7.08, 3.66, 3.5, 0.32), "Key milestones", "h3", size=15, weight="bold", tone="s1navy"),
            S((7.2, 4.425, 5.25, 0.05), "roundRect", fill="s1track", radius=2),
            S((7.2, 4.425, 2.19, 0.05), "roundRect", fill="s1blue", radius=2),
            *s1_milestone(7.75, "Sep 30", "Foundation", "Complete", "done"),
            *s1_milestone(9.85, "Dec 15", "MVP release", "In progress", "now"),
            *s1_milestone(11.95, "Feb 15", "Public beta", "Planned", "next"),
            box((9.06, 4.34, 0.58, 0.22), {"fill": "s1navy", "radius": 100}, "column", [
                {"text": "TODAY", "role": "caption", "size": 10, "font": A, "weight": "bold", "tone": "s1white", "align": "center", "tracking": 0.05}],
                justify="center"),
        ], surface={"fill": "s1white", "radius": 10, "shadow": "soft"}),

        # Risk and decision
        free((0.5, 5.6, 6.1, 1.4), [
            s1_chip((0.78, 5.86, 0.46, 0.46), "triangle-alert", "s1white", "s1red", size=19),
            s1_text((1.44, 5.83, 1.3, 0.26), "KEY RISK", "label", size=10.5, weight="bold", tone="s1redText", tracking=0.15, valign="middle"),
            s1_pill((2.5, 5.84, 0.78, 0.24), "Medium", "s1amberPill", "s1amberText"),
            s1_text((1.44, 6.12, 4.95, 0.5), "GPU capacity from our third-party provider is not yet confirmed for Q1", "small", size=13.5, weight="bold", tone="s1navy", leading=1.2),
            s1_text((1.44, 6.63, 4.95, 0.26), "If unresolved, the public beta slips four to six weeks", "caption", size=11, tone="s1slate"),
        ], surface={"fill": "s1redSoft", "radius": 10}),
        free((6.8, 5.6, 6.033, 1.4), [
            s1_chip((7.08, 5.86, 0.46, 0.46), "gavel", "s1white", "s1blue", size=19),
            s1_text((7.74, 5.83, 1.6, 0.26), "NEXT DECISION", "label", size=10.5, weight="bold", tone="s1blue", tracking=0.15, valign="middle"),
            s1_pill((9.38, 5.84, 0.9, 0.24), "By Dec 6", "s1white", "s1blue"),
            s1_text((7.74, 6.12, 4.85, 0.5), "Approve a $0.6M reserve for dedicated GPU capacity", "small", size=13.5, weight="bold", tone="s1navy", leading=1.2),
            s1_text((7.74, 6.63, 4.85, 0.26), "Secures the Feb 15 beta and de-risks the Q2 launch", "caption", size=11, tone="s1slate"),
        ], surface={"fill": "s1blueSoft", "radius": 10}),
    ]}},
}


# ================================================================ SLIDE 2
# Architecture review. Night navy, Helvetica Neue with Menlo tags, domain-coloured wiring.

H = "Helvetica Neue"
M = "Menlo"


def s2_node(a, glyph, name, detail, tone, stroke, fill="s2node", size=16):
    return box(a, {"fill": fill, "stroke": stroke, "strokeWidth": 1, "radius": 8}, "row", [
        icon(glyph, tone, size),
        {"column": {"gap": 1, "justify": "center", "grow": 1, "items": [
            {"text": name, "role": "small", "size": 12, "font": H, "weight": "bold", "tone": "s2frost"},
            {"text": detail, "role": "caption", "size": 10, "font": H, "tone": "s2haze"}]}},
    ], pad=[0, 9, 0, 9], gap=8, align="center")


def s2_stack(a, glyph, name, detail, tone, stroke, fill="s2node"):
    return box(a, {"fill": fill, "stroke": stroke, "strokeWidth": 1, "radius": 10}, "column", [
        icon(glyph, tone, 22),
        {"text": name, "role": "small", "size": 12, "font": H, "weight": "bold", "tone": "s2frost", "align": "center"},
        *([{"text": detail, "role": "caption", "size": 10, "font": H, "tone": "s2haze", "align": "center"}] if detail else []),
    ], pad=[6, 8, 6, 8], gap=4, align="center", justify="center")


def s2_group(a, label, stroke, tone):
    x, y, w, h = a
    return [
        S(a, "roundRect", fill="s2group", stroke=stroke, strokeWidth=1, radius=12, opacity=0.55),
        T((x + 0.14, y + 0.06, w - 0.28, 0.22), label, "label", size=10, font=M, tone=tone, tracking=0.12),
    ]


def s2_wire(x1, x2, y, tone, head=True):
    items = [hline(x1, x2 - (0.06 if head else 0), y, tone, opacity=0.8)]
    if head:
        items.append(arrow_right(x2, y, tone))
    return items


def s2_fan(x_from, y_from, x_bus, x_to, ys, tone):
    items = [hline(x_from, x_bus, y_from, tone, opacity=0.8), vline(x_bus, min(ys + [y_from]), max(ys + [y_from]), tone, opacity=0.8)]
    for y in ys:
        items += s2_wire(x_bus, x_to, y, tone)
    return items


def s2_legend(x, tone, label):
    return [S((x, 1.165, 0.09, 0.09), "ellipse", fill=tone), T((x + 0.14, 1.09, 1.1, 0.24), label, "caption", size=10, font=H, tone="s2haze", valign="middle")]


S2_SERVICES = [  # name, glyph, detail, centre y, tone, stroke
    ("AI orchestrator", "brain-circuit", "Agents · tools · memory", 2.61, "s2violet", "s2violet"),
    ("Authentication", "shield-check", "OIDC · RBAC · SSO", 3.45, "s2sky", "s2skyDim"),
    ("Notifications", "bell-ring", "Push · email · SMS", 4.27, "s2amber", "s2amberDim"),
    ("Data service", "database-zap", "Queries · cache · files", 5.08, "s2teal", "s2tealDim"),
]
S2_AI = [("LLM providers", "sparkles", "Claude · GPT · open models"), ("Vector database", "layers", "pgvector · embeddings"), ("Tool / MCP services", "plug-zap", "MCP servers · internal APIs")]
S2_DATA = [("PostgreSQL", "database", "Primary + 2 read replicas"), ("Redis", "zap", "Cache · sessions · queues"), ("Object storage", "hard-drive", "S3 · documents & media")]
S2_INFRA = [("Kubernetes", "container", "EKS · autoscaling node pools", "s2sky"), ("Observability", "activity", "OpenTelemetry · metrics, logs, traces", "s2violet"), ("CI/CD", "git-branch", "GitHub Actions · Argo CD · canary", "s2teal")]

s2_items = [
    {"_abs": CONTENT, "bleed": ["left", "right", "top", "bottom"], "image": {"asset": "assets/night-glow.png", "fit": "cover"}, "decorative": True},
    {"_abs": (0.5, 1.5, 12.333, 5.5), "texture": "blueprint"},
    # Header
    T((0.5, 0.46, 8.6, 0.56), "AI Platform — Production Architecture", "title", size=28, font=H, weight="bold", tone="s2frost"),
    T((0.5, 0.99, 7.6, 0.3), "Scalable, secure and modular architecture for AI-powered applications", "small", size=13, font=H, tone="s2haze"),
    T((9.0, 0.5, 3.833, 0.25), "ARCHITECTURE REVIEW", "label", size=10, font=M, tone="s2sky", tracking=0.2, align="right"),
    T((9.0, 0.75, 3.833, 0.25), "rev 2.3  ·  prod / us-east-1", "caption", size=10, font=M, tone="s2haze", align="right"),
    *s2_legend(9.05, "s2sky", "Request path"), *s2_legend(10.3, "s2violet", "AI runtime"), *s2_legend(11.55, "s2teal", "Data plane"),
    # Groups
    *s2_group((1.6, 2.62, 1.76, 2.38), "CLIENTS", "s2edge", "s2haze"),
    *s2_group((5.3, 1.95, 4.3, 3.6), "CORE SERVICES  ·  ns/platform", "s2edge", "s2haze"),
    *s2_group((9.85, 1.55, 2.983, 2.11), "AI RUNTIME", "s2violetDim", "s2violet"),
    *s2_group((9.85, 3.86, 2.983, 2.1), "DATA PLANE", "s2tealDim", "s2teal"),
    T((3.6, 3.04, 1.4, 0.22), "EDGE", "label", size=10, font=M, tone="s2haze", tracking=0.12, align="center"),
    # Wiring (drawn under the nodes)
    *s2_fan(1.35, 3.85, 1.48, 1.72, [3.3, 4.4], "s2sky"),
    hline(3.27, 3.45, 3.3, "s2sky", opacity=0.8), hline(3.27, 3.45, 4.4, "s2sky", opacity=0.8), vline(3.45, 3.3, 4.4, "s2sky", opacity=0.8),
    *s2_wire(3.45, 3.6, 3.85, "s2sky"),
    *s2_wire(5.0, 5.45, 3.85, "s2sky"),
    *s2_fan(6.95, 3.85, 7.13, 7.3, [c[3] for c in S2_SERVICES], "s2sky"),
    *s2_fan(9.46, 2.61, 9.68, 10.0, [2.15, 2.73, 3.31], "s2violet"),
    *s2_fan(9.46, 5.08, 9.68, 10.0, [4.45, 5.03, 5.61], "s2teal"),
    # Request path
    s2_stack((0.5, 3.35, 0.85, 1.0), "users", "Users", None, "s2sky", "s2skyDim"),
    s2_node((1.72, 3.0, 1.55, 0.6), "monitor", "Web app", "React · Next.js", "s2sky", "s2skyDim"),
    s2_node((1.72, 4.1, 1.55, 0.6), "smartphone", "Mobile app", "iOS · Android", "s2sky", "s2skyDim"),
    s2_stack((3.6, 3.3, 1.4, 1.1), "waypoints", "API Gateway", "Routing · rate limits", "s2sky", "s2skyDim"),
    s2_stack((5.45, 3.17, 1.5, 1.36), "boxes", "Application services", "Microservices · gRPC", "s2sky", "s2skyDim"),
    # Orchestrator halo, then the four services
    S((7.2, 2.23, 2.36, 0.76), "roundRect", fill="s2violet", radius=14, opacity=0.14),
]
for name, glyph, detail, cy, tone, stroke in S2_SERVICES:
    fill = "s2orch" if glyph == "brain-circuit" else "s2node"
    s2_items.append(s2_node((7.3, cy - 0.28, 2.16, 0.56), glyph, name, detail, tone, stroke, fill=fill))
for k, (name, glyph, detail) in enumerate(S2_AI):
    s2_items.append(s2_node((10.0, 1.9 + k * 0.58, 2.68, 0.5), glyph, name, detail, "s2violet", "s2violetDim"))
for k, (name, glyph, detail) in enumerate(S2_DATA):
    s2_items.append(s2_node((10.0, 4.2 + k * 0.58, 2.68, 0.5), glyph, name, detail, "s2teal", "s2tealDim"))
s2_items.append(free((0.5, 6.12, 12.333, 0.88), [
    T((0.72, 6.24, 2.1, 0.24), "INFRASTRUCTURE LAYER", "label", size=10, font=M, tone="s2sky", tracking=0.12),
    T((0.72, 6.48, 2.0, 0.42), "Runs, observes and ships everything above", "caption", size=10, font=H, tone="s2haze"),
    *[s2_node((2.95 + k * 3.33, 6.24, 3.12, 0.64), glyph, name, detail, tone, "s2edge", fill="s2node2", size=18)
      for k, (name, glyph, detail, tone) in enumerate(S2_INFRA)],
], surface={"fill": "s2band", "stroke": "s2edge", "strokeWidth": 1, "radius": 10}))

S2 = {
    "id": "architecture",
    "message": "Every request flows through one gateway into a service tier that fans out to the AI runtime and the data plane",
    "background": "s2night",
    "notes": "Technical architecture: grouped system boundaries, orthogonal routed wiring, domain colour coding, icons, an infrastructure layer.",
    "compose": {"free": {"items": s2_items}},
}


# ================================================================ SLIDE 3
# Data story. Warm paper, Charter, ink data with one coral signal; no cards, hairlines only.

C = "Charter"


def s3_panel_head(x, w, n, label, heading, value, note):
    return [
        T((x, 2.08, w, 0.25), f"{n}    {label}", "label", size=10.5, font=H, weight="bold", tone="s3coral", tracking=0.16),
        T((x, 2.36, w, 0.38), heading, "h3", size=17, font=C, weight="bold", tone="s3ink"),
        T((x, 2.76, 1.95, 0.72), value, "display", size=44, font=C, weight="bold", tone="s3ink"),
        T((x + 1.98, 2.88, w - 1.98, 0.52), note, "small", size=12, font=H, tone="s3stone", leading=1.3),
    ]


S3_RETENTION = [100, 82, 72, 67, 64, 62]


def s3_retention():
    """The retention curve drawn from the data as native vector geometry, so the
    axis stops at 100% and the annotations sit exactly on the line."""
    x0, y0, w, h = 6.05, 3.78, 2.7, 1.66
    pts = [(k / 5, (100 - v) / 100) for k, v in enumerate(S3_RETENTION)]
    line = "M" + " L".join(f"{x:.3f} {y:.3f}" for x, y in pts)
    area = line + " L1 1 L0 1 Z"
    at = lambda k: (x0 + pts[k][0] * w, y0 + pts[k][1] * h)
    items = [
        P((x0, y0, w, h), area, fill="s3wash"),
        hline(x0, x0 + w, y0 + h, "s3stone", weight=0.75),
        hline(x0, x0 + w, y0, "s3hair", weight=0.5),
        T((x0 - 0.5, y0 - 0.1, 0.4, 0.2), "100", "caption", size=10, font=H, tone="s3stone", align="right"),
        T((x0 - 0.5, y0 + h - 0.11, 0.4, 0.2), "0", "caption", size=10, font=H, tone="s3stone", align="right"),
        P((x0, y0, w, h), line, fill="none", stroke="s3ink", strokeWidth=2),
    ]
    for k in range(6):
        x, y = at(k)
        last = k == 5
        d = 0.13 if last else 0.08
        items.append(S((x - d / 2, y - d / 2, d, d), "ellipse", fill="s3coral" if last else "s3ink"))
        items.append(T((x - 0.25, y0 + h + 0.05, 0.5, 0.22), f"M{k + 1}", "caption", size=10, font=H, tone="s3stone", align="center"))
    x3, y3 = at(2)
    x6, y6 = at(5)
    items += [
        hline(x3, x6, y3 - 0.17, "s3coral", weight=1),
        vline(x3, y3 - 0.17, y3 - 0.09, "s3coral", weight=1),
        vline(x6, y3 - 0.17, y6 - 0.12, "s3coral", weight=1),
        T((x3 - 0.05, y3 - 0.44, 2.0, 0.24), "−10 pts in three months", "caption", size=10.5, font=H, weight="bold", tone="s3coral"),
        T((x6 - 0.4, y6 + 0.1, 0.55, 0.22), "62%", "caption", size=10.5, font=H, weight="bold", tone="s3coral", align="right"),
    ]
    return items


S3_FUNNEL = [("Visitors", 100, "100K"), ("Sign-ups", 32, "32K  ·  32%"), ("Activated", 21, "21K  ·  66%"), ("Paid", 8.4, "8.4K  ·  40%")]


def s3_funnel():
    items = []
    x_bar, max_w = 10.4, 1.85
    for k, (label, value, text) in enumerate(S3_FUNNEL):
        y = 3.62 + k * 0.55
        w = max_w * value / 100
        hot = label == "Activated"
        items.append(T((9.4, y + 0.03, 0.95, 0.28), label, "small", size=12, font=H, tone="s3ink", valign="middle"))
        items.append(S((x_bar, y, w, 0.34), fill="s3coral" if hot else "s3ink"))
        end = x_bar + w
        if hot:
            lost = max_w * (32 - 21) / 100
            items.append(S((end, y, lost, 0.34), fill="s3coralSoft", stroke="s3coral", strokeWidth=1))
            items.append(T((end - 0.05, y + 0.35, 1.2, 0.2), "11K lost", "caption", size=10, font=H, weight="bold", tone="s3coral"))
            end += lost
        items.append(T((end + 0.08, y + 0.03, 12.833 - end - 0.08, 0.28), text, "small", size=12, font=H,
                       weight="bold" if hot else "regular", tone="s3coral" if hot else "s3ink", valign="middle"))
    return items


S3 = {
    "id": "data-story",
    "message": "Acquisition is accelerating, but activation remains the biggest growth lever",
    "background": "s3paper",
    "notes": "Data storytelling: three numbered acts read left to right — a highlighted column chart, a retention curve and a proportional funnel — resolving into one takeaway band.",
    "compose": {"free": {"items": [
        T((0.5, 0.5, 8.0, 0.25), "PRODUCT ANALYTICS  ·  JANUARY – JUNE 2024", "label", size=10.5, font=H, weight="bold", tone="s3coral", tracking=0.18),
        T((0.5, 0.76, 11.0, 0.64), "From growth to retention: what the data tells us", "title", size=32, font=C, weight="bold", tone="s3ink"),
        T((0.5, 1.38, 10.0, 0.34), "Six months of product data, three signals, and one decision.", "lead", size=15, font=C, italic=True, tone="s3stone"),
        hline(0.5, 12.833, 1.86, "s3ink", weight=1),
        vline(5.5, 2.1, 5.82, "s3hair", weight=0.75),
        vline(9.15, 2.1, 5.82, "s3hair", weight=0.75),
        # 01 Acquisition
        *s3_panel_head(0.5, 4.75, "01", "ACQUISITION", "Users are arriving faster every month", "+88%", "monthly active users,\n42K in January, 79K in June"),
        {"_abs": (0.4, 3.52, 4.9, 2.36), "chart": {"data": "mau", "chart": "column", "highlight": "Jun", "labels": "outside", "axis": "hairline",
                                                     "alt": "Monthly active users in thousands, January to June: 42, 47, 53, 61, 68, 79; June highlighted"}},
        # 02 Retention
        *s3_panel_head(5.75, 3.15, "02", "RETENTION", "Cohorts settle by month 3", "62%", "still active\nat month 6"),
        *s3_retention(),
        # 03 Activation
        *s3_panel_head(9.4, 3.433, "03", "ACTIVATION", "Activation is the leak", "8.4%", "of visitors become\npaying customers"),
        *s3_funnel(),
        # Takeaway band
        S((0.5, 6.12, 12.333, 0.88), bleed=["left", "right", "bottom"], fill="s3ink"),
        free((0.5, 6.12, 12.333, 0.88), [
            T((0.5, 6.56, 1.6, 0.25), "THE TAKEAWAY", "label", size=10.5, font=H, weight="bold", tone="s3coralLight", tracking=0.1),
            T((2.15, 6.44, 6.75, 0.62), "Acquisition is accelerating, but activation remains the biggest growth lever.", "h3", size=19, font=C, weight="bold", tone="s3paper", leading=1.15),
            vline(9.2, 6.46, 7.04, "s3stone", weight=0.75),
            T((9.4, 6.44, 1.4, 0.6), "+1.8K", "display", size=30, font=C, weight="bold", tone="s3coralLight"),
            T((10.78, 6.46, 2.053, 0.6), "paid users a month if activation rises from 66% to 80%", "caption", size=10.5, font=H, tone="s3paperDim", leading=1.25),
        ], surface={"fill": "s3ink"}),
    ]}},
}


# ================================================================ SLIDE 4
# Product keynote. White light, oversized Helvetica Neue, one violet; the device is native shapes.

def s4_tile(x, glyph, title, detail, tint, tone):
    return box((x, 3.36, 0.9, 1.22), {"fill": "s4white", "stroke": "s4uiLine", "strokeWidth": 0.75, "radius": 8}, "column", [
        {"column": {"surface": {"fill": tint, "radius": 6}, "width": 22, "height": 22, "align": "center", "justify": "center", "items": [icon(glyph, tone, 13)]}},
        {"text": title, "role": "caption", "size": 10.5, "font": H, "weight": "bold", "tone": "s4uiText"},
        {"text": detail, "role": "caption", "size": 10, "font": H, "tone": "s4uiMuted", "leading": 1.15},
    ], pad=[8, 7, 6, 7], gap=4)


S4_NAV = [("house", "Home"), ("search", "Search"), ("library", "Library"), ("bot", "Agents"), ("workflow", "Automations")]

S4 = {
    "id": "product-keynote",
    "message": "NOVA puts research, creation, analysis and automation in one AI workspace",
    "background": "s4white",
    "notes": "Product launch / keynote: oversized type, generous white space, a lit background and a native, fully editable device and UI mockup.",
    "compose": {"free": {"items": [
        {"_abs": CONTENT, "bleed": ["left", "right", "top", "bottom"], "image": {"asset": "assets/keynote-light.png", "fit": "cover"}, "decorative": True},
        # Nav
        box((0.5, 0.55, 0.3, 0.3), {"fill": "s4violet", "radius": 7}, "column", [icon("sparkles", "s4white", 13)], align="center", justify="center"),
        T((0.9, 0.53, 1.3, 0.34), "NOVA", "h3", size=15, font=H, weight="bold", tone="s4ink", tracking=0.14, valign="middle"),
        T((7.3, 0.55, 5.533, 0.3), "Product        Solutions        Pricing        Resources", "caption", size=11, font=H, tone="s4gray", align="right", valign="middle"),
        # Hero copy
        box((0.5, 1.62, 2.9, 0.34), {"fill": "s4lav", "radius": 100}, "row", [
            icon("sparkles", "s4violet", 12),
            {"text": "NOVA  ·  Your AI workspace", "role": "caption", "size": 11, "font": H, "weight": "bold", "tone": "s4violet"}],
            pad=[0, 12, 0, 12], gap=6, align="center"),
        T((0.5, 2.1, 6.4, 0.82), "One workspace.", "title", size=50, font=H, weight="bold", tone="s4ink", leading=1.04, tracking=-0.025),
        T((0.5, 2.82, 6.4, 0.82), "Every idea.", "display", size=50, font=H, weight="bold", tone="s4ink", leading=1.04, tracking=-0.025),
        T((0.5, 3.54, 6.4, 0.82), "Amplified by AI.", "display", size=50, font=H, weight="bold", tone="s4violet", leading=1.04, tracking=-0.025),
        T((0.5, 4.58, 4.7, 0.72), "From idea to execution without leaving your workspace.", "lead", size=17, font=H, tone="s4gray", leading=1.35),
        box((0.5, 5.55, 1.75, 0.5), {"fill": "s4ink", "radius": 100}, "row", [
            {"text": "Get started", "role": "small", "size": 13, "font": H, "weight": "bold", "tone": "s4white", "width": "auto"},
            icon("arrow-right", "s4white", 14)], gap=8, align="center", justify="center"),
        box((2.4, 5.55, 1.95, 0.5), {"fill": "s4white", "stroke": "s4stroke", "strokeWidth": 1, "radius": 100}, "row", [
            icon("circle-play", "s4ink", 15),
            {"text": "Watch the film", "role": "small", "size": 13, "font": H, "tone": "s4ink", "width": "auto"}], gap=8, align="center", justify="center"),
        T((0.5, 6.5, 6.0, 0.28), "Free for teams up to 10   ·   SOC 2 Type II   ·   Works with the tools you use", "caption", size=10.5, font=H, tone="s4gray"),
        # Device
        S((6.9, 5.22, 5.75, 0.2), "ellipse", fill="s4ink", opacity=0.08),
        S((6.95, 1.45, 5.6, 3.72), "roundRect", fill="s4bezel", radius=16),
        S((9.73, 1.5, 0.04, 0.04), "ellipse", fill="s4cam"),
        S((6.66, 5.15, 6.173, 0.14), "roundRect", fill="s4base", radius=5),
        S((9.35, 5.15, 0.8, 0.05), "roundRect", fill="s4baseDark", radius=2),
        free((7.07, 1.58, 5.36, 3.47), [
            # Sidebar
            free((7.07, 1.58, 1.3, 3.47), [
                T((7.2, 1.7, 1.0, 0.24), "NOVA", "caption", size=11, font=H, weight="bold", tone="s4violet", tracking=0.12),
                box((7.19, 2.02, 1.06, 0.26), {"fill": "s4lav", "radius": 6}, "row", [
                    icon("plus", "s4violet", 10), {"text": "New chat", "role": "caption", "size": 10, "font": H, "weight": "bold", "tone": "s4violet"}],
                    pad=[0, 8, 0, 8], gap=4, align="center"),
                *[x for k, (glyph, label) in enumerate(S4_NAV) for x in (
                    {"_abs": (7.24, 2.5 + k * 0.3, 0.16, 0.16), **icon(glyph, "s4uiMuted", 11)},
                    T((7.47, 2.46 + k * 0.3, 0.86, 0.24), label, "caption", size=10, font=H, tone="s4uiText", valign="middle"))],
                S((7.2, 4.66, 0.24, 0.24), "ellipse", fill="s4avatar"),
                T((7.5, 4.66, 0.8, 0.24), "Alex Kim", "caption", size=10, font=H, tone="s4uiText", valign="middle"),
            ], surface={"fill": "s4uiSide"}),
            # Main
            T((8.45, 1.98, 4.0, 0.34), "Good morning, Alex", "small", size=16, font=H, weight="bold", tone="s4uiText", align="center"),
            T((8.45, 2.3, 4.0, 0.26), "What will you build today?", "caption", size=11, font=H, tone="s4uiMuted", align="center"),
            free((8.62, 2.7, 3.66, 0.44), [
                {"_abs": (8.77, 2.84, 0.16, 0.16), **icon("sparkles", "s4violet", 11)},
                T((9.0, 2.8, 2.7, 0.24), "Turn my idea into a launch plan…", "caption", size=10, font=H, tone="s4uiMuted", valign="middle"),
                box((11.94, 2.77, 0.3, 0.3), {"fill": "s4violet", "radius": 100}, "column", [icon("arrow-up", "s4white", 12)], align="center", justify="center"),
            ], surface={"fill": "s4white", "stroke": "s4promptLine", "strokeWidth": 1, "radius": 11, "shadow": "soft"}),
            s4_tile(8.55, "search", "Research", "Cited answers", "s4lav", "s4violet"),
            s4_tile(9.52, "pen-line", "Create", "Docs & slides", "s4skyTint", "s4sky"),
            s4_tile(10.49, "chart-line", "Analyze", "Live insights", "s4roseTint", "s4rose"),
            s4_tile(11.46, "workflow", "Automate", "Hands-off flows", "s4mintTint", "s4mint"),
            T((8.55, 4.72, 3.81, 0.24), "Recent   ·   Q3 launch plan   ·   Market scan", "caption", size=10, font=H, tone="s4uiMuted"),
        ], surface={"fill": "s4white", "radius": 4}),
        # Floating cards
        box((6.2, 4.88, 2.2, 0.64), {"fill": "s4white", "radius": 12, "shadow": "soft"}, "row", [
            {"column": {"surface": {"fill": "s4mintTint", "radius": 100}, "width": 28, "height": 28, "align": "center", "justify": "center", "items": [icon("check", "s4mint", 14, strokeWidth=3)]}},
            {"column": {"gap": 1, "grow": 1, "items": [
                {"text": "Launch plan ready", "role": "caption", "size": 10.5, "font": H, "weight": "bold", "tone": "s4ink"},
                {"text": "Drafted in 12 seconds", "role": "caption", "size": 10, "font": H, "tone": "s4gray"}]}}],
            pad=[0, 10, 0, 10], gap=8, align="center"),
        box((10.68, 1.06, 2.15, 0.56), {"fill": "s4white", "radius": 12, "shadow": "soft"}, "row", [
            {"column": {"surface": {"fill": "s4lav", "radius": 100}, "width": 26, "height": 26, "align": "center", "justify": "center", "items": [icon("bot", "s4violet", 14)]}},
            {"column": {"gap": 1, "grow": 1, "items": [
                {"text": "3 agents running", "role": "caption", "size": 10.5, "font": H, "weight": "bold", "tone": "s4ink"},
                {"text": "Market research", "role": "caption", "size": 10, "font": H, "tone": "s4gray"}]}}],
            pad=[0, 9, 0, 9], gap=7, align="center"),
    ]}},
}


# ================================================================ SLIDE 5
# Strategy / transformation. Futura and Gill Sans; chevrons, a maturity meter, a Gantt roadmap.

F = "Futura"
G = "Gill Sans"

CHEV_W, CHEV_POINT, CHEV_GAP = 4.264, 0.31, 0.08
S5_STAGES = [
    ("TODAY", "Manual", "files", ["Fragmented tools", "Repetitive work", "Slow decisions"], "s5today", "s5todaySoft", 1),
    ("NEXT", "AI-assisted", "bot", ["Copilots for every team", "Connected knowledge", "Workflow automation"], "s5next", "s5nextSoft", 3),
    ("FUTURE", "AI-native", "brain-circuit", ["Autonomous agents", "Intelligent orchestration", "Continuous optimization"], "s5future", "s5futureSoft", 5),
]
BODY_W, BODY_GAP = (12.333 - 0.7) / 3, 0.35


def s5_stage(k, stage):
    label, name, glyph, points, tone, soft, level = stage
    cx = 0.5 + k * (CHEV_W - CHEV_POINT + CHEV_GAP)
    bx = 0.5 + k * (BODY_W + BODY_GAP)
    text_x = cx + (0.22 if k == 0 else CHEV_POINT + 0.16)
    items = [
        S((cx, 1.88, CHEV_W, 0.62), "homePlate" if k == 0 else "chevron", fill=tone),
        # A transparent surface declares the chevron as the ground the label sits on.
        box((text_x, 1.94, CHEV_W - (text_x - cx) - 0.45, 0.5), {"fill": tone, "opacity": 0}, "row", [
            {"text": label, "role": "label", "size": 10.5, "font": F, "weight": "bold", "tone": "s5white", "tracking": 0.1, "width": "auto"},
            {"text": name, "role": "h3", "size": 18, "font": F, "weight": "bold", "tone": "s5white"}], gap=12, align="center"),
        free((bx, 2.64, BODY_W, 1.56), [
            {"_abs": (bx + 0.26, 2.84, 0.5, 0.5), **icon(glyph, tone, 30, strokeWidth=1.75)},
            *[x for j, point in enumerate(points) for x in (
                S((bx + 1.02, 2.92 + j * 0.31, 0.07, 0.07), "ellipse", fill=tone),
                T((bx + 1.18, 2.81 + j * 0.31, BODY_W - 1.35, 0.29), point, "small", size=13.5, font=G, tone="s5ink", valign="middle"))],
            T((bx + 0.26, 3.86, 1.1, 0.22), "AI MATURITY", "caption", size=10, font=G, tone="s5slate", tracking=0.06, valign="middle"),
            *[S((bx + 1.42 + j * 0.2, 3.915, 0.11, 0.11), "ellipse", fill=tone if j < level else "s5hair") for j in range(5)],
        ], surface={"fill": soft, "radius": 10}),
    ]
    return items


YEAR_X0, YEAR_W = 2.5, (12.833 - 2.5) / 3
Q = YEAR_W / 4
S5_YEARS = [("2026", "Foundation", "s5next"), ("2027", "Scale", "s5mid"), ("2028", "Autonomy", "s5future")]
S5_LANES = [  # label, start quarter, end quarter (exclusive), text, fill, tone
    ("Data & platform", 0, 5, "Unified data layer  ·  AI platform  ·  governance", "s5next", "s5white"),
    ("Copilots", 2, 8, "Copilots in every function  ·  connected knowledge", "s5mid", "s5white"),
    ("Agents", 6, 12, "Autonomous agents  ·  intelligent orchestration", "s5future", "s5white"),
    ("People & operating model", 0, 12, "Upskilling   ·   new AI-native roles   ·   continuous optimization", "s5lane", "s5ink"),
]
S5_MILESTONES = [(2, "AI platform live"), (6, "Copilots in every team"), (9, "First autonomous workflows")]


def s5_roadmap():
    items = [T((0.5, 4.42, 1.9, 0.3), "ROADMAP", "label", size=10.5, font=F, weight="bold", tone="s5ink", tracking=0.16, valign="middle")]
    for k, (year, name, tone) in enumerate(S5_YEARS):
        x = YEAR_X0 + k * YEAR_W
        items.append(T((x, 4.36, 0.9, 0.44), year, "h2", size=22, font=F, weight="bold", tone=tone))
        items.append(T((x + 0.92, 4.44, 2.3, 0.3), name, "small", size=13.5, font=G, tone="s5slate", valign="middle"))
        items.append(S((x + (0.03 if k else 0), 4.9, YEAR_W - 0.06, 0.06), "roundRect", fill=tone, radius=2))
        if k:
            items.append(vline(x, 4.98, 6.98, "s5hair", weight=0.75))
    for j, (label, start, end, text, fill, tone) in enumerate(S5_LANES):
        y = 5.1 + j * 0.38
        items.append(T((0.5, y, 1.95, 0.32), label, "small", size=12.5, font=G, tone="s5ink", valign="middle"))
        x1, x2 = YEAR_X0 + start * Q + 0.03, YEAR_X0 + end * Q - 0.03
        items.append(box((x1, y + 0.02, x2 - x1, 0.28), {"fill": fill, "radius": 100}, "row", [
            {"text": text, "role": "caption", "size": 10.5, "font": G, "tone": tone}], pad=[0, 12, 0, 12], align="center"))
    items.append(T((0.5, 6.62, 1.95, 0.32), "Milestones", "small", size=12.5, font=G, tone="s5ink", valign="middle"))
    for quarter, label in S5_MILESTONES:
        x = YEAR_X0 + quarter * Q
        items.append(vline(x, 4.98, 6.66, "s5gold", weight=0.75, opacity=0.6))
        items.append(S((x - 0.09, 6.69, 0.18, 0.18), "diamond", fill="s5gold"))
        items.append(T((x + 0.14, 6.64, 2.3, 0.28), label, "caption", size=10.5, font=G, weight="bold", tone="s5ink", valign="middle"))
    return items


S5 = {
    "id": "transformation",
    "message": "Three stages and three years take us from manual work to an AI-native organization",
    "background": "s5white",
    "notes": "Strategy / transformation: a chevron maturity model with a maturity meter per stage, then a year-by-year roadmap with initiative lanes and milestones.",
    "compose": {"free": {"items": [
        T((0.5, 0.5, 6.5, 0.25), "TRANSFORMATION ROADMAP  ·  2026 – 2028", "label", size=10.5, font=F, weight="bold", tone="s5next", tracking=0.16),
        T((0.5, 0.76, 12.333, 0.62), "From manual workflow to AI-native organization", "title", size=28, font=F, weight="bold", tone="s5ink"),
        T((0.5, 1.36, 7.4, 0.32), "From fragmented tools to an autonomous, high-performance organization", "small", size=14, font=G, tone="s5slate"),
        T((7.6, 1.36, 2.75, 0.32), "People  ×  Process  ×  AI", "small", size=14, font=G, tone="s5ink", align="right"),
        T((10.43, 1.36, 2.403, 0.32), "=  compounding impact", "small", size=14, font=G, weight="bold", tone="s5next"),
        *[x for k, stage in enumerate(S5_STAGES) for x in s5_stage(k, stage)],
        *s5_roadmap(),
    ]}},
}


# ================================================================ INTENT

INTENT = {
    "schema": "slide-agent.intent/1",
    "brief": {
        "title": "MySlideAgent capability showcase",
        "audience": "Prospective users deciding whether MySlideAgent can make their kind of presentation",
        "goal": "Prove by example that one tool produces executive, technical, analytical, creative and strategic slides",
        "format": "16:9",
    },
    "direction": {
        "concept": "Five slides from five different decks. Each speaks the visual language of its genre — a steering-committee dashboard, a night-mode architecture review, an editorial data story, a product keynote, a consulting roadmap — with its own type, palette, density and diagram grammar. The only constant is craft.",
        "fit": "ask",
    },
    "design": {"language": {
        "color": {
            "palette": {
                # Slide 1 — enterprise light
                "s1bg": "#F3F5F9", "s1white": "#FFFFFF", "s1navy": "#0F1B33", "s1slate": "#5B6478", "s1track": "#E7EBF2",
                "s1blue": "#2563EB", "s1blueSoft": "#E9F0FE", "s1sky": "#9CC3FF", "s1violet": "#7C3AED", "s1violetSoft": "#F1EAFE",
                "s1amber": "#E08A0B", "s1amberIcon": "#B86A00", "s1amberSoft": "#FDF1DE", "s1amberPill": "#FBE2BE", "s1amberText": "#9A4D06",
                "s1green": "#16A34A", "s1greenSoft": "#E6F5EC", "s1greenText": "#157A3B",
                "s1red": "#DC2626", "s1redSoft": "#FDEEEE", "s1redText": "#B91C1C", "s1planned": "#B8C0CC",
                # Slide 2 — night architecture
                "s2night": "#0A1022", "s2node": "#111A33", "s2node2": "#152040", "s2orch": "#231B4D", "s2group": "#0D1530", "s2band": "#0E1730",
                "s2edge": "#2A3757", "s2frost": "#E8EDF7", "s2haze": "#97A3BF",
                "s2sky": "#38BDF8", "s2skyDim": "#1E4466", "s2violet": "#A78BFA", "s2violetDim": "#433779",
                "s2teal": "#2DD4BF", "s2tealDim": "#1A5552", "s2amber": "#FBBF24", "s2amberDim": "#5A4514", "s2grid": "#1A2442",
                # Slide 3 — editorial paper
                "s3paper": "#F6F3EC", "s3paperDim": "#CFC8BA", "s3ink": "#1B1B1F", "s3stone": "#66625B", "s3hair": "#D6CFC2",
                "s3coral": "#C2410C", "s3wash": "#ECE6DA", "s3coralSoft": "#F8DCCD", "s3coralLight": "#FF8A5B",
                # Slide 4 — keynote light
                "s4white": "#FFFFFF", "s4ink": "#0B0B10", "s4gray": "#5D5F6E", "s4violet": "#6D28D9", "s4lav": "#EFEAFE", "s4stroke": "#CFCBDD",
                "s4bezel": "#16161C", "s4cam": "#3A3A44", "s4base": "#D5D7DE", "s4baseDark": "#AEB1BB",
                "s4uiSide": "#F7F6FB", "s4uiLine": "#E8E6F0", "s4uiText": "#1F1D2B", "s4uiMuted": "#6E6C80", "s4promptLine": "#D9D2F7", "s4avatar": "#C4B5FD",
                "s4sky": "#0369A1", "s4skyTint": "#E0F2FE", "s4rose": "#BE185D", "s4roseTint": "#FCE7F3", "s4mint": "#15803D", "s4mintTint": "#DCFCE7",
                # Slide 5 — consulting
                "s5white": "#FFFFFF", "s5ink": "#1F2933", "s5slate": "#56606C", "s5hair": "#DDE2E8",
                "s5today": "#5F6E84", "s5todaySoft": "#F1F3F6", "s5next": "#0F7C86", "s5nextSoft": "#E7F4F5",
                "s5mid": "#1F5F9E", "s5future": "#1E3A8A", "s5futureSoft": "#EAEFFA", "s5lane": "#E6EBF2", "s5gold": "#C98A0B",
            },
            "roles": {"background": "s3paper", "surface": "s1white", "text": "s3ink", "muted": "s3stone", "accent": "s3coral", "accentAlt": "s2sky", "rule": "s3hair"},
            "data": ["s3ink", "s3coral"],
        },
        "type": {
            "display": {"family": "Helvetica Neue", "weight": 700, "tracking": -0.01},
            "body": {"family": "Helvetica Neue", "weight": 400},
            "mono": {"family": "Menlo"},
            "scale": {"base": 16, "ratio": 1.25},
        },
        "space": {"unit": 8, "margin": 36, "gutter": 16},
        "grid": {"columns": COLS, "rows": ROWS},
        "shape": {"radius": 10, "stroke": 0},
        "texture": [
            {"id": "blueprint", "primitive": "line-grid", "params": {"spacing": 36, "tone": "s2grid", "opacity": 0.18, "weight": 0.5}},
        ],
        "charts": {"axis": "hairline", "gridlines": "none", "labels": "none", "highlight": "s3coral", "legend": "none"},
        "chrome": {"slideNumber": False},
    }},
    "data": {
        "mau": {"categories": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], "series": [{"name": "MAU (K)", "values": [42, 47, 53, 61, 68, 79]}], "unit": "K"},
        "retention": {"categories": ["M1", "M2", "M3", "M4", "M5", "M6"], "series": [{"name": "Retained (%)", "values": [100, 82, 72, 67, 64, 62]}], "unit": "%"},
    },
    "slides": [S1, S2, S3, S4, S5],
}


COLOR_KEYS = ("tone", "fill", "stroke", "color", "background", "from", "to")


def tokenize_colors():
    """The palette holds 24 names: the roles, the backgrounds, and the most used.
    Every other colour is written as a hex literal, which the grammar records."""
    palette = INTENT["design"]["language"]["color"]["palette"]
    counts = {}

    def walk(node, visit):
        if isinstance(node, dict):
            for key, value in node.items():
                if key in COLOR_KEYS and isinstance(value, str) and value in palette:
                    node[key] = visit(value)
                else:
                    walk(value, visit)
        elif isinstance(node, list):
            for item in node:
                walk(item, visit)

    def count(name):
        counts[name] = counts.get(name, 0) + 1
        return name

    walk(INTENT["slides"], count)
    color = INTENT["design"]["language"]["color"]
    keep = list(dict.fromkeys(list(color["roles"].values()) + color["data"] + [s["background"] for s in INTENT["slides"]]))
    for name, _ in sorted(counts.items(), key=lambda item: -item[1]):
        if len(keep) >= 24:
            break
        if name not in keep:
            keep.append(name)
    full = dict(palette)
    walk(INTENT["slides"], lambda name: name if name in keep else full[name])
    color["palette"] = {name: full[name] for name in keep}


def build():
    for slide in INTENT["slides"]:
        resolve(slide["compose"], CONTENT)
    tokenize_colors()
    (HERE / "intent.json").write_text(json.dumps(INTENT, indent=1, ensure_ascii=False))
    out = HERE / "out"
    result = subprocess.run(["slide-agent", "build", "--intent", str(HERE / "intent.json"), "--deck", str(out)], capture_output=True, text=True)
    (HERE / "verdict.json").write_text(result.stdout)
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(result.stdout[:3000], result.stderr[:3000])
        return
    verdict = data.get("verdict", data)
    print("state:", verdict.get("state"))
    for issue in verdict.get("issues", []):
        print(f"  {issue['severity']:9} {issue['code']}: {issue.get('where')} — {issue.get('message', '')[:160]}")
    for edit in verdict.get("suggestedEdits", []):
        print(f"  suggest   {edit.get('id')}: {edit.get('why')} (≤{edit.get('maxChars')})")
    for adj in verdict.get("adjustments", []):
        print(f"  adjusted  {adj.get('kind')} ×{adj.get('count')}: {str(adj.get('where'))[:200]}")
    if "--finalize" in sys.argv:
        final = subprocess.run(["slide-agent", "finalize", "--deck", str(out), "--export", "pdf,png", *(["--no-round-trip"] if "--no-round-trip" in sys.argv else [])], capture_output=True, text=True)
        (HERE / "verdict-final.json").write_text(final.stdout)
        try:
            fv = json.loads(final.stdout)
            fv = fv.get("verdict", fv)
            print("finalize:", fv.get("state"))
            for issue in fv.get("issues", []):
                print(f"  {issue['severity']:9} {issue['code']}: {issue.get('where')} — {issue.get('message', '')[:160]}")
        except json.JSONDecodeError:
            print(final.stdout[:2000], final.stderr[:2000])


if __name__ == "__main__":
    build()
