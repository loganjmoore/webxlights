/*{
  "DESCRIPTION": "Random twinkling sparkles over a solid color",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.2, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.4 },
    { "NAME": "size", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 0.8 }
  ]
}*/
float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec2 hash22(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)))) * 43758.5453123);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = (RENDERSIZE.y < 2.0);
  vec2 coord = uv;
  if (isLine) {
    coord.y = 0.5;
  }

  // scale controls how many cells across the canvas
  float aspect = RENDERSIZE.x / max(1.0, RENDERSIZE.y);
  float baseScale = mix(8.0, 80.0, density);
  vec2 gridScale = isLine ? vec2(baseScale, 1.0) : vec2(baseScale * aspect, baseScale);

  vec2 grid = coord * gridScale;
  vec2 cell = floor(grid);
  vec2 f = fract(grid);

  // drifting seed so sparkles slowly shift with time along X
  vec2 seedCell = cell + vec2(TIME * speed * 0.07, 0.0);

  vec2 rnd = hash22(seedCell);
  vec2 center = rnd;

  // decide which cells are eligible for a sparkle based on density
  float cellHash = hash12(cell);
  float allow = 1.0 - step(density, cellHash); // 1.0 if cellHash < density

  // temporal twinkle per cell, continuous and smooth
  float phase = sin((TIME * speed * 6.28318) + hash12(cell) * 12.345);
  float twink = smoothstep(0.25, 0.95, 0.5 + 0.5 * phase);

  // radius in cell-local units (0..1)
  float radius = clamp(size * 0.12, 0.02, 0.6);

  // distance from the random center in the cell
  float dist = length(f - center);

  // intensity falloff (soft round sparkles)
  float fall = max(0.0, 1.0 - dist / max(0.0001, radius));
  float intensity = pow(fall, 2.0) * twink * allow;

  // add a small secondary glint for very bright moments
  float glint = pow(max(0.0, 1.0 - abs(dist - radius * 0.2) / (radius * 0.15)), 6.0) * pow(twink, 12.0);
  intensity += glint * allow * 0.6;

  // final color: base color with additive sparkling highlights
  vec3 base = colorA.rgb;
  vec3 spark = colorB.rgb * intensity * 1.6;
  vec3 col = clamp(base + spark, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
