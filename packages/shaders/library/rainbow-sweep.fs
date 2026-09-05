/*{
  "DESCRIPTION": "A smooth saturated rainbow sweeping steadily across the display",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bands", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "diagonal", "TYPE": "bool", "DEFAULT": true }
  ]
}*/
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float t = mod(TIME * speed, 100.0);
  float d = (isLine || !diagonal) ? uv.x : (uv.x * aspect + uv.y) / (aspect + 1.0);
  // 100 * 0.25 is whole, so the hue never jumps when the clock wraps.
  float hue = fract(d * bands - t * 0.25);
  gl_FragColor = vec4(hsv2rgb(vec3(hue, 1.0, 1.0)), 1.0);
}
