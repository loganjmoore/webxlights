/*{
  "DESCRIPTION": "Raindrops fall and spawn expanding ripple rings in two colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.3, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.6, 0.8, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "dropCount", "TYPE": "long", "MIN": 1, "MAX": 8, "DEFAULT": 5 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 1.5 }
  ]
}*/

float hash1(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.35;
  float total = 0.0;

  for (int i = 0; i < 8; i++) {
    if (i >= int(dropCount)) break;
    float fi = float(i);

    // each drop has its own cycle offset and lifetime
    float cycle = 2.2 + hash1(fi * 3.1 + 1.0) * 1.4;
    float phase = fract(t / cycle + hash1(fi * 7.7));
    float age = phase * cycle;

    // drop center: spread across x, and along y if tall enough
    vec2 center;
    center.x = hash1(fi * 5.3 + 2.0);
    if (isLine) {
      center.y = 0.5;
    } else {
      center.y = hash1(fi * 9.1 + 4.0);
    }

    vec2 d = uv - center;
    // keep ripple circular even on wide/short canvases
    float aspect = max(RENDERSIZE.x / max(RENDERSIZE.y, 1.0), 1.0);
    d.x /= isLine ? 1.0 : aspect;

    float dist = length(d);

    float radius = age * 0.6;
    float ringWidth = 0.035 / sharpness;
    float ring = 1.0 - smoothstep(0.0, ringWidth, abs(dist - radius));

    // fade ripple in and out over its life
    float envelope = smoothstep(0.0, 0.15, phase) * (1.0 - smoothstep(0.5, 1.0, phase));

    total += ring * envelope;
  }

  total = clamp(total, 0.0, 1.0);
  vec3 col = mix(colorA.rgb * 0.15, colorB.rgb, total);

  gl_FragColor = vec4(col, 1.0);
}
