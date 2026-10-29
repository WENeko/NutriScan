# Project rules

- Keep IQM calculations pure in `src/utils/metabolic-quality.ts`; unknown nutrients remain unknown and coverage accompanies provisional scores so missing records never become fabricated measurements.
- Health imports share a per-user 60-second single-flight guard and refresh on foreground only after import; sport calorie smoothing uses seven completed local dates so today's sessions never enter the smoothed supplement.
- Cloud hybrid wraps each configured cloud analysis step without changing its order or invoking local models implicitly; detection uses shared perception rules and only the five portion fields, then library → reference → OFF → USDA and missing-only micro completion supply nutrition.
- USDA resolution and micro completion share translation helpers under edge-function `_shared`; reuse the existing translation model so search names stay consistent without a second AI integration.
- Cloud hybrid uses its own semantic record-selection path: AI sees candidate IDs/names only, numbers come from existing records, detected names/portions stay immutable, and uncertain matches remain unresolved; baseline cloud and local matching are unchanged.
- Cloud-hybrid micro completion uses semantically selected USDA/CNF records only and leaves unavailable values empty; never enable generated micro estimates on this path.
- Cloud-only catalogue queries may broaden trailing cooking terms for retrieval, but record approval uses the immutable original food name; verified extra reference snapshots stay cloud-only to avoid changing legacy matching.

- Decode raw FoodSeg103 YOLO segmentation only in the isolated ONNX service, using letterboxed RGB/255 inputs and class-wise NMS plus prototype masks; classifier preprocessing would corrupt its detections.
- FoodSeg class ordering comes from the supplied export metadata; never use Food101/ISIA fallback for segmentation, because indexed labels would silently name the wrong foods.
- Segmentation masks do not measure grams: carry explicit reference-portion provenance into the resolver until a calibrated volume estimator is validated; never fabricate density calibration or claim nutritional certainty.

- ONNX inference runs only in `LayaOnnxService` (separate `:laya` process); never call ONNX Runtime from the main app process — a native crash/OOM there would close the whole app.
- Keep `-keep class ai.onnxruntime.**` in ProGuard rules — ONNX Runtime's native code looks up Java classes by name via JNI and crashes in minified release builds otherwise.
- The hybrid pipeline (Laya + resolver) never calls the on-device LLM unless explicitly opted in — local LLM and hybrid are separate routing steps so one can't stall or pollute the other.
- Distance-based portion rescaling goes only through `src/services/portionScaling.ts` (calibrated/variable/bulk), whatever the analysis mode — one source of truth so modes can't diverge.
- On-device VLM inference (llama.cpp/mtmd, GGUF + mmproj) runs only in `LocalVlmService` (separate `:vlm` process) via `LocalVlmPlugin`; the VLM only detects foods/grams, nutrients always come from the resolver.
- Missing micronutrients are filled after the resolver by `src/services/hybrid/microCompletion.ts` (USDA → CNF → targeted cloud AI); it may only fill empty keys, never calories/macros or already-resolved values, and records a per-nutrient source.
- The VLM keeps the KV cache of the constant prompt prefix (system rules + user header, before the image marker) between analyses and only recomputes it after a reload or prompt change — the shared expert rules are ~1000 tokens and would otherwise dominate CPU latency.
- VLM backend (Vulkan GPU vs CPU) is decided natively per analysis in `LocalVlmService.gpuDecision` and the service picks the matching compressed detection prompt (expert for GPU, short for CPU) — the accelerator is only known after model load, so TS sends both variants.
- A VLM stop caused by the plugin timeout writes `vlm/timeout.flag` so it is never mistaken for a GPU crash; a real GPU crash disables Vulkan only until the next app version.
