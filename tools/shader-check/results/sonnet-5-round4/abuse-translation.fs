/*{
  "DESCRIPTION": "Sparkling multicolor bands sweep across the display like festive greetings travelling around the world",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.8, 0.2, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bands", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 10.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // Ten languages, ten travelling bands of light - one per "translation".
  float axis = (RENDERSIZE.y < 2.0) ? uv.x : uv.x;

  float t = TIME * speed * 0.3;
  float pos = fract(axis - t);
  float idx = floor(pos * bands);
  float cellFrac = fract(pos * bands);

  // Cycle through three colours across the bands, like flags of different nations.
  float colorPick = mod(idx, 3.0);
  vec3 col = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 1.0, colorPick));
  col = mix(col, colorC.rgb, step(1.5, colorPick));

  // Soft glowing edge per band so it reads as light, not a hard stripe.
  float glow = smoothstep(0.0, 0.15, cellFrac) * smoothstep(1.0, 0.85, cellFrac);
  glow = clamp(glow + 0.35, 0.0, 1.0);

  // Gentle vertical brightness pulse to suggest twinkling greetings, even on 1px tall rows.
  float twinkle = 0.85 + 0.15 * sin(TIME * speed * 2.0 + idx * 1.7);

  vec3 finalColor = col * glow * twinkle;
  gl_FragColor = vec4(finalColor, 1.0);
}
