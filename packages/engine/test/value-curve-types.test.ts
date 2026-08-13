import { describe, expect, it } from "vitest";
import {
  VALUE_CURVE_TYPES,
  isValueCurve,
  resolveParam,
  resolveParamsAtPosition,
  sampleValueCurve,
  valueCurveShape01,
  type ValueCurve,
} from "../src/valueCurve";

describe("Value curve types (SPEC ch9)", () => {
  it("every curve type stays inside 0..1 across the whole effect", () => {
    for (const type of VALUE_CURVE_TYPES) {
      const curve: ValueCurve = { type, min: 0, max: 1, points: [{ x: 0, y: 0.2 }, { x: 1, y: 0.9 }] };
      for (const s of sampleValueCurve(curve, 51)) {
        expect(s, `${type} produced ${s}`).toBeGreaterThanOrEqual(0);
        expect(s, `${type} produced ${s}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("Flat holds the curve's max regardless of position", () => {
    const flat: ValueCurve = { type: "Flat", min: 10, max: 80 };
    expect(resolveParam(flat, 0)).toBe(80);
    expect(resolveParam(flat, 0.5)).toBe(80);
    expect(resolveParam(flat, 1)).toBe(80);
  });

  it("Ramp Up/Down peaks in the middle and returns to the floor", () => {
    const curve: ValueCurve = { type: "Ramp Up/Down", min: 0, max: 100 };
    expect(resolveParam(curve, 0)).toBeCloseTo(0);
    expect(resolveParam(curve, 0.5)).toBeCloseTo(100);
    expect(resolveParam(curve, 1)).toBeCloseTo(0);
  });

  it("Square alternates between max and min once per cycle", () => {
    const curve: ValueCurve = { type: "Square", min: 0, max: 1, cycles: 2 };
    expect(valueCurveShape01(curve, 0.1)).toBe(1); // first half of cycle 1
    expect(valueCurveShape01(curve, 0.4)).toBe(0); // second half of cycle 1
    expect(valueCurveShape01(curve, 0.6)).toBe(1); // first half of cycle 2
  });

  it("Sine honours cycles and phase", () => {
    const oneCycle: ValueCurve = { type: "Sine", min: 0, max: 1, cycles: 1 };
    expect(valueCurveShape01(oneCycle, 0)).toBeCloseTo(0.5);
    expect(valueCurveShape01(oneCycle, 0.25)).toBeCloseTo(1);
    expect(valueCurveShape01(oneCycle, 0.75)).toBeCloseTo(0);

    const shifted: ValueCurve = { type: "Sine", min: 0, max: 1, cycles: 1, phase01: 0.25 };
    expect(valueCurveShape01(shifted, 0)).toBeCloseTo(1);
  });

  it("reverse mirrors a curve in time", () => {
    const forward: ValueCurve = { type: "Ramp", min: 0, max: 100 };
    const backward: ValueCurve = { type: "Ramp", min: 0, max: 100, reverse: true };
    expect(resolveParam(backward, 0.25)).toBeCloseTo(resolveParam(forward, 0.75));
  });

  it("Exponential Up and Logarithmic Up bracket a straight Ramp", () => {
    const at = (type: ValueCurve["type"]): number => valueCurveShape01({ type, min: 0, max: 1 }, 0.5);
    expect(at("Exponential Up")).toBeLessThan(at("Ramp"));
    expect(at("Logarithmic Up")).toBeGreaterThan(at("Ramp"));
  });

  it("Custom interpolates between points and holds its endpoints outside them", () => {
    const curve: ValueCurve = {
      type: "Custom",
      min: 0,
      max: 100,
      points: [
        { x: 0.25, y: 0 },
        { x: 0.75, y: 1 },
      ],
    };
    expect(resolveParam(curve, 0)).toBeCloseTo(0); // before the first point
    expect(resolveParam(curve, 0.5)).toBeCloseTo(50); // midway between them
    expect(resolveParam(curve, 1)).toBeCloseTo(100); // after the last point
  });

  it("Custom sorts unordered points rather than trusting input order", () => {
    const unordered: ValueCurve = {
      type: "Custom",
      min: 0,
      max: 1,
      points: [
        { x: 1, y: 1 },
        { x: 0, y: 0 },
      ],
    };
    expect(valueCurveShape01(unordered, 0.5)).toBeCloseTo(0.5);
  });

  it("isValueCurve accepts every declared type and rejects other objects", () => {
    for (const type of VALUE_CURVE_TYPES) expect(isValueCurve({ type, min: 0, max: 1 })).toBe(true);
    expect(isValueCurve({ type: "Bogus", min: 0, max: 1 })).toBe(false);
    expect(isValueCurve({ type: "Ramp" })).toBe(false); // no range
    expect(isValueCurve(null)).toBe(false);
  });

  it("resolveParamsAtPosition collapses only the curved params, leaving the rest alone", () => {
    const params = {
      speed: 10,
      thickness: { type: "Ramp", min: 0, max: 100 } as ValueCurve,
      label: "keep me",
      flag: true,
    };
    const resolved = resolveParamsAtPosition(params, 0.5);
    expect(resolved.speed).toBe(10);
    expect(resolved.thickness).toBeCloseTo(50);
    expect(resolved.label).toBe("keep me");
    expect(resolved.flag).toBe(true);
  });

  it("resolveParamsAtPosition returns the original object when nothing is curved", () => {
    const params = { speed: 10, flag: false };
    expect(resolveParamsAtPosition(params, 0.5)).toBe(params); // same reference, no copy
  });
});
