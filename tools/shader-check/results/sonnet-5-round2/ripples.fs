/*{
  "DESCRIPTION": "Rippling rings expand outward like raindrops on a dark surface",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.3, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.6, 0.8, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "drops", "TYPE": "long", "MIN": 1, "MAX": 8, "DEFAULT": 5 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.5 }
  ]
}*/

float hash1(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool flat1D = RENDERSIZE.y < 2.0;

  vec2 p = uv * 2.0 - 1.0;
  p.x *= max(RENDERSIZE.x / max(RENDERSIZE.y, 1.0), 1.0);

  vec3 col = vec3(0.0);
  float period = 3.0;

  for (int i = 0; i < 8; i++) {
    if (i >= drops) break;
    float fi = float(i);
    float seed = fi * 17.37;

    float cx = hash1(seed) * 2.0 - 1.0;
    float cy = hash1(seed + 3.14) * 2.0 - 1.0;
    vec2 center = flat1D ? vec2(cx, 0.0) : vec2(cx, cy);

    float t = mod(TIME * speed * 0.35 + hash1(seed + 7.0) * period, period);

    float dist;
    if (flat1D) {
      dist = abs(p.x - center.x);
    } else {
      dist = length(p - center);
    }

    float radius = t;
    float ring = abs(dist - radius);
    float width = 0.05 + 0.05 * (t / period);
    float intensity = 1.0 - smoothstep(0.0, width * sharpness, ring);

    float fade = 1.0 - smoothstep(0.0, period, t);
    intensity *= fade;

    vec3 dropColor = mix(colorA.rgb, colorB.rgb, hash1(seed + 1.5));
    col += dropColor * intensity;
  }

  col = clamp(col, 0.0, 1.0);
  vec3 bg = mix(colorA.rgb, colorB.rgb, 0.5) * 0.05;
  col = max(col, bg);

  gl_FragColor = vec4(col, 1.0);
}
