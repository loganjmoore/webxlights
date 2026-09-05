/*{
  "DESCRIPTION": "Red white and blue fireworks bursting over the display",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.2, 0.4, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "size", "TYPE": "float", "MIN": 0.3, "MAX": 1.2, "DEFAULT": 0.85 }
  ]
}*/
float hash(float n) {
  return fract(sin(n * 91.7) * 43758.5453);
}
vec3 pick(float i) {
  if (i < 0.5) return colorA.rgb;
  if (i < 1.5) return colorB.rgb;
  return colorC.rgb;
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(min(aspect, 3.0), 1.0);
  // 100 * 0.5 is whole: a new burst every two seconds at speed 1, wrapping cleanly.
  float t = mod(TIME * speed, 100.0) * 0.5;
  vec3 col = vec3(0.0);
  // Three bursts in flight at once, each a third of a cycle apart, each at its own spot.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cycle = floor(t + fi / 3.0);
    float age = fract(t + fi / 3.0);
    float h = hash(cycle * 3.0 + fi);
    vec2 centre = isLine ? vec2((h - 0.5) * min(aspect, 3.0) * 0.8, 0.0) : vec2((h - 0.5) * 1.2, (hash(cycle * 7.0 + fi) - 0.5) * 0.8);
    float d = length(p - centre);
    // A shell that expands fast then hangs, and a glow inside it that fades as it spreads.
    float radius = size * 0.6 * sqrt(age);
    float shell = smoothstep(0.11, 0.0, abs(d - radius)) * (1.0 - age * 0.7);
    float glow = smoothstep(radius, radius * 0.2, d) * (1.0 - age) * (1.0 - age) * 0.9;
    // Sparks: the shell breaks into dots as it ages.
    float a = atan(p.y - centre.y, p.x - centre.x);
    float spark = isLine ? 1.0 : mix(1.0, 0.5 + 0.5 * cos(a * 12.0), age);
    col = max(col, pick(mod(cycle + fi, 3.0)) * (shell * spark + glow));
  }
  // A deep blue sky so the display is never empty between bursts.
  col = max(col, colorC.rgb * 0.3);
  gl_FragColor = vec4(col, 1.0);
}
