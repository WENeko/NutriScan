# Project rules

- ONNX inference runs only in `LayaOnnxService` (separate `:laya` process); never call ONNX Runtime from the main app process — a native crash/OOM there would close the whole app.
- Keep `-keep class ai.onnxruntime.**` in ProGuard rules — ONNX Runtime's native code looks up Java classes by name via JNI and crashes in minified release builds otherwise.
- The hybrid pipeline (Laya + resolver) never calls the on-device LLM unless explicitly opted in — local LLM and hybrid are separate routing steps so one can't stall or pollute the other.
- Distance-based portion rescaling goes only through `src/services/portionScaling.ts` (calibrated/variable/bulk), whatever the analysis mode — one source of truth so modes can't diverge.
- On-device VLM inference (llama.cpp/mtmd, GGUF + mmproj) runs only in `LocalVlmService` (separate `:vlm` process) via `LocalVlmPlugin`; the VLM only detects foods/grams, nutrients always come from the resolver.
- Missing micronutrients are filled after the resolver by `src/services/hybrid/microCompletion.ts` (USDA → CNF → targeted cloud AI); it may only fill empty keys, never calories/macros or already-resolved values, and records a per-nutrient source.
- The VLM keeps the KV cache of the constant prompt prefix (system rules + user header, before the image marker) between analyses and only recomputes it after a reload or prompt change — the shared expert rules are ~1000 tokens and would otherwise dominate CPU latency.
- VLM backend (Vulkan GPU vs CPU) is decided natively per analysis in `LocalVlmService.gpuDecision` and the service picks the matching compressed detection prompt (expert for GPU, short for CPU) — the accelerator is only known after model load, so TS sends both variants.
- A VLM stop caused by the plugin timeout writes `vlm/timeout.flag` so it is never mistaken for a GPU crash; a real GPU crash disables Vulkan only until the next app version.
