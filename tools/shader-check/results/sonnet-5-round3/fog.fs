/*{
  "DESCRIPTION": "Spooky green fog drifting across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.15, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.8, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.0 },
    { "NAME": "murk", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float total = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    total += noise(p) * amp;
    p *= 2.0;
    amp *= 0.5;
  }
  return total;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.15;

  vec2 p = uv * scale;
  if (isLine) {
    p = vec2(uv.x * scale * 2.0, 0.5);
  }

  vec2 driftA = vec2(t, isLine ? 0.0 : t * 0.35);
  vec2 driftB = vec2(-t * 0.6, isLine ? 0.0 : t * 0.2);

  float f1 = fbm(p + driftA);
  float f2 = fbm(p * 1.7 - driftB + 4.2);
  float fog = f1 * 0.6 + f2 * 0.4;

  fog = smoothstep(0.2, 0.85, fog);
  fog = mix(fog, fog * fog, murk);

  float glow = 0.5 + 0.5 * sin(t * 2.0 + f1 * 6.28318);
  fog = clamp(fog + glow * 0.05, 0.0, 1.0);

  vec3 col = mix(colorA.rgb, colorB.rgb, fog);
  col = max(col, colorA.rgb * 0.4);

  gl_FragColor = vec4(col, 1.0);
}
