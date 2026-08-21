/*{
  "DESCRIPTION": "gently falling snow made of soft drifting dots over a dark background",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "skyColor", "TYPE": "color", "DEFAULT": [0.02, 0.02, 0.08, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 4.0 },
    { "NAME": "flakeSize", "TYPE": "float", "MIN": 0.05, "MAX": 0.4, "DEFAULT": 0.18 }
  ]
}*/

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  vec3 col = skyColor.rgb;

  int layers = int(clamp(density, 1.0, 8.0));

  for (int i = 0; i < 8; i++) {
    if (i >= layers) break;

    float fi = float(i);
    float seedX = hash(fi * 3.17 + 1.0);
    float seedPhase = hash(fi * 5.31 + 2.0);
    float speedMul = 0.35 + 0.65 * hash(fi * 7.77 + 3.0);
    float laneSize = flakeSize * (0.6 + 0.4 * hash(fi * 9.13 + 4.0));

    float fall = fract(TIME * speed * 0.08 * speedMul + seedPhase);

    float wob = sin(TIME * speed * 0.6 + fi * 12.9) * 0.03;

    vec2 pos;
    if (isFlat) {
      pos.x = fract(seedX + fall + wob);
      pos.y = 0.5;
    } else {
      pos.x = fract(seedX + wob);
      pos.y = fall;
    }

    vec2 d = uv - pos;
    d.x = min(abs(d.x), 1.0 - abs(d.x));
    if (!isFlat) {
      d.y = min(abs(d.y), 1.0 - abs(d.y));
    }

    float dist = length(d);
    float flake = smoothstep(laneSize, laneSize * 0.15, dist);

    col = mix(col, snowColor.rgb, flake);
  }

  gl_FragColor = vec4(col, 1.0);
}
