// The exact source real xLights compiles for an ISF file.
//
// Transcribed from xLights' own ShaderEffect.cpp (smeighan/xLights, commit 858a5aea73f,
// src-core/effects/ShaderEffect.cpp, read 2026-08-21) - the prependText block at ~line 1367, the
// source rewrites at ~line 1458, and the INPUTS-to-uniform mapping at ~line 1240. This is a
// translation of what that code does, not an approximation of what it probably does: when xLights
// changes, this file is wrong until someone reads the source again. Line references are to that
// commit.
//
// Two deliberate fidelity points that look like bugs but are the real behaviour:
//   - xLights takes everything after the FIRST "*/" in the file, not after the header's closing
//     brace. A "*/" inside the header JSON truncates the header. We replicate that.
//   - the rewrites are plain substring replacements, in order, with no word-boundary checks.
//     "varying " (with the trailing space) becomes "uniform ". We replicate that too.

// prependText, verbatim from ShaderEffect.cpp ~line 1367.
const PREPEND = `uniform float TIME;
uniform float TIMEDELTA;
uniform vec2 RENDERSIZE;
uniform bool clearBuffer;
uniform bool resetNow;
uniform int NUMCOLORS;
uniform int PASSINDEX;
uniform int FRAMEINDEX;
uniform vec2 XL_OFFSET;
uniform float XL_ZOOM;
uniform float XL_DURATION;
uniform sampler2D texSampler;

// THESE ARE THE PRE ZOOM AND OFFSET COORDS
in vec2 orig_FragNormCoord;
in vec2 orig_FragCoord;
// THESE ARE THE POST ZOOM AND OFFSET COORDS
in vec2 xl_FragNormCoord;
in vec2 xl_FragCoord;
out vec4 fragmentColor;
uniform vec4 DATE;

// USE THIS IN PUBLIC SHADERS FOR CODE WHICH ONLY RUNS IN XLIGHTS
#define XL_SHADER

`;

// The IMG_* helper functions xLights appends after the per-input uniforms, verbatim.
const IMG_HELPERS = `vec4 IMG_NORM_PIXEL_2D(sampler2D sampler, vec2 pct, vec2 normLoc) {
   vec2 coord = normLoc;
   return texture(sampler, coord* pct);
}

vec4 IMG_NORM_PIXEL(sampler2D sampler, vec2 normLoc) {
   vec2 coord = normLoc;
   return texture(sampler, coord);
}

vec4 IMG_PIXEL_2D(sampler2D sampler, vec2 pct, vec2 loc) {
   return IMG_NORM_PIXEL_2D(sampler, pct, loc / RENDERSIZE);
}

vec4 IMG_PIXEL(sampler2D sampler, vec2 loc) {
   return texture(sampler, loc / RENDERSIZE);
}

vec4 IMG_THIS_PIXEL(sampler2D sampler) {
   vec2 coord = xl_FragNormCoord;
   return texture(sampler, coord);
}

vec4 IMG_THIS_NORM_PIXEL_2D(sampler2D sampler, vec2 pct) {
   vec2 coord = xl_FragNormCoord;
   return texture(sampler, coord * pct);
}

vec4 IMG_THIS_NORM_PIXEL(sampler2D sampler) {
   vec2 coord = xl_FragNormCoord;
   return texture(sampler, coord);
}

vec4 IMG_THIS_PIXEL_2D(sampler2D sampler, vec2 pct) {
   return IMG_THIS_NORM_PIXEL_2D(sampler, pct);
}

vec4 IMG_NORM_PIXEL_RECT(sampler2DRect sampler, vec2 pct, vec2 normLoc) {
   vec2 coord = normLoc;
   return texture(sampler, coord * RENDERSIZE);
}

vec4 IMG_PIXEL_RECT(sampler2DRect sampler, vec2 pct, vec2 loc) {
   return IMG_NORM_PIXEL_RECT(sampler, pct, loc / RENDERSIZE);
}

vec4 IMG_THIS_NORM_PIXEL_RECT(sampler2DRect sampler, vec2 pct) {
   vec2 coord = xl_FragNormCoord;
   return texture(sampler, coord * RENDERSIZE);
}

vec4 IMG_THIS_PIXEL_RECT(sampler2DRect sampler, vec2 pct) {
   return IMG_THIS_NORM_PIXEL_RECT(sampler, pct);
}

ivec2 IMG_SIZE(sampler2D sampler) {
   return textureSize(sampler, 0);
}

`;

