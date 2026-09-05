/*{
  "DESCRIPTION": "A drop of coloured ink blooming outward through water, over and over",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.9, 0.1, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.5, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.8, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 }
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
  float ax = min(aspect, 3.0);
  vec2 p = (uv - 0.5) * vec2(ax, 1.0);
  // 100 * 0.25 is whole: a new drop every four seconds at speed 1, wrapping cleanly.
  float t = mod(TIME * speed, 100.0) * 0.25;
  float cycle = floor(t);
  float age = fract(t);
  float ts = mod(TIME * speed, 62.831853);
  // The last bloom has filled the water; the new one blooms over it from a fresh spot.
  vec3 col = pick(mod(cycle, 3.0)) * 0.85;
  float h = hash(cycle * 5.0 + 1.0);
  vec2 centre = isLine ? vec2((h - 0.5) * ax * 0.8, 0.0) : vec2((h - 0.5) * 1.2, (hash(cycle * 9.0 + 2.0) - 0.5) * 0.8);
  vec2 d = p - centre;
  float a = atan(d.y, d.x);
  // The edge of the bloom is ragged and turning, the way ink feathers into water.
  float ragged = 1.0 + 0.18 * sin(a * 5.0 + ts * 0.7) + 0.1 * sin(a * 11.0 - ts * 1.1);
  // Grows fast at first and keeps growing until the cycle ends, so it is never just sitting.
  float radius = (0.15 + 1.25 * sqrt(age)) * ragged;
  float inside = smoothstep(radius, radius - 0.12, length(d));
  // The bloom's rim is the brightest part; behind it the ink settles a little.
  float rim = smoothstep(0.25, 0.0, abs(length(d) - radius)) * (1.0 - age * 0.5);
  vec3 ink = pick(mod(cycle + 1.0, 3.0));
  col = mix(col, ink * 0.85, inside);
  col = mix(col, ink, rim);
  gl_FragColor = vec4(col, 1.0);
}
