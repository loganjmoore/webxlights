/*{
  "DESCRIPTION": "Red and white candy cane stripes spiralling steadily along the display",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.05, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "stripes", "TYPE": "float", "MIN": 2.0, "MAX": 12.0, "DEFAULT": 5.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // Wrapped so the scroll never loses precision; 100 * 0.5 is whole, so the wrap is seamless.
  float t = mod(TIME * speed, 100.0);
  // Diagonal on a matrix, straight along a line: the stripe still travels the same way.
  float d = isLine ? uv.x : (uv.x * aspect + uv.y) / (aspect + 1.0);
  float v = fract(d * stripes - t * 0.5);
  // 0 in the middle of a stripe, 1 at its edges; a pixel and a half of softening so neighbouring
  // bulbs on a roofline never sit at opposite brightness.
  float s = abs(v - 0.5) * 2.0;
  float aa = 1.5 * stripes / max(RENDERSIZE.x, 8.0);
  float band = smoothstep(0.5 + aa, 0.5 - aa, s);
  gl_FragColor = vec4(mix(colorB.rgb, colorA.rgb, band), 1.0);
}