/**
 * The uniform declarations xLights emits for a shader's INPUTS (~line 1240 and ~line 1395).
 *
 * Returns { uniforms, textureNames }: textureNames are "image" / "audioFFT" input names, which
 * xLights does not declare - it substitutes its own texSampler for them in the source.
 */
function inputUniforms(rawInputs) {
  let uniforms = "";
  const textureNames = [];
  for (const input of rawInputs) {
    const name = typeof input?.NAME === "string" ? input.NAME : "";
    if (name === "" || name === "XL_OFFSET" || name === "XL_DURATION" || name === "XL_ZOOM") continue;
    const type = typeof input?.TYPE === "string" ? input.TYPE : "";
    switch (type) {
      case "float":
        uniforms += `uniform float ${name};\n`;
        break;
      case "bool":
      case "event":
        uniforms += `uniform bool ${name};\n`;
        break;
      case "long":
        // With MIN it is a slider, with LABELS/VALUES a choice - both are an int uniform. A
        // "long" with neither hits an assert in xLights; declaring nothing mirrors the release
        // build, where the parm is silently dropped.
        if ("MIN" in input || ("LABELS" in input && "VALUES" in input)) uniforms += `uniform int ${name};\n`;
        break;
      case "point2D":
        uniforms += `uniform vec2 ${name};\n`;
        break;
      case "color":
        uniforms += `uniform vec4 ${name};\n`;
        break;
      case "image":
      case "audioFFT":
        textureNames.push(name);
        break;
      default:
        // "audio", "text" and anything unknown: xLights declares no uniform for these, so a
        // shader that reads the name fails to compile there. Declaring nothing reproduces that.
        break;
    }
  }
  return { uniforms, textureNames };
}

/**
 * Builds the desktop-GLSL source xLights would hand to glCompileShader for this ISF file.
 *
 * `text` is the whole file, header included; `rawInputs` the INPUTS array from the header JSON
 * (raw, not the parsed IsfInput form - xLights reads the raw JSON and so does this).
 */
export function xlightsFragmentSource(text, rawInputs = []) {
  // ~line 1450: characters outside ASCII get mangled first (0x85 -> '.'), then everything after
  // the FIRST */ is the shader.
  let shaderCode = text.replace(/\u0085/g, ".");
  const firstClose = shaderCode.indexOf("*/");
  if (firstClose > 0) shaderCode = shaderCode.slice(firstClose + 2);

  // The rewrites, in xLights' order, as plain replace-all with no boundaries (~line 1458).
  const rewrites = [
    ["gl_FragColor", "fragmentColor"],
    ["vv_FragNormCoord", "xl_FragNormCoord"],
    ["isf_FragNormCoord", "xl_FragNormCoord"],
    ["isf_FragCoord", "xl_FragCoord"],
    ["gl_FragCoord", "xl_FragCoord"],
    ["gl_FragNormCoord", "xl_FragNormCoord"],
    ["varying ", "uniform "],
    ["texture2D(", "texture("],
    ["texture2D (", "texture("],
  ];
  for (const [from, to] of rewrites) shaderCode = shaderCode.replaceAll(from, to);

  const { uniforms, textureNames } = inputUniforms(rawInputs);
  for (const name of textureNames) shaderCode = shaderCode.replaceAll(name, "texSampler");

  // ~line 1490: #extension lines are hoisted to just after #version. (A #version inside the
  // body is NOT stripped - which is why the portability lint flags one.)
  let extensions = "";
  shaderCode = shaderCode.replace(/^#extension[^\n]*\n?/gm, (line) => {
    extensions += line.endsWith("\n") ? line : `${line}\n`;
    return "";
  });

  return `#version 330\n${extensions}\n${PREPEND}${uniforms}${IMG_HELPERS}${shaderCode}`;
}
