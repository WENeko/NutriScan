import { describe, expect, it } from "vitest";
import { calculateMealQuality, calculateDailyQuality, detectWorkoutContext, type QualityInput } from "./metabolic-quality";

const meal: QualityInput = {
  calories: 600, proteins: 45, carbs: 60, fats: 20, carbohydrateBasis: "available",
  nutrients_std: { sugar: 6, fiber: 8, saturated_fat: 4, omega3_mg: 1000 },
};
describe("IQM — barème applicatif", () => {
  it("pondère glucides 40%, lipides 35%, protéines 25%", () => {
    const result = calculateMealQuality({ ...meal, nutrients_std: { sugar: 30, fiber: 0, saturated_fat: 12, omega3_mg: 0 } });
    expect(result.scores).toEqual({ carbs: 58, fats: 50, proteins: 100 });
    expect(result.score).toBe(66);
    expect(result.grade).toBe("C");
  });
  it("ne pénalise pas les sucres jusqu'à 15% des glucides", () => {
    expect(calculateMealQuality({ ...meal, nutrients_std: { ...meal.nutrients_std, sugar: 9, fiber: 0 } }).scores.carbs).toBe(100);
  });
  it("plafonne la pénalité sucre à 70 points", () => {
    expect(calculateMealQuality({ ...meal, nutrients_std: { ...meal.nutrients_std, sugar: 60, fiber: 0 } }).scores.carbs).toBe(30);
  });
  it("ajoute le bonus fibres par 1000 kcal, plafonné à 20 points", () => {
    const withFiber = calculateMealQuality({ ...meal, nutrients_std: { ...meal.nutrients_std, sugar: 30, fiber: 20 } });
    expect(withFiber.scores.carbs).toBe(78);
  });
  it.each(["pre_workout", "intra_workout", "post_workout"] as const)("exempte les sucres dans le contexte %s", (peri_workout) => {
    expect(calculateMealQuality({ ...meal, peri_workout, nutrients_std: { ...meal.nutrients_std, sugar: 60, fiber: 0 } }).scores.carbs).toBe(100);
  });
  it("applique la pénalité fibres de 15 points seulement au-delà de 15g en contexte sportif", () => {
    expect(calculateMealQuality({ ...meal, peri_workout: "pre_workout", nutrients_std: { ...meal.nutrients_std, fiber: 15 } }).scores.carbs).toBe(100);
    expect(calculateMealQuality({ ...meal, peri_workout: "pre_workout", nutrients_std: { ...meal.nutrients_std, fiber: 16 } }).scores.carbs).toBe(85);
  });
  it("conserve la base lipidique de 80 jusqu'à 30% de saturés", () => {
    expect(calculateMealQuality({ ...meal, nutrients_std: { ...meal.nutrients_std, saturated_fat: 6, omega3_mg: 0 } }).scores.fats).toBe(80);
  });
  it("plafonne la pénalité de saturés à 50 points", () => {
    expect(calculateMealQuality({ ...meal, nutrients_std: { ...meal.nutrients_std, saturated_fat: 20, omega3_mg: 0 } }).scores.fats).toBe(30);
  });
  it("1000mg d'oméga-3 ajoutent 20 points au maximum", () => {
    expect(calculateMealQuality(meal).scores.fats).toBe(100);
    expect(calculateMealQuality({ ...meal, nutrients_std: { ...meal.nutrients_std, omega3_mg: 3000 } }).scores.fats).toBe(100);
  });
  it("au-delà de 20% d'énergie lipidique péri-effort, retire 2 points par point de pourcentage", () => {
    expect(calculateMealQuality({ ...meal, peri_workout: "post_workout" }).scores.fats).toBeCloseTo(80);
    expect(calculateMealQuality({ ...meal, calories: 100, peri_workout: "post_workout" }).scores.fats).toBe(20);
  });
  it("adapte la cible protéique selon le profil sans modifier les objectifs caloriques", () => {
    expect(calculateMealQuality(meal, "hypertrophy").scores.proteins).toBe(100);
    expect(calculateMealQuality(meal, "cut").scores.proteins).toBeCloseTo(85.714);
    expect(calculateMealQuality(meal, "endurance").scores.proteins).toBe(100);
    expect(calculateMealQuality(meal, "health").scores.proteins).toBe(100);
  });
  it("n'impute aucun nutriment manquant et signale un score partiel", () => {
    const input = { ...meal, nutrients_std: {} };
    const before = JSON.stringify(input);
    const result = calculateMealQuality(input);
    expect(result.scores).toEqual({ carbs: null, fats: null, proteins: 100 });
    expect(result.coverage).toBe(0.25);
    expect(result.missing).toContain("sugar");
    expect(result.fractions.unsaturatedRemainder).toBeNull();
    expect(JSON.stringify(input)).toBe(before);
  });
  it("distingue le zéro mesuré d'une donnée inconnue", () => {
    expect(calculateMealQuality({ ...meal, nutrients_std: { sugar: 0, fiber: 0, saturated_fat: 0, omega3_mg: 0 } }).coverage).toBe(1);
    expect(calculateMealQuality({ ...meal, nutrients_std: { ...meal.nutrients_std, fiber: null } }).coverage).toBe(0.6);
  });
  it("ne double-soustrait pas les fibres des glucides UE et ne devine pas une base inconnue", () => {
    expect(calculateMealQuality(meal).fractions.nonSugarCarbs).toBe(54);
    expect(calculateMealQuality({ ...meal, carbohydrateBasis: "includes_fiber" }).fractions.nonSugarCarbs).toBe(46);
    expect(calculateMealQuality({ ...meal, carbohydrateBasis: "unknown" }).fractions.nonSugarCarbs).toBeNull();
  });
  it("n'attribue aucun score à une journée vide ou une énergie invalide", () => {
    expect(calculateDailyQuality([])).toEqual({ score: null, grade: null, coverage: 0 });
    expect(calculateMealQuality({ ...meal, calories: 0 }).score).toBeNull();
    expect(calculateMealQuality({ ...meal, calories: NaN }).score).toBeNull();
  });
  it("garde les exemptions péri-effort attachées au repas, pas à toute la journée", () => {
    const sugary = { ...meal, nutrients_std: { ...meal.nutrients_std, sugar: 60, fiber: 0 } };
    const standard = calculateMealQuality(sugary);
    const post = calculateMealQuality({ ...sugary, peri_workout: "post_workout" });
    const daily = calculateDailyQuality([sugary, { ...sugary, peri_workout: "post_workout" }]);
    expect(daily.score).toBe(Math.round(((standard.score ?? 0) + (post.score ?? 0)) / 2));
    expect(daily.score).toBeLessThan(post.score ?? 0);
  });
  it("recalcule le score à partir des quantités actuelles", () => {
    const revised = { ...meal, proteins: 5 };
    expect(calculateMealQuality(revised).score).toBeLessThan(calculateMealQuality(meal).score ?? 0);
  });
});

