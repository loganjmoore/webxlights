// Interactive Shader Format - the container real xLights' Shader effect reads, so this is what
// webXLights reads too.
//
// An ISF file is a GLSL fragment shader with a JSON object in a comment at the top declaring what
// the shader is and which knobs it exposes:
//
//     /*{
//       "DESCRIPTION": "A drifting plasma",
//       "CREDIT": "someone",
//       "CATEGORIES": ["Generator"],
//       "INPUTS": [
//         { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 }
//       ]
//     }*/
//     void main() { gl_FragColor = vec4(...); }
//
// Choosing ISF rather than inventing a format is the whole point: a shader written here opens in
// xLights, and the large body of ISF shaders that already exists (VDMX, ISF Editor, interactive
// shader sites) drops straight in. A private format would have made the AI generator the only
// possible source of shaders, which is a much smaller idea.
//
// This parser is deliberately tolerant. ISF in the wild is hand-written and frequently sloppy -
// a trailing comma, a missing MIN on a float, a TYPE nobody else uses. A shader that renders in
// other tools should render here, so anything that isn't understood is preserved and ignored
// rather than treated as a parse failure.

/** An ISF input type this app knows how to drive. */
export type IsfInputType = "float" | "long" | "bool" | "color" | "point2D" | "event" | "image";

export interface IsfInput {
  name: string;
  type: IsfInputType;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: number | boolean | number[];
  /** `long` inputs are a labelled enum: LABELS are what the user picks, VALUES what the shader gets. */
  labels?: string[];
  values?: number[];
}

export interface IsfShader {
  description?: string;
  credit?: string;
  categories: string[];
  inputs: IsfInput[];
  /** The GLSL body, with the JSON header comment removed. */
  source: string;
  /**
   * The header exactly as it was written, minus the fields above.
   *
   * ISF has fields this app has no use for - PASSES, PERSISTENT buffers, IMPORTED media. Keeping
   * them means a shader edited here and taken back to another tool is still the shader it was,
   * rather than one quietly stripped of everything we didn't implement.
   */
  extra: Record<string, unknown>;
}

export class IsfParseError extends Error {}

const KNOWN_TYPES = new Set<string>(["float", "long", "bool", "color", "point2D", "event", "image"]);

/**
 * Finds the JSON header comment and returns it with the offset just past it.
 *
 * Scans for the closing delimiter by matching braces rather than taking the first comment
 * terminator in the file, because a header's own DESCRIPTION is free text and can contain one.
 */
function splitHeader(text: string): { json: string; bodyAt: number } {
  const start = text.indexOf("/*");
  if (start < 0) throw new IsfParseError("no ISF header: expected a /*{ ... }*/ comment before the shader");
  // The brace has to be the first thing *inside* the comment - ISF writes `/*{`. Searching the
  // whole file for a brace instead finds the one in `void main(){}` and happily parses `{}` as an
  // empty header, so a plain `/* a note */` above a shader is accepted as a headerless shader
  // with no inputs rather than reported as the missing header it is.
  const braceAt = start + 2 + (text.slice(start + 2).match(/^\s*/)?.[0].length ?? 0);
  if (text[braceAt] !== "{") {
    throw new IsfParseError("no ISF header: the leading comment does not open with a JSON object");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = braceAt; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const json = text.slice(braceAt, i + 1);
        const close = text.indexOf("*/", i);
        return { json, bodyAt: close < 0 ? i + 1 : close + 2 };
      }
    }
  }
  throw new IsfParseError("ISF header is not closed: no matching } for the opening brace");
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Hand-written ISF quotes numbers often enough that rejecting them would fail real files.
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function asNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map(asNumber);
  return out.every((n): n is number => n !== undefined) ? out : undefined;
}

