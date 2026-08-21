/*{
  "DESCRIPTION": "Bursts of colored fireworks expanding and fading across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.2, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.2, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.3, 0.6, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bursts", "TYPE": "long", "MIN": 1, "MAX": 8, "DEFAULT": 5 }
  ]
}*/

float hash11(float n) {
  return fract(sin(n) * 43758.5453123);
}

vec3 pickColor(float idx) {
  float m = mod(idx, 3.0);
  if (m < 1.0) return colorA.rgb;
  if (m < 2.0) return colorB.rgb;
  return colorC.rgb;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  vec3 col = vec3(0.0);

  const int MAXB = 8;
  for (int i = 0; i < MAXB; i++) {
    if (i >= int(bursts)) break;

    float fi = float(i);
    float cycle = 2.2 - min(speed, 4.0) * 0.25;
    cycle = max(cycle, 0.4);

    float seedT = hash11(fi * 17.13);
    float t = mod(TIME * speed * 0.5 + fi * 1.7 + seedT * 3.0, cycle) / cycle;

    float cx = fract(hash11(fi * 3.71) + fi * 0.37);
    float cy = fract(hash11(fi * 9.13 + 1.0));

    vec2 center = isFlat ? vec2(cx, 0.5) : vec2(cx, 0.15 + cy * 0.7);

    float radius = t * (isFlat ? 0.5 : 0.55);
    float fade = smoothstep(1.0, 0.0, t);

    vec2 diff = uv - center;
    if (isFlat) {
      diff.y *= 0.0;
    } else {
      diff.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
    }

    float dist = length(diff);
    float ring = smoothstep(radius, radius - 0.05, dist) *
                 smoothstep(radius - 0.15, radius, dist);

    float sparkle = 0.5 + 0.5 * sin(atan(diff.y, diff.x) * 10.0 + fi * 5.0 + TIME * 2.0);
    float intensity = ring * fade * (0.6 + 0.4 * sparkle);

    vec3 burstColor = pickColor(fi + floor(TIME * speed * 0.2 + fi));
    col += burstColor * intensity * 1.4;
  }

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
