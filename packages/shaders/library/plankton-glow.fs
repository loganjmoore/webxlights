/*{
  "DESCRIPTION": "Bioluminescent plankton lighting up in soft waves through dark water",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.2, 1.0, 0.9, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.05, 0.15, 0.5, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // Specks two bulbs across on a matrix, so they read as plankton rather than as static.
  float scale = max(1.0, min(RENDERSIZE.x, max(RENDERSIZE.y, 1.0)) / 32.0);
  vec2 cell = floor(uv * RENDERSIZE / (2.0 * scale));
  float t = mod(TIME * speed, 62.831853);
  float h = hash(cell);
  float h2 = hash(cell + 31.0);
  // A wave of light rolls through the water; each speck lights as the wave passes it, a little
  // out of step with its neighbours, and dims again behind it.
  float x = uv.x * min(aspect, 3.0);
  float y = isLine ? 0.0 : uv.y;
  float wave = sin(x * 3.0 + y * 2.0 - t * 1.2 + h2 * 1.5);
  float glow = pow(0.5 + 0.5 * wave, 3.0);
  float speck = step(1.0 - density, h);
  // The water itself: deep, with a slow swell of light so it never reads as off.
  float swell = 0.4 + 0.2 * sin(x * 2.0 - t * 0.5) * sin(y * 3.0 + t * 0.3);
  vec3 col = colorB.rgb * swell;
  col = mix(col, colorA.rgb, speck * glow);
  gl_FragColor = vec4(col, 1.0);
}
