import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FOODSEG103_LABELS, FOODSEG103_NAMES_FR } from './foodSeg103';
const { classify, native } = vi.hoisted(() => ({ classify: vi.fn(), native: vi.fn(() => true) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: native }, registerPlugin: () => ({ classify }) }));
import { detectFoodsWithLaya, setSelectedLayaModel } from './layaVision';
import { getHybridDetector, setHybridDetector } from './localVlm';
import { analyzeMealHybrid } from '../hybridAnalysisService';
import { resolveFoodItem } from './nutritionResolver';

describe('FoodSeg103 integration', () => {
  beforeEach(() => { localStorage.clear(); classify.mockReset(); native.mockReturnValue(true); });
  it('preserves authoritative class indices instead of Food101 fallback', async () => {
    expect(FOODSEG103_LABELS).toHaveLength(103);
    expect(FOODSEG103_NAMES_FR).toHaveLength(103);
    expect(FOODSEG103_LABELS[36]).toBe('fish');
    expect(FOODSEG103_LABELS[64]).toBe('pasta');
    classify.mockResolvedValue({task:'segment',classCount:103,model:'renamed.onnx',predictions:[{label:'class_36',classIndex:36,confidence:.9,areaFraction:.2,box:[0,0,.5,.5]}]});
    const result = await detectFoodsWithLaya('image');
    expect(result.detections[0]).toMatchObject({name:'Poisson',weightG:100,weightSource:'reference_portion',areaFraction:.2});
    expect(result.detections[0].massG).toBeUndefined();
  });
  it('selection switches hybrid away from MiniCPM without changing model routing order', () => {
    setHybridDetector('vlm'); setSelectedLayaModel('foodseg.onnx');
    expect(getHybridDetector()).toBe('laya');
  });
  it('rejects incompatible class counts rather than assigning unrelated names', async () => {
    classify.mockResolvedValue({task:'segment',classCount:80,predictions:[]});
    await expect(detectFoodsWithLaya('image')).rejects.toThrow('103 classes');
  });
  it('resolves photo foods by grams, preserves repeated instances and marks assumed portions', async () => {
    classify.mockResolvedValue({task:'segment',classCount:103,model:'foodseg.onnx',predictions:[
      {label:'class_36',classIndex:36,confidence:.9,areaFraction:.2},
      {label:'class_36',classIndex:36,confidence:.8,areaFraction:.1},
      {label:'class_64',classIndex:64,confidence:.85,areaFraction:.3}
    ]});
    const meal = await analyzeMealHybrid({image:'image',allowNetwork:false});
    expect(meal.items).toHaveLength(3);
    expect(meal.items[0]).toMatchObject({estimated_weight_g:100,calories:125,portion_assumed:true});
    expect(meal.items[2]).toMatchObject({estimated_weight_g:150,calories:197});
    expect(meal.total_summary.calories).toBe(447);
    expect(classify).toHaveBeenCalledWith(expect.objectContaining({maxResults:20}));
  });
  it('does not turn a short token into pesto by substring matching', async () => {
    const item = await resolveFoodItem({name:'est',weightG:480},{allowNetwork:false,customFoods:[{name:'Pesto basilic',calories_per_100g:330}]});
    expect(item.source).toBe('unresolved'); expect(item.calories).toBe(0);
  });
});
