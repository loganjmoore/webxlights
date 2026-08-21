import { parseIsf, type IsfShader } from "@webxlights/formats";
import { getShaderHost } from "@webxlights/engine";

// Checking a generated shader before anyone is offered the chance to publish it.
//
// This is the half of the generator that the server cannot do. The API has no WebGL context, so
// it cannot tell a shader that works from one that fails to link - which is exactly why it hands
// the text back rather than saving it. The browser has a GPU, so the browser is where a draft
// becomes a shader.
//
// It also decides how good a cheap model is allowed to be. A first draft that does not compile
// is not a failure if the compiler's own error can go back and be fixed; paying for a stronger
// model on every generation to make that rarer costs more than fixing the ones that break.

export type DraftCheck =
  | { ok: true; shader: IsfShader }
  /** `stage` says whose error it is - the header we parse, or the GLSL the GPU compiles. */
  | { ok: false; stage: "parse" | "compile" | "unavailable"; error: string };

/**
 * Parses an ISF file and compiles its GLSL.
 *
 * Both halves matter and they fail differently. A header that will not parse means no controls
 * and no description; GLSL that will not compile means nothing renders. Reporting which one
 * broke is what makes the error useful to send back for a repair.
 */
export function checkDraft(text: string): DraftCheck {
  let shader: IsfShader;
  try {
    shader = parseIsf(text);
  } catch (err) {
    return { ok: false, stage: "parse", error: (err as Error).message };
  }

  const host = getShaderHost();
  if (!host) {
    // No WebGL2. Distinguished from a compile failure on purpose: the shader may be perfect and
    // this browser simply cannot say, so the UI must not tell the user their shader is broken.
    return { ok: false, stage: "unavailable", error: "This browser cannot compile shaders (no WebGL2)." };
  }

  const result = host.compile(shader.source, "draft");
  if ("error" in result) return { ok: false, stage: "compile", error: result.error };
  result.shader.dispose();
  return { ok: true, shader };
}

/**
 * A name for a shader the user hasn't named.
 *
 * Taken from the ISF description, else from their own prompt. Nobody wants to name a thing before
 * they have seen it, and "Untitled 4" in a gallery is worse than a rough name taken from what was
 * asked for.
 */
export function suggestName(shader: IsfShader, prompt: string): string {
  const source = (shader.description ?? "").trim() || prompt.trim();
  if (source === "") return "Untitled shader";
  // First clause only: descriptions run to a sentence and a gallery card shows a name.
  const clause = source.split(/[.,;\n]/)[0]!.trim();
  const words = clause.split(/\s+/).slice(0, 6).join(" ");
  const name = words.length > 60 ? `${words.slice(0, 57)}…` : words;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The starting value for every input a shader declares.
 *
 * Kept beside the effect rather than looked up from the library at render time, so a sequence
 * still renders when a shader is later made private or deleted.
 */
export function defaultInputs(shader: IsfShader): Record<string, number | boolean | number[]> {
  const out: Record<string, number | boolean | number[]> = {};
  for (const input of shader.inputs) {
    out[input.name] =
      input.default ??
      (input.type === "bool"
        ? false
        : input.type === "color"
          ? [1, 1, 1, 1]
          : input.type === "point2D"
            ? [0.5, 0.5]
            : input.type === "long"
              ? (input.values?.[0] ?? 0)
              : input.min !== undefined && input.max !== undefined
                ? (input.min + input.max) / 2
                : 0);
  }
  return out;
}
