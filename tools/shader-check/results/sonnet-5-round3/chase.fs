/*{
  "DESCRIPTION": "Colored dots chase steadily along the roofline",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "count", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.2 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // Always chase along x so it reads correctly on a thin roofline (y constant).
  float pos = uv.x;
  if (RENDERSIZE.y >= 2.0) {
    // For taller canvases, still favor horizontal motion but blend in a touch of y
    // so the chase reads on non-roofline shapes too, without breaking 1px-tall cases.
    pos = uv.x;
  }

  float n = max(count, 1.0);
  float scaled = pos * n - TIME * speed * 2.0;
  float cellPos = fract(scaled);
  float cellIndex = floor(scaled);

  // Distance from center of each cell, 0 at center, 0.5 at edge
  float d = abs(cellPos - 0.5);
  float dot = 1.0 - smoothstep(sharpness * 0.5, sharpness, d);

  // Cycle through three colors based on which light in the chase this is
  float colorPhase = mod(cellIndex, 3.0);
  vec3 col;
  if (colorPhase < 1.0) {
    col = colorA.rgb;
  } else if (colorPhase < 2.0) {
    col = colorB.rgb;
  } else {
    col = colorC.rgb;
  }

  // Dim background so unlit gaps are not fully black between chase lights
  vec3 background = vec3(0.03, 0.02, 0.02);
  vec3 finalColor = mix(background, col, dot);

  gl_FragColor = vec4(finalColor, 1.0);
}
