/*{
  "DESCRIPTION": "A kaleidoscope turning slowly, mirrored wedges of bright colour",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.4, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.8, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "wedges", "TYPE": "float", "MIN": 3.0, "MAX": 8.0, "DEFAULT": 6.0 }
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
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float t = mod(TIME * speed, 62.831853);
  float r;
  float a;
  if (isLine) {
    // A line shows one mirrored wedge unrolled: the pattern reflects about the middle.
    r = abs(uv.x - 0.5) * 2.0;
    a = 0.4 + 0.3 * sin(t * 0.3);
  } else {
    r = length(p) * 1.4;
    // Fold the angle into one wedge and mirror it: that is all a kaleidoscope is.
    float wedge = 6.2831853 / wedges;
    a = mod(atan(p.y, p.x) + t * 0.2, wedge);
    a = abs(a - wedge * 0.5) / wedge;
  }
  // Inside the wedge, big cells of flat colour that drift; the mirror does the rest.
  float cx = floor(r * 2.0 + sin(t * 0.4) * 0.5);
  float cy = floor(a * 2.0 + t * 0.3);
  float which = mod(cx * 2.0 + cy, 3.0);
  // Thin dark lines between cells, like the glass edges.
  float fx = fract(r * 2.0 + sin(t * 0.4) * 0.5);
  float fy = fract(a * 2.0 + t * 0.3);
  float aa = 2.0 / max(RENDERSIZE.x, 8.0);
  float seam = smoothstep(0.0, aa, fx) * smoothstep(1.0, 1.0 - aa, fx) * smoothstep(0.0, aa, fy) * smoothstep(1.0, 1.0 - aa, fy);
  vec3 col = pick(which) * (0.25 + 0.75 * seam);
  gl_FragColor = vec4(col, 1.0);
}
