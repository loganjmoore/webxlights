/*{
  "DESCRIPTION": "A hard diagonal edge wiping one colour across the display and then the next",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.9, 0.2, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.1, 0.4, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
  ]
}*/
vec3 pick(float i) {
  if (i < 0.5) return colorA.rgb;
  if (i < 1.5) return colorB.rgb;
  return colorC.rgb;
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // 100 * 0.25 is whole, so the wipe never jumps when the clock wraps.
  float t = mod(TIME * speed, 100.0) * 0.25;
  // The diagonal: on a line, just the position along it.
  float d = isLine ? uv.x : (uv.x * aspect + uv.y) / (aspect + 1.0);
  // Each wipe crosses the display once per second at speed 1; the colour that has arrived and
  // the one still leaving are the two flat sides of one crisp edge.
  float cycle = floor(t);
  float front = fract(t) * 1.2 - 0.1;
  // Crisp: under a pixel of softening on a matrix, a little more on a line of bulbs.
  float aa = (isLine ? 2.0 : 0.8) / max(RENDERSIZE.x, 8.0);
  float arrived = smoothstep(front + aa, front - aa, d);
  vec3 col = mix(pick(mod(cycle, 3.0)), pick(mod(cycle + 1.0, 3.0)), arrived);
  // A bright hairline on the edge itself, so the wipe reads as a wipe and not a colour change.
  float edge = smoothstep(aa * 3.0, 0.0, abs(d - front));
  col = mix(col, vec3(1.0), edge * 0.6);
  gl_FragColor = vec4(col, 1.0);
}
