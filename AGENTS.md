# Project rules

- ONNX inference runs only in `LayaOnnxService` (separate `:laya` process); never call ONNX Runtime from the main app process — a native crash/OOM there would close the whole app.
- Keep `-keep class ai.onnxruntime.**` in ProGuard rules — ONNX Runtime's native code looks up Java classes by name via JNI and crashes in minified release builds otherwise.
