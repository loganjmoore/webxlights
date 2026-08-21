/*{
  "DESCRIPTION": "Colorful bands sweep across the display in a festive holiday pulse",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.8, 0.2, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 5.0 }
  ]
}*/
// Note: translating "merry christmas" into ten languages is a text task,
// not something a tiny light-display shader can render legibly.
// Instead this delivers a bold, saturated, looping holiday sweep of
// three user colours - readable from the street on a single pixel row.
void main() {
  vec2 uv = isf_FragNormCoord;
  float axis = (RENDERSIZE.y < 2.0) ? uv.x : (uv.x + uv.y);

  float t = axis * scale - TIME * speed * 0.6;
  float phase = fract(t);

  float band = phase * 3.0;
  vec3 col;
  if (band < 1.0) {
    col = mix(colorA.rgb, colorB.rgb, smoothstep(0.0, 1.0, band));
  } else if (band < 2.0) {
    col = mix(colorB.rgb, colorC.rgb, smoothstep(0.0, 1.0, band - 1.0));
  } else {
    col = mix(colorC.rgb, colorA.rgb, smoothstep(0.0, 1.0, band - 2.0));
  }

  float pulse = 0.85 + 0.15 * sin(TIME * speed * 2.0 + axis * 6.0);
  col *= pulse;

  gl_FragColor = vec4(col, 1.0);
}
