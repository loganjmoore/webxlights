/*{
  "DESCRIPTION": "Orange and purple breathing slowly in and out, spooky but always bright enough to see",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.45, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.55, 0.05, 0.9, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "blobs", "TYPE": "float", "MIN": 1.0, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0);
  float t = mod(TIME * speed, 62.831853);
  // Two slow breaths, out of phase: orange swells while purple recedes, then the other way.
  // Whole tenths, so the wrap at 20 pi is seamless.
  float breathA = 0.5 + 0.5 * sin(t * 0.5);
  float breathB = 0.5 + 0.5 * sin(t * 0.5 + 3.14159);
  // Each colour owns soft pools that grow and shrink with its breath.
  float x = isLine ? uv.x * 4.0 : p.x * 2.0;
  float y = isLine ? 0.0 : p.y * 2.0;
  float poolA = 0.5 + 0.5 * sin(x * blobs + t * 0.3) * cos(y * blobs - t * 0.2);
  float poolB = 0.5 + 0.5 * sin(x * blobs * 0.8 - t * 0.25 + 2.0) * cos(y * blobs * 1.1 + t * 0.3);
  float a = smoothstep(0.35, 0.65, poolA * (0.4 + 0.8 * breathA));
  float b = smoothstep(0.35, 0.65, poolB * (0.4 + 0.8 * breathB));
  // Whichever is stronger wins the pixel, flat; the floor keeps it always visible.
  vec3 col = mix(colorB.rgb, colorA.rgb, step(b, a));
  float lit = 0.45 + 0.55 * max(a, b);
  gl_FragColor = vec4(col * lit, 1.0);
}
