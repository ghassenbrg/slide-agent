# AI platform — Q4 2026 engineering review (notes)
headline: faster, leaner, ready to scale
results: p95 latency 310ms -> 180ms (-42%) · uptime 99.98% · cost per request -31% · peak throughput 3.1x
architecture: client apps -> API gateway -> model router (new) -> inference pool -> vector store
capabilities: autoscaling · model routing · observability · smart caching · security · cost controls
2026: Q1 foundation (gateway v2, tracing, SLOs, on-call) · Q2 scale (autoscaling, GPU pool, caching, load tests) · Q3 intelligence (model router, eval suite, cost dashboards, canary deploys) · Q4 now (multi-region, vector store v2, chaos tests, SOC 2 prep)
2027 roadmap: multi-region active-active · GPU pooling v2 · eval pipeline · fine-tuning service · edge inference · SOC 2 type II
risks: GPU supply · vendor lock-in · on-call load · data residency
asks: 2 SREs · GPU budget for H1 · security review · product input on fine-tuning
