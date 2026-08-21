/*{
  "DESCRIPTION": "Gently falling snow made of soft drifting dots over a dark background",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "snowColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "skyColor", "TYPE": "color", "DEFAULT": [0.02, 0.02, 0.08, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 1.0, "MAX": 6.0, "DEFAULT": 3.0 },
    { "NAME": "flakeSize", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.2 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float flakeLayer(vec2 uv, float cells, float t, float seedOffset, float sizeMul) {
  vec2 guv = uv * cells;
  guv.x += sin(t * 0.5 + seedOffset) * 0.5;
  vec2 cellId = floor(guv);
  vec2 f = fract(guv);

  float best = 0.0;
  for (int i = -1; i <= 1; i++) {
    vec2 neighbor = vec2(float(i), 0.0);
    vec2 id = cellId + neighbor;
    float h = hash(id + seedOffset);
    float h2 = hash(id + seedOffset + 17.0);
    float drift = sin(t * 0.3 + h * 6.28) * 0.3;
    vec2 center = vec2(0.5 + drift, fract(h + t * 0.15 * (0.5 + h2)));
    vec2 diff = (f - neighbor) - center;
    diff.x *= 1.6;
    float d = length(diff);
    float r = flakeSize * sizeMul * (0.5 + h2 * 0.5);
    float flake = smoothstep(r, r * 0.2, d);
    best = max(best, flake);
  }
  return best;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * speed;

  bool isFlat = RENDERSIZE.y < 2.0;
  vec2 motionUV = uv;
  if (isFlat) {
    motionUV = vec2(uv.x, fract(uv.x * 3.0 + sin(TIME * 0.1) * 0.1));
  }

  float snow = 0.0;
  snow = max(snow, flakeLayer(motionUV, density, t * 1.0, 0.0, 1.0));
  snow = max(snow, flakeLayer(motionUV, density * 1.7, t * 1.6, 5.3, 0.6));
  snow = max(snow, flakeLayer(motionUV, density * 2.4, t * 2.2, 11.1, 0.4));

  vec3 col = mix(skyColor.rgb, snowColor.rgb, snow);
  gl_FragColor = vec4(col, 1.0);
}
