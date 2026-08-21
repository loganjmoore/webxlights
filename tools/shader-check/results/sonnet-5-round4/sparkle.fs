/*{
  "DESCRIPTION": "Random sparkles twinkle over a solid background colour",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.05, 0.3, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.35 },
    { "NAME": "sparkleSize", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = isf_FragNormCoord;

  float cellCount = mix(8.0, 40.0, sparkleSize == 0.0 ? 1.0 : (1.0 - sparkleSize));
  cellCount = clamp(cellCount, 8.0, 40.0);

  vec2 gridUV = uv * cellCount;
  vec2 cell = floor(gridUV);
  vec2 local = fract(gridUV) - 0.5;

  float timeStep = floor(TIME * speed * 2.0);

  float r = hash(cell + timeStep * 0.137);
  float isLit = step(1.0 - density, r);

  float twinklePhase = fract(TIME * speed * 1.5 + r * 6.2831);
  float twinkle = sin(twinklePhase * 3.14159265);
  twinkle = max(twinkle, 0.0);

  float dist = length(local);
  float dotShape = smoothstep(0.35, 0.05, dist);

  float sparkle = isLit * twinkle * dotShape;

  vec3 col = mix(colorA.rgb, colorB.rgb, clamp(sparkle, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
