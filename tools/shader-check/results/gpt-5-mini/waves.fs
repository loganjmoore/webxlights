/*{
  "DESCRIPTION": "Ocean waves rolling with bright foam crests",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.02, 0.05, 0.30, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.00, 0.40, 0.70, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.00, 1.00, 1.00, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.80 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.20, "MAX": 8.0, "DEFAULT": 2.00 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // choose a secondary coordinate that uses x for rooflines (very short Y)
  float useY = (RENDERSIZE.y < 2.0) ? uv.x : uv.y;

  // parameters
  const float PI = 3.14159265;
  float s = max(scale, 0.001);
  float t = TIME * speed;

  // aspect compensation so waves look natural on non-square layouts
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

  // primary horizontal position, scaled and wrapped for seamless tiling
  float x = uv.x * s * aspect;

  // layered rolling waves (two main layers + fine ripples)
  float layer1 = sin((x * 1.0 + t * 0.60) * (2.0 * PI) + sin(useY * 6.0) * 0.45);
  float layer2 = sin((x * 1.6 + t * 0.90) * (2.0 * PI * 0.6) + cos(useY * 8.0) * 0.30);
  float ripples = sin((x * 10.0 + t * 2.5) + useY * 20.0) * 0.08;

  // combine and normalize to 0..1
  float wave = layer1 * 0.60 + layer2 * 0.40;
  float waveNorm = 0.5 + 0.5 * wave + ripples;
  waveNorm = clamp(waveNorm, 0.0, 1.0);

  // dynamic crest threshold to keep motion lively and loopable
  float crestBase = 0.62;
  float crestMod = 0.06 * sin(TIME * 0.12);
  float crestLevel = crestBase + crestMod;

  // sharpness derived from scale so finer scales have crisper crests
  float sharp = max(0.01, 0.08 / s);

  // foam mask for bright crests
  float foam = smoothstep(crestLevel - sharp, crestLevel + sharp, waveNorm);
  // emphasize the very tips
  float foamTip = pow(foam, 0.6);

  // base color gradient between deep and mid water depending on wave height
  vec3 baseCol = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 1.0, waveNorm));

  // boost brightness on ridges for strong night-time contrast
  float brightness = 0.35 + 0.65 * (0.4 + 0.6 * waveNorm);
  vec3 col = baseCol * brightness;

  // add foam color on crests (additive highlight for sparkling)
  col = mix(col, colorC.rgb, foamTip * 0.90);
  col += colorC.rgb * foam * 0.20;

  // final punch contrast and clamp
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