function parseInput(raw: unknown): IsfInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.NAME === "string" ? r.NAME : undefined;
  if (!name) return null; // an input with no name can't be bound to anything
  const typeRaw = typeof r.TYPE === "string" ? r.TYPE : "float";
  // An unknown type becomes a float rather than dropping the input. A dropped input is a
  // uniform the shader declares and never receives, which fails to link; a float is at worst
  // a control that does nothing useful.
  const type = (KNOWN_TYPES.has(typeRaw) ? typeRaw : "float") as IsfInputType;

  const input: IsfInput = { name, type };
  if (typeof r.LABEL === "string") input.label = r.LABEL;

  const min = asNumber(r.MIN);
  const max = asNumber(r.MAX);
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;

  if (type === "bool") input.default = r.DEFAULT === true || r.DEFAULT === 1 || r.DEFAULT === "true";
  else if (type === "color" || type === "point2D") {
    const arr = asNumberArray(r.DEFAULT);
    if (arr) input.default = arr;
  } else {
    const def = asNumber(r.DEFAULT);
    if (def !== undefined) input.default = def;
  }

  if (type === "long") {
    const labels = Array.isArray(r.LABELS) ? r.LABELS.filter((l): l is string => typeof l === "string") : undefined;
    const values = asNumberArray(r.VALUES);
    if (labels?.length) input.labels = labels;
    if (values?.length) input.values = values;
  }

  return input;
}

export function parseIsf(text: string): IsfShader {
  const { json, bodyAt } = splitHeader(text);
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(json) as Record<string, unknown>;
  } catch (err) {
    throw new IsfParseError(`ISF header is not valid JSON: ${(err as Error).message}`);
  }

  const rawInputs = Array.isArray(header.INPUTS) ? header.INPUTS : [];
  const inputs = rawInputs.map(parseInput).filter((i): i is IsfInput => i !== null);

  const categories = Array.isArray(header.CATEGORIES)
    ? header.CATEGORIES.filter((c): c is string => typeof c === "string")
    : [];

  const extra: Record<string, unknown> = { ...header };
  for (const key of ["DESCRIPTION", "CREDIT", "CATEGORIES", "INPUTS"]) delete extra[key];

  return {
    description: typeof header.DESCRIPTION === "string" ? header.DESCRIPTION : undefined,
    credit: typeof header.CREDIT === "string" ? header.CREDIT : undefined,
    categories,
    inputs,
    source: text.slice(bodyAt).replace(/^\s*\n/, ""),
    extra,
  };
}

/** Writes a shader back out as an ISF file - the same text another ISF tool would accept. */
export function serializeIsf(shader: IsfShader): string {
  const header: Record<string, unknown> = { ...shader.extra };
  if (shader.description !== undefined) header.DESCRIPTION = shader.description;
  if (shader.credit !== undefined) header.CREDIT = shader.credit;
  if (shader.categories.length) header.CATEGORIES = shader.categories;
  if (shader.inputs.length) {
    header.INPUTS = shader.inputs.map((i) => {
      const out: Record<string, unknown> = { NAME: i.name, TYPE: i.type };
      if (i.label !== undefined) out.LABEL = i.label;
      if (i.min !== undefined) out.MIN = i.min;
      if (i.max !== undefined) out.MAX = i.max;
      if (i.default !== undefined) out.DEFAULT = i.default;
      if (i.labels) out.LABELS = i.labels;
      if (i.values) out.VALUES = i.values;
      return out;
    });
  }
  return `/*${JSON.stringify(header, null, 2)}*/\n${shader.source}`;
}

/**
 * Things that would make this ISF file mean something different in real xLights.
 *
 * webXLights compiles as GLSL ES 3.00 in a browser; xLights compiles the same file as desktop
 * `#version 330` after its own rewrites (ShaderEffect.cpp). Most differences are absorbed by the
 * two preambles, but a few constructs compile fine here and break there - or worse, compile in
 * both and mean two different programs. Each returned string is one such problem, written to be
 * shown to a user or handed back to a generator for repair. An empty array does not prove the
 * shader works in xLights - only compiling it there proves that - but a non-empty one proves it
 * will not, or will not mean the same thing.
 *
 * Deliberately NOT part of parseIsf: importing a shader that only works here should succeed and
 * render, because refusing files this app can run helps nobody. The gate belongs where shaders
 * are *made* - the generation flow and the compile harness - not where they are read.
 */
