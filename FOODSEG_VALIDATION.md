# FoodSeg103 validation — 2026-10-20

## Automated checks

- 19 Vitest tests passed: FoodSeg103 integration (7), local VLM parser (6), micro completion (3), distance scaling (3).
- 3 JUnit tests passed against the actual Kotlin FoodSegDecoder: class-wise NMS and prototype masks, padding excluded from area, empty masks and low scores rejected.
- Updated native-response fixtures to include authoritative export labels; added missing/reordered metadata rejection tests.
- Preview build log reports build OK. This is not an Android build result.

## Real model check

The previously delivered FP16 ONNX file does not load in ONNX Runtime: duplicate value_info declarations assign inconsistent FLOAT/FLOAT16 types to intermediate Resize outputs.

The v2 file removes 651 duplicate value_info entries, retaining the first declaration for each name. No weights or class names are changed. ONNX checker and ONNX Runtime loading passed.

Model contract: FLOAT images [1,3,640,640]; FLOAT output0 [1,139,8400]; FLOAT output1 [1,32,160,160]. Ordered metadata contains 103 FoodSeg103 classes.

Test image: user's IMG_20261015_120709.jpg, 1920×1080. Letterboxed RGB/255 input, CPU ONNX Runtime with 4 threads and BASIC optimization. Inference measured 0.515 seconds on this desktop sandbox; this is not smartphone latency.

Actual tensors were passed into the project's unchanged Kotlin FoodSegDecoder with threshold 0.25 and limit 20. Results:

| Export class | Score | Image area fraction |
| --- | ---: | ---: |
| pie | 94.9% | 3.3% |
| sauce | 91.6% | 2.0% |
| french fries | 85.8% | 10.8% |
| sausage | 50.6% | 0.3% |
| biscuit | 48.8% | 4.9% |

Visual inspection confirms wrong labels: fish → pie, spätzle → french fries, soup → sauce, bread → biscuit. The endive dish is missed. High detection scores are not nutritional certainty. The model is not validated as accurate for this meal.

## Outstanding validation

- No full Android build, installation, import, or in-app analysis was exercised; no Android device is available in this environment.
- Portion weights are explicit reference portions, not measured grams or calibrated mask-derived volumes.
- Commercial licensing remains unverified; integration does not establish permission to distribute the checkpoint commercially.