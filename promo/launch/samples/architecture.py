"""Platform Architecture — the diagram deck: layered architecture, request
flow, a latency chart and a roadmap.

Design system: night-mode engineering. Deep navy canvas, luminous cyan and
violet signals, monospace labels; diagrams are the hero.
"""

LANES = [
    ("Multi-region", "c4-7", "cyan"),
    ("GPU pooling v2", "c5-8", "violet"),
    ("Eval pipeline", "c6-10", "cyan"),
    ("Fine-tuning service", "c8-11", "violet"),
    ("Edge inference", "c9-13", "cyan"),
]

ROADMAP = [
    {"at": "c4-13 r2-6", "surface": "track", "space": "space.1"},
    {"at": "c4-6 r1", "text": "Q1", "role": "body", "font": "mono", "align": "center", "valign": "middle", "tone": "muted"},
    {"at": "c7-9 r1", "text": "Q2", "role": "body", "font": "mono", "align": "center", "valign": "middle", "tone": "muted"},
    {"at": "c10-13 r1", "text": "Q3", "role": "body", "font": "mono", "align": "center", "valign": "middle", "tone": "muted"},
]
for k, (label, span, fill) in enumerate(LANES):
    ROADMAP.append({"at": f"c1-3 r{k + 2}", "text": label, "role": "body", "valign": "middle"})
    ROADMAP.append({"at": f"{span} r{k + 2}", "column": {"justify": "center", "items": [{"shape": "roundRect", "fill": fill, "radius": 8, "height": 20}]}})

