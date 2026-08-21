/*{
  "DESCRIPTION": "Warm flickering candle glow across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.15, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "flicker", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * speed;

  // several offset sine waves make an irregular, non-repeating-feeling flicker
  float n = sin(t * 3.1) * 0.35
          + sin(t * 7.7 + 1.3) * 0.25
          + sin(t * 13.3 + 3.7) * 0.15
          + sin(t * 1.9 + 5.1) * 0.25;
  n = n * 0.5 + 0.5;

  // slow base breathing so it never feels static, layered with the fast flicker
  float breathe = 0.85 + 0.15 * sin(t * 0.6);
  float brightness = mix(1.0, n, flicker) * breathe;
  brightness = clamp(brightness, 0.15, 1.0);

  // subtle warm gradient across the canvas so a roofline still shows variation
  float pos = (RENDERSIZE.y < 2.0) ? uv.x : (uv.x * 0.5 + uv.y * 0.5);
  float mixAmt = clamp(pos * 0.6 + (1.0 - brightness) * 0.8, 0.0, 1.0);

  vec3 col = mix(colorA.rgb, colorB.rgb, mixAmt) * brightness;

  gl_FragColor = vec4(col, 1.0);
}