describe("suggestion de contexte sportif", () => {
  const sessions = [{ start_time: "2026-10-29T17:00:00Z", end_time: "2026-10-29T18:00:00Z" }];
  it("pré-effort commence 60 minutes avant et pas avant", () => {
    expect(detectWorkoutContext("2026-10-29T16:00:00Z", sessions)).toBe("pre_workout");
    expect(detectWorkoutContext("2026-10-29T15:59:59Z", sessions)).toBe("none");
  });
  it("classe pendant l'effort entre début et fin", () => {
    expect(detectWorkoutContext("2026-10-29T17:00:00Z", sessions)).toBe("intra_workout");
  });
  it("post-effort dure jusqu'à 120 minutes après la fin", () => {
    expect(detectWorkoutContext("2026-10-29T18:00:00Z", sessions)).toBe("post_workout");
    expect(detectWorkoutContext("2026-10-29T20:00:00Z", sessions)).toBe("post_workout");
    expect(detectWorkoutContext("2026-10-29T20:00:01Z", sessions)).toBe("none");
  });
  it("gère minuit et les offsets ISO sans filtrer uniquement le jour du repas", () => {
    expect(detectWorkoutContext("2026-10-30T00:30:00+01:00", [{ start_time: "2026-10-29T21:00:00Z", end_time: "2026-10-29T22:00:00Z" }])).toBe("post_workout");
  });
  it("ignore les séances et dates invalides", () => {
    expect(detectWorkoutContext("invalid", sessions)).toBe("none");
    expect(detectWorkoutContext("2026-10-29T17:30:00Z", [{ start_time: "invalid", end_time: "invalid" }])).toBe("none");
  });
});