INTENT = {
    "schema": "slide-agent.intent/1",
    "brief": {"title": "Platform Architecture 2027", "audience": "Platform engineering", "goal": "Agree the target architecture and the 2027 roadmap", "format": "16:9"},
    "direction": {"concept": "Night-mode engineering: a deep navy canvas under a faint grid, luminous cyan and violet signals, monospace labels, and diagrams as the hero of every slide.", "fit": "ask"},
    "data": {
        "latency": {"categories": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
                    "series": [{"name": "p95 latency (ms)", "values": [310, 296, 274, 252, 236, 214, 201, 188, 180]},
                               {"name": "SLO (ms)", "values": [200, 200, 200, 200, 200, 200, 200, 200, 200]}]},
    },
    "design": {"language": {
        "color": {
            "palette": {"night": "#0B1020", "deck": "#131B30", "edge": "#27324D", "frost": "#E8ECF6", "haze": "#9AA4BF",
                        "cyan": "#22D3EE", "violet": "#A78BFA", "mint": "#34D399", "dim": "#3A4560"},
            "roles": {"background": "night", "surface": "deck", "text": "frost", "muted": "haze", "accent": "cyan", "accentAlt": "violet", "rule": "edge"},
            "data": ["cyan", "dim", "violet"],
        },
        "type": {"display": {"family": "Space Grotesk", "weight": 600, "tracking": -0.02}, "body": {"family": "Inter", "weight": 400},
                 "mono": {"family": "JetBrains Mono", "weight": 500}, "scale": {"base": 18, "ratio": 1.25}},
        "space": {"unit": 8, "margin": 52, "gutter": 20},
        "grid": {"columns": 12, "rows": 6},
        "shape": {"radius": 10, "stroke": 1},
        "surfaces": {
            "card": {"fill": "deck", "stroke": "edge", "strokeWidth": 1, "radius": 14, "pad": "space.3"},
            "track": {"fill": "deck", "radius": 10},
        },
        "texture": [
            {"id": "grid", "primitive": "line-grid", "params": {"spacing": 36, "tone": "edge", "opacity": 0.5, "weight": 0.5}},
            {"id": "glow", "primitive": "gradient-wash", "params": {"from": "night", "to": "violet", "angle": 315, "opacity": 0.08}},
        ],
        "charts": {"axis": "hairline", "gridlines": "subtle", "labels": "none", "legend": "top"},
        "chrome": {"slideNumber": True, "footer": "Platform Architecture · 2027"},
    }},
    "components": {
        "stat": {"params": ["value", "label"], "root": {"column": {"surface": "card", "gap": "space.0.5", "justify": "center", "items": [
            {"text": "{value}", "role": "h2", "font": "mono", "tone": "accent"},
            {"text": "{label}", "role": "small", "tone": "muted"}]}}},
        "decision": {"params": ["title", "detail"], "root": {"row": {"gap": "space.2", "height": 48, "items": [
            {"icon": "chevron-right", "tone": "accent", "width": 22, "height": 22},
            {"column": {"gap": "space.0.25", "items": [{"text": "{title}", "role": "body", "weight": 600}, {"text": "{detail}", "role": "small", "tone": "muted"}]}}]}}},
    },
    "slides": [
        {"id": "cover", "message": "One control plane will serve every model by 2027", "compose": {"grid": "12x6", "items": [
            {"at": "c1-12 r1-6", "bleed": ["left", "right", "top", "bottom"], "texture": "grid"},
            {"at": "c1-12 r1-6", "bleed": ["left", "right", "top", "bottom"], "texture": "glow"},
            {"at": "c1-9 r2-5", "column": {"gap": "space.3", "justify": "center", "items": [
                {"text": "Architecture review · 2027", "role": "label", "font": "mono", "tone": "accent", "case": "upper", "tracking": 0.12},
                {"text": "One control plane for every model", "role": "title", "size": 64},
                {"text": "Target architecture, request flow, and the 2027 roadmap", "role": "lead", "tone": "muted"}]}}]}},
        {"id": "layers", "message": "Four layers, each owned by one team", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "Four layers, each owned by one team", "role": "title"},
            {"at": "c1-12 r2-6", "diagram": {"grammar": "layered", "direction": "right", "nodes": [
                {"id": "web", "label": "Apps", "detail": "web · mobile"},
                {"id": "sdk", "label": "Partner SDKs", "detail": "REST · events"},
                {"id": "gw", "label": "API gateway", "detail": "auth · quotas"},
                {"id": "router", "label": "Model router", "detail": "policy · cost", "emphasis": True},
                {"id": "pool", "label": "Inference", "detail": "GPU pool"},
                {"id": "vec", "label": "Vector store", "detail": "retrieval"},
                {"id": "obs", "label": "Telemetry", "detail": "traces · cost"}],
                "edges": [{"from": "web", "to": "gw"}, {"from": "sdk", "to": "gw"}, {"from": "gw", "to": "router"},
                          {"from": "router", "to": "pool"}, {"from": "router", "to": "vec"}, {"from": "router", "to": "obs"}]}}]}},
        {"id": "flow", "message": "Every request takes one path through the router", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "Every request takes one path", "role": "title"},
            {"at": "c1-12 r2-4", "diagram": {"grammar": "flow", "nodes": [
                {"id": "a", "label": "Request"}, {"id": "b", "label": "Gateway"}, {"id": "c", "label": "Router", "emphasis": True},
                {"id": "d", "label": "Model"}, {"id": "e", "label": "Response"}],
                "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}, {"from": "c", "to": "d"}, {"from": "d", "to": "e"}]}},
            {"at": "c1-12 r5-6", "row": {"gap": "space.2", "items": [
                {"use": "stat", "value": "180 ms", "label": "p95 latency"},
                {"use": "stat", "value": "99.98%", "label": "uptime, last 90 days"},
                {"use": "stat", "value": "43k/s", "label": "peak requests"},
                {"use": "stat", "value": "−31%", "label": "cost per request"}]}}]}},
        {"id": "latency", "message": "p95 latency is now under the 200 ms SLO", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "p95 latency is now under the 200 ms SLO", "role": "title"},
            {"at": "c1-12 r2-6", "surface": "card", "chart": {"data": "latency", "chart": "line", "highlight": "p95 latency (ms)"}}]}},
        {"id": "roadmap", "message": "Five workstreams take us multi-region by Q3", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "2027 roadmap", "role": "title"},
            {"at": "c1-12 r2-6", "grid": "13x6", "items": ROADMAP}]}},
        {"id": "decisions", "message": "Three decisions we need today", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "Three decisions we need today", "role": "title"},
            {"at": "c1-7 r2-6", "surface": "card", "column": {"gap": "space.2", "justify": "center", "items": [
                {"use": "decision", "title": "Adopt the router as the only entry point", "detail": "Retire direct model calls by Q2"},
                {"use": "decision", "title": "Fund GPU pooling v2", "detail": "Reserved capacity, not spot"},
                {"use": "decision", "title": "Staff the eval pipeline", "detail": "Two engineers from Q1"}]}},
            {"at": "c8-12 r2-6", "column": {"gap": "space.2", "justify": "center", "items": [
                {"text": "−31%", "role": "display", "size": 88, "font": "mono", "tone": "accent"},
                {"text": "cost per request since the router shipped", "role": "body", "tone": "muted"}]}}]}},
    ],
}
