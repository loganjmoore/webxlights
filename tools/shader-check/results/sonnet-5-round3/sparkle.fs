/*{
  "DESCRIPTION": "Random sparkles twinkle over a solid background colour",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.8, 0.0, 0.05, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.9, 1.0] },
    { "NAME": "density", "TYPE": "float", "MIN": 2.0, "MAX": 40.0, "DEFAULT": 16.0 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.5, "MAX": 0.99, "DEFAULT": 0.85 }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;

  // work in a cell grid so sparkles are large blobs, not thin noise
  float cellsX = density;
  float cellsY = RENDERSIZE.y < 2.0 ? 1.0 : max(1.0, density * (RENDERSIZE.y / max(RENDERSIZE.x, 1.0)));

  vec2 grid = vec2(cellsX, cellsY);
  vec2 cell = floor(uv * grid);

  // each cell gets its own twinkle phase and random offset so sparkles pop in and out
  float r = hash(cell);
  float t = TIME * speed * 0.6 + r * 6.2831853;
  float twinkle = sin(t) * 0.5 + 0.5;

  // random chance gate so not every cell sparkles at once
  float gate = step(0.65, r + 0.3 * sin(TIME * speed * 0.2 + r * 10.0));

  float spark = smoothstep(sharpness, 1.0, twinkle) * gate;

  vec3 col = mix(colorA.rgb, colorB.rgb, spark);
  gl_FragColor = vec4(col, 1.0);
}
