# Project rules

- ONNX inference runs only in `LayaOnnxService` (separate `:laya` process); never call ONNX Runtime from the main app process — a native crash/OOM there would close the whole app.
- Keep `-keep class ai.onnxruntime.**` in ProGuard rules — ONNX Runtime's native code looks up Java classes by name via JNI and crashes in minified release builds otherwise.
- The hybrid pipeline (Laya + resolver) never calls the on-device LLM unless explicitly opted in — local LLM and hybrid are separate routing steps so one can't stall or pollute the other.
- Distance-based portion rescaling goes only through `src/services/portionScaling.ts` (calibrated/variable/bulk), whatever the analysis mode — one source of truth so modes can't diverge.
