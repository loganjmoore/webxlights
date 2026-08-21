/*{
  "DESCRIPTION": "Rippling raindrop rings expand and fade across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.3, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.6, 0.85, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 4.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/

float hash(float n) {
  return fract(sin(n * 43758.5453123) * 43758.5453123);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;

  vec2 p = uv;
  if (isLine) {
    p = vec2(uv.x, 0.5);
  }

  float total = 0.0;
  int drops = int(density);

  for (int i = 0; i < 8; i++) {
    if (i >= drops) break;
    float fi = float(i);

    float cycle = 3.0 / max(speed, 0.001);
    float offset = hash(fi * 7.13) * cycle;
    float t = mod(TIME + offset, cycle);

    float cx = hash(fi * 3.71 + 1.0);
    float cy = hash(fi * 5.29 + 2.0);
    vec2 center = isLine ? vec2(cx, 0.5) : vec2(cx, cy);

    float dist = length(p - center);
    if (isLine) {
      dist = abs(p.x - center.x);
    }

    float radius = t * 0.5;
    float ring = abs(dist - radius);
    float width = 0.02 + 0.02 / sharpness;
    float fade = 1.0 - smoothstep(0.0, 0.5, radius);
    float amt = (1.0 - smoothstep(0.0, width, ring)) * fade;

    total += amt;
  }

  total = clamp(total, 0.0, 1.0);
  vec3 col = mix(colorA.rgb * 0.15, colorB.rgb, total);

  gl_FragColor = vec4(col, 1.0);
}