export function isfPortabilityIssues(text: string): string[] {
  const issues: string[] = [];

  let header: { json: string; bodyAt: number };
  try {
    header = splitHeader(text);
  } catch {
    return issues; // not parseable as ISF at all: the parse stage reports that, not this one
  }
  const body = text.slice(header.bodyAt);

  // xLights takes everything after the FIRST */ in the file (ShaderEffect.cpp ~line 1458), so a
  // */ inside the header JSON makes it read the header's tail as GLSL. webXLights' brace-matching
  // parser tolerates it, which is exactly why it has to be flagged here.
  if (header.json.includes("*/")) {
    issues.push('the header JSON contains "*/": xLights cuts the file at the first "*/" and would read the rest of the header as GLSL');
  }

  // xLights rewrites `varying ` to `uniform `; webXLights #defines it to `in`. The same source
  // would compile to two different programs, so it must not appear at all.
  if (/\bvarying\b/.test(body)) {
    issues.push('uses "varying": xLights rewrites it to "uniform" and webXLights to "in", so the two programs would disagree - declare an INPUT or use a plain global instead');
  }

  // The old webXLights palette inventions. They never existed in xLights, so a shader using them
  // fails to link there with an undeclared-identifier error.
  const invented = body.match(/\b(PALETTE_AT|PALETTE_COUNT|PALETTE)\b/);
  if (invented) {
    issues.push(`uses ${invented[1]}, which exists only in old webXLights and not in xLights - use "TYPE": "color" INPUTS, which both fill from the user's palette`);
  }

  // Both hosts declare these; a shader declaring them again is a duplicate declaration in both.
  const redeclared = body.match(
    /\buniform\s+\w+\s+(TIME|TIMEDELTA|RENDERSIZE|FRAMEINDEX|DATE|NUMCOLORS|PASSINDEX)\b/,
  );
  if (redeclared) {
    issues.push(`declares "uniform ... ${redeclared[1]}", which both hosts already declare - delete the declaration and just use it`);
  }

  // webXLights strips a leading #version before splicing its own; xLights prepends "#version
  // 330" without stripping anything, so a #version in the body lands mid-file and fails there.
  if (/^\s*#version\b/m.test(body)) {
    issues.push("contains a #version directive: xLights prepends its own #version 330 and a second one mid-file is a compile error");
  }

  return issues;
}

/**
 * The names of the colour inputs, in declaration order.
 *
 * Order is the contract: real xLights fills each `"TYPE": "color"` input from the effect's
 * palette in the order they were declared, wrapping at the palette length, and webXLights does
 * the same. Anything that needs to know which uniforms the palette drives derives it from here
 * rather than re-reading the header, because at render time the header is already gone.
 */
export function colorInputNames(inputs: IsfInput[]): string[] {
  return inputs.filter((i) => i.type === "color").map((i) => i.name);
}

/** The value an input starts at when a user drops the shader on a row and touches nothing. */
export function defaultValueFor(input: IsfInput): number | boolean | number[] {
  if (input.default !== undefined) return input.default;
  switch (input.type) {
    case "bool":
    case "event":
      return false;
    case "color":
      return [1, 1, 1, 1];
    case "point2D":
      return [0.5, 0.5];
    case "long":
      return input.values?.[0] ?? 0;
    default:
      // Midpoint rather than zero: a float with a declared range and no default is usually a
      // dial, and zero is often one end of it (no speed, no scale) rather than a neutral start.
      if (input.min !== undefined && input.max !== undefined) return (input.min + input.max) / 2;
      return 0;
  }
}